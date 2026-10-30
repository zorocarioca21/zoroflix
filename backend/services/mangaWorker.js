import axios from 'axios';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { getTelegramClient } from '../telegram.js';
import { CustomFile } from 'telegram/client/uploads.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MangaQueueWorker {
    constructor() {
        this.db = null;
        this.isRunning = false; // Controle de pausa/início da fila de downloads
        this.isProcessing = false;
        this.currentJob = null; // { manga_id, manga_title, chapter_number, progress, step }
        this.stats = {
            totalPending: 0,
            totalCompleted: 0,
            totalError: 0
        };
        this.loopTimeout = null;

        // Auto Importer / Auto Sync
        this.autoImporter = {
            isEnabled: false,
            isIngesting: false,
            primaryLanguage: 'pt-br',
            secondaryLanguage: 'en',
            orderBy: 'followedCount',
            delaySeconds: 3,
            currentOffset: 0,
            autoEnqueueChapters: 1,
            maxChaptersPerManga: 0,
            statusText: 'Parado',
            importedCount: 0,
            loopTimeout: null
        };
    }

    async init(database) {
        this.db = database;
        console.log('[Manga Worker] Serviço de fila de mangás inicializado.');

        // 1. Reseta quaisquer capítulos que ficaram travados em 'downloading' antes do restart para 'pending'
        try {
            const resReset = await this.db.run("UPDATE manga_download_queue SET status = 'pending' WHERE status = 'downloading'");
            if (resReset.changes > 0) {
                console.log(`[Manga Worker] 🔄 ${resReset.changes} capítulos interrompidos foram recuperados para a fila.`);
            }
        } catch (eReset) {
            console.error('[Manga Worker] Erro ao recuperar capítulos interrompidos:', eReset.message);
        }

        await this.loadAutoImporterConfig();
        await this.updateStats();

        // 2. Se houver QUALQUER capítulo pendente na fila, inicia o download automaticamente!
        if (this.stats.totalPending > 0) {
            console.log(`[Manga Worker] 🚀 Retomando downloads automaticamente (${this.stats.totalPending} pendentes)...`);
            this.start();
        }

        // 3. Se o auto-ingestor estava ativo antes da reinicialização, retoma também
        if (this.autoImporter.isEnabled) {
            this.startAutoImporter();
        }
    }

    async loadAutoImporterConfig() {
        if (!this.db) return;
        try {
            const cfg = await this.db.get("SELECT * FROM manga_auto_importer_config WHERE id = 1");
            if (cfg) {
                this.autoImporter.isEnabled = !!cfg.is_enabled;
                this.autoImporter.primaryLanguage = cfg.primary_language || 'pt-br';
                this.autoImporter.secondaryLanguage = cfg.secondary_language || 'en';
                this.autoImporter.orderBy = cfg.order_by || 'followedCount';
                this.autoImporter.delaySeconds = cfg.delay_seconds || 3;
                this.autoImporter.currentOffset = cfg.current_offset || 0;
                this.autoImporter.autoEnqueueChapters = cfg.auto_enqueue_chapters ?? 1;
                this.autoImporter.maxChaptersPerManga = cfg.max_chapters_per_manga || 0;
            }
        } catch (e) {
            console.error('[Manga Worker] Erro ao carregar config de auto-ingestor:', e.message);
        }
    }

    async saveAutoImporterConfig(updates = {}) {
        if (!this.db) return;
        Object.assign(this.autoImporter, updates);
        try {
            await this.db.run(`
                UPDATE manga_auto_importer_config SET
                    is_enabled = ?,
                    primary_language = ?,
                    secondary_language = ?,
                    order_by = ?,
                    delay_seconds = ?,
                    current_offset = ?,
                    auto_enqueue_chapters = ?,
                    max_chapters_per_manga = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `, [
                this.autoImporter.isEnabled ? 1 : 0,
                this.autoImporter.primaryLanguage,
                this.autoImporter.secondaryLanguage,
                this.autoImporter.orderBy,
                this.autoImporter.delaySeconds,
                this.autoImporter.currentOffset,
                this.autoImporter.autoEnqueueChapters ? 1 : 0,
                this.autoImporter.maxChaptersPerManga
            ]);
        } catch (e) {
            console.error('[Manga Worker] Erro ao salvar config de auto-ingestor:', e.message);
        }
    }

    async updateStats() {
        if (!this.db) return;
        try {
            const counts = await this.db.all(`
                SELECT status, COUNT(*) as count 
                FROM manga_download_queue 
                GROUP BY status
            `);
            let pending = 0, completed = 0, error = 0;
            counts.forEach(row => {
                if (row.status === 'pending') pending = row.count;
                if (row.status === 'completed') completed = row.count;
                if (row.status === 'error') error = row.count;
            });
            this.stats.totalPending = pending;
            this.stats.totalCompleted = completed;
            this.stats.totalError = error;
        } catch (e) {
            console.error('[Manga Worker] Erro ao atualizar stats:', e.message);
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            isProcessing: this.isProcessing,
            currentJob: this.currentJob,
            stats: this.stats,
            autoImporter: {
                isEnabled: this.autoImporter.isEnabled,
                isIngesting: this.autoImporter.isIngesting,
                primaryLanguage: this.autoImporter.primaryLanguage,
                secondaryLanguage: this.autoImporter.secondaryLanguage,
                orderBy: this.autoImporter.orderBy,
                delaySeconds: this.autoImporter.delaySeconds,
                currentOffset: this.autoImporter.currentOffset,
                autoEnqueueChapters: this.autoImporter.autoEnqueueChapters,
                maxChaptersPerManga: this.autoImporter.maxChaptersPerManga,
                statusText: this.autoImporter.statusText,
                importedCount: this.autoImporter.importedCount
            }
        };
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[Manga Worker] Fila de download INICIADA pelo administrador.');
        this.processNext();
    }

    pause() {
        this.isRunning = false;
        console.log('[Manga Worker] Fila de download PAUSADA pelo administrador.');
        if (this.loopTimeout) clearTimeout(this.loopTimeout);
    }

    // Controle do Auto Importer
    async startAutoImporter() {
        this.autoImporter.isEnabled = true;
        await this.saveAutoImporterConfig({ is_enabled: true });
        console.log('[Manga Auto-Importer] ▶️ Auto-Ingestão iniciada.');
        this.autoImporter.statusText = 'Ativo - Buscando próximas obras...';
        this.runAutoImporterStep();
    }

    async pauseAutoImporter() {
        this.autoImporter.isEnabled = false;
        await this.saveAutoImporterConfig({ is_enabled: false });
        console.log('[Manga Auto-Importer] ⏸️ Auto-Ingestão pausada.');
        this.autoImporter.statusText = 'Pausado';
        if (this.autoImporter.loopTimeout) clearTimeout(this.autoImporter.loopTimeout);
    }

    async resetAutoImporterOffset() {
        this.autoImporter.currentOffset = 0;
        await this.saveAutoImporterConfig({ current_offset: 0 });
        this.autoImporter.statusText = 'Offset reiniciado para 0.';
    }

    async runAutoImporterStep() {
        if (!this.autoImporter.isEnabled || this.autoImporter.isIngesting || !this.db) return;

        // REGRA DE OURO: Se a fila de downloads ainda tiver qualquer capítulo pendente, aguarda terminar TUDO da obra atual antes de puxar a próxima!
        if (this.stats.totalPending > 0) {
            this.autoImporter.statusText = `Baixando obra atual (${this.stats.totalPending} caps restantes). Aguardando concluir...`;
            this.autoImporter.loopTimeout = setTimeout(() => this.runAutoImporterStep(), 5000);
            return;
        }

        this.autoImporter.isIngesting = true;
        const currentLang = this.autoImporter.primaryLanguage;

        try {
            this.autoImporter.statusText = `Consultando MangaDex (offset: ${this.autoImporter.currentOffset})...`;
            
            // Busca apenas 1 obra por vez!
            const params = {
                limit: 1,
                offset: this.autoImporter.currentOffset,
                'includes[]': 'cover_art',
                [`order[${this.autoImporter.orderBy}]`]: 'desc'
            };

            if (currentLang && currentLang !== 'all') {
                params['availableTranslatedLanguage[]'] = currentLang;
            }

            const res = await axios.get('https://api.mangadex.org/manga', {
                params,
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });

            const mangaList = res.data.data || [];
            if (mangaList.length === 0) {
                this.autoImporter.statusText = 'Fim das obras encontradas no MangaDex.';
                this.autoImporter.isEnabled = false;
                await this.saveAutoImporterConfig({ is_enabled: false });
                this.autoImporter.isIngesting = false;
                return;
            }

            const dexManga = mangaList[0];
            const dexId = dexManga.id;
            const title = dexManga.attributes.title.en || 
                          dexManga.attributes.title['pt-br'] || 
                          dexManga.attributes.title['ja-ro'] || 
                          Object.values(dexManga.attributes.title)[0] || 'Sem Título';
            
            const coverRel = dexManga.relationships?.find(r => r.type === 'cover_art');
            const coverFileName = coverRel ? coverRel.attributes?.fileName : null;
            const coverUrl = coverFileName ? `/api/mangas/cover-proxy?mangaId=${dexId}&file=${coverFileName}` : null;
            // Identifica tipo pelo idioma original: Coreano (ko) ou Chinês (zh) vira webtoon/manhwa; Inglês (en) vira hq; Japonês (ja) vira manga
            const origLang = dexManga.attributes.originalLanguage;
            const type = (origLang === 'ko' || origLang === 'zh' || origLang === 'zh-hk') ? 'webtoon' : (origLang === 'en' ? 'hq' : 'manga');
            const synopsis = dexManga.attributes.description?.['pt-br'] || dexManga.attributes.description?.en || '';

            // 1. Verifica se a obra já existe pelo anilist_id
            let localManga = await this.db.get("SELECT * FROM mangas WHERE anilist_id = ?", [dexId]);

            if (!localManga) {
                this.autoImporter.statusText = `Cadastrando: ${title}`;
                
                // Baixar capa local
                let localCoverUrl = coverUrl;
                try {
                    const { downloadAndSaveCover } = await import('../routes/mangas.js');
                    if (downloadAndSaveCover && coverUrl) {
                        localCoverUrl = await downloadAndSaveCover(coverUrl, title);
                    }
                } catch (eCover) {}

                const insRes = await this.db.run(`
                    INSERT INTO mangas (title, original_title, synopsis, cover_url, type, anilist_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                `, [title, title, synopsis, localCoverUrl, type, dexId]);

                localManga = { id: insRes.lastID, title, anilist_id: dexId };
                this.autoImporter.importedCount++;
            }

            // 2. Se autoEnqueueChapters estiver ativo, busca capítulos faltantes e enfileira
            let addedAny = false;
            if (this.autoImporter.autoEnqueueChapters && localManga?.id) {
                this.autoImporter.statusText = `Buscando capítulos de "${title}" em ${currentLang}...`;
                
                const targetLang = (currentLang === 'all' || !currentLang) ? 'pt-br' : currentLang;
                
                const feedRes = await axios.get(`https://api.mangadex.org/manga/${dexId}/feed`, {
                    params: {
                        limit: 250,
                        'translatedLanguage[]': targetLang,
                        'order[chapter]': 'asc',
                        'includes[]': 'scanlation_group'
                    },
                    timeout: 15000
                });

                // FILTRAR ESTREITAMENTE: descarta capítulos externos da Comikey/MangaPlus e com 0 páginas!
                let dexChapters = (feedRes.data.data || [])
                    .filter(ch => !ch.attributes.externalUrl && ch.attributes.pages > 0)
                    .map(ch => {
                        const scanRel = ch.relationships?.find(r => r.type === 'scanlation_group');
                        const scanGroup = scanRel?.attributes?.name || 'Padrão';
                        return {
                            id: ch.id,
                            chapter_number: parseFloat(ch.attributes.chapter) || 0,
                            title: ch.attributes.title || `Capítulo ${ch.attributes.chapter}`,
                            scan_group: scanGroup,
                            pages: ch.attributes.pages
                        };
                    });

                // Se limitou max_chapters_per_manga
                if (this.autoImporter.maxChaptersPerManga > 0) {
                    dexChapters = dexChapters.slice(0, this.autoImporter.maxChaptersPerManga);
                }

                // Filtra apenas os que já temos baixados com ESSE MESMO scan_group e chapter_number
                const localCaps = await this.db.all("SELECT chapter_number, scan_group FROM manga_chapters WHERE manga_id = ? AND pages_count > 0", [localManga.id]);
                const localSet = new Set(localCaps.map(c => `${c.chapter_number}_${c.scan_group || 'Padrão'}`));
                const missing = dexChapters.filter(ch => !localSet.has(`${ch.chapter_number}_${ch.scan_group}`));

                if (missing.length > 0) {
                    await this.addMultipleChaptersToQueue(localManga.id, missing, targetLang);
                    addedAny = true;
                    console.log(`[Manga Auto-Importer] Enfileirados ${missing.length} capítulos de "${title}" (${targetLang}).`);
                    this.autoImporter.statusText = `Obra "${title}" enfileirada com ${missing.length} capítulos. Baixando tudo antes da próxima...`;
                }
            }

            // Garante que o worker de download esteja ativo
            if (!this.isRunning) {
                this.start();
            }

            // Avança o offset em 1 apenas quando tiver concluído ou enfileirado essa obra
            this.autoImporter.currentOffset += 1;
            await this.saveAutoImporterConfig({ current_offset: this.autoImporter.currentOffset });

        } catch (err) {
            console.error('[Manga Auto-Importer] Erro na rodada:', err.message);
            this.autoImporter.statusText = `Aviso: ${err.message}. Tentando novamente em 15s...`;
        } finally {
            this.autoImporter.isIngesting = false;
            if (this.autoImporter.isEnabled) {
                // Aguarda 5 segundos antes de checar se terminou de baixar para iniciar a próxima obra
                this.autoImporter.loopTimeout = setTimeout(() => {
                    this.runAutoImporterStep();
                }, 5000);
            }
        }
    }

    async addChapterToQueue(manga_id, chapter_dex_id, chapter_number, title, language = 'pt-br', scan_group = 'Padrão') {
        if (!this.db) throw new Error('DB não inicializado');
        
        // Verifica se já não foi baixado na tabela oficial de capítulos com ESSE grupo de scan
        const alreadyDownloaded = await this.db.get(`
            SELECT id FROM manga_chapters 
            WHERE manga_id = ? AND chapter_number = ? AND (scan_group = ? OR chapter_dex_id = ?) AND pages_count > 0
        `, [manga_id, chapter_number, scan_group, chapter_dex_id]);

        if (alreadyDownloaded) {
            return { added: false, reason: 'already_downloaded' };
        }

        try {
            await this.db.run(`
                INSERT INTO manga_download_queue (manga_id, chapter_dex_id, chapter_number, title, language, scan_group, status)
                VALUES (?, ?, ?, ?, ?, ?, 'pending')
                ON CONFLICT(manga_id, chapter_dex_id) DO UPDATE SET status = 'pending', scan_group = excluded.scan_group, error_message = NULL
            `, [manga_id, chapter_dex_id, chapter_number, title, language, scan_group]);

            await this.updateStats();

            // Se o worker estiver rodando e não estiver processando, acorda o loop
            if (this.isRunning && !this.isProcessing) {
                this.processNext();
            }

            return { added: true };
        } catch (e) {
            console.error('[Manga Worker] Erro ao enfileirar capítulo:', e.message);
            throw e;
        }
    }

    async addMultipleChaptersToQueue(manga_id, chapters, language = 'pt-br') {
        let addedCount = 0;
        for (const ch of chapters) {
            // Ignora capítulos externos ou zerados
            if (ch.pages === 0 || ch.externalUrl) continue;

            const res = await this.addChapterToQueue(
                manga_id, 
                ch.id || ch.chapter_dex_id, 
                ch.chapter_number, 
                ch.title, 
                language,
                ch.scan_group || 'Padrão'
            );
            if (res.added) addedCount++;
        }
        return { addedCount };
    }

    async clearCompletedQueue() {
        if (!this.db) return;
        await this.db.run("DELETE FROM manga_download_queue WHERE status = 'completed'");
        await this.updateStats();
    }

    async clearAllQueue() {
        if (!this.db) return;
        await this.db.run("DELETE FROM manga_download_queue");
        await this.updateStats();
    }

    async retryErrors() {
        if (!this.db) return;
        await this.db.run("UPDATE manga_download_queue SET status = 'pending', error_message = NULL WHERE status = 'error'");
        await this.updateStats();
        if (this.isRunning && !this.isProcessing) {
            this.processNext();
        }
    }

    async processNext() {
        if (!this.isRunning || this.isProcessing || !this.db) return;

        // Pega o próximo item pendente (em ordem de capítulo menor para maior)
        const item = await this.db.get(`
            SELECT q.*, m.title as manga_title 
            FROM manga_download_queue q
            JOIN mangas m ON m.id = q.manga_id
            WHERE q.status = 'pending'
            ORDER BY q.id ASC
            LIMIT 1
        `);

        if (!item) {
            this.currentJob = null;
            await this.updateStats();
            return;
        }

        this.isProcessing = true;
        this.currentJob = {
            id: item.id,
            manga_id: item.manga_id,
            manga_title: item.manga_title,
            chapter_number: item.chapter_number,
            step: 'Iniciando download...',
            progress: 0
        };

        try {
            await this.db.run("UPDATE manga_download_queue SET status = 'downloading', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);

            await this.downloadAndUploadChapter(item);

            await this.db.run("UPDATE manga_download_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
            console.log(`[Manga Worker] ✅ Concluído: ${item.manga_title} - Cap. ${item.chapter_number}`);
        } catch (err) {
            console.error(`[Manga Worker] ❌ Erro ao baixar ${item.manga_title} Cap. ${item.chapter_number}:`, err.message);
            await this.db.run("UPDATE manga_download_queue SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [err.message, item.id]);
        } finally {
            this.isProcessing = false;
            this.currentJob = null;
            await this.updateStats();

            // Delay de segurança inteligente de 2.5s entre capítulos para respeitar o rate-limit do MangaDex e do Telegram
            if (this.isRunning) {
                this.loopTimeout = setTimeout(() => {
                    this.processNext();
                }, 2500);
            }
        }
    }

    async downloadAndUploadChapter(job) {
        const { manga_id, chapter_dex_id, chapter_number, title, manga_title, language, scan_group } = job;
        const channelIdStr = process.env.TELEGRAM_MANGA_CHANNEL_ID;
        if (!channelIdStr) throw new Error('Canal de mangás não configurado no .env');

        this.currentJob.step = 'Buscando servidores do MangaDex...';

        // 1. Pega URLs do MangaDex
        const serverRes = await axios.get(`https://api.mangadex.org/at-home/server/${chapter_dex_id}`, { timeout: 15000 });
        const { baseUrl, chapter } = serverRes.data;
        const { hash, data: images } = chapter;

        if (!images || images.length === 0) {
            throw new Error('Capítulo sem páginas no servidor do MangaDex (possível link externo)');
        }

        const zip = new AdmZip();
        const pagesCount = images.length;

        // 2. Baixa cada página com progresso
        for (let i = 0; i < images.length; i++) {
            if (!this.isRunning) {
                // Se foi pausado enquanto baixava, cancela graciosamente
                throw new Error('Pausado pelo administrador');
            }

            const imgName = images[i];
            const imgUrl = `${baseUrl}/data/${hash}/${imgName}`;

            this.currentJob.step = `Baixando página ${i + 1}/${pagesCount}`;
            this.currentJob.progress = Math.round(((i + 1) / pagesCount) * 75); // 0% a 75%

            let imgData = null;
            const primaryUrl = `${baseUrl}/data/${hash}/${imgName}`;
            const officialFallbackUrl = `https://uploads.mangadex.org/data/${hash}/${imgName}`;
            const dataSaverUrl = `${baseUrl}/data-saver/${hash}/${chapter.dataSaver?.[i] || imgName}`;

            const tryUrls = [primaryUrl, officialFallbackUrl, dataSaverUrl];

            for (const targetUrl of tryUrls) {
                try {
                    const imgRes = await axios.get(targetUrl, { 
                        responseType: 'arraybuffer',
                        timeout: 12000,
                        headers: { 
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                            'Referer': 'https://mangadex.org/'
                        }
                    });
                    if (imgRes.data && imgRes.data.byteLength > 100) {
                        imgData = imgRes.data;
                        break;
                    }
                } catch (ePage) {
                    // Tenta o próximo espelho da lista
                }
            }

            if (!imgData) {
                throw new Error(`Página ${i + 1} indisponível em todos os servidores do MangaDex`);
            }

            const ext = imgName.split('.').pop();
            const paddedName = String(i + 1).padStart(3, '0') + '.' + ext;
            zip.addFile(paddedName, imgData);
        }

        // 3. Compactação do arquivo CBZ
        this.currentJob.step = 'Compactando arquivo CBZ...';
        this.currentJob.progress = 80;

        const scanSafe = (scan_group || 'Padrao').replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `${manga_title.replace(/[^a-zA-Z0-9]/g, '_')}_Cap_${chapter_number}_${scanSafe}.cbz`;
        const tempDir = path.join(__dirname, '..', '..', 'temp_mangas');
        const cacheDir = path.join(tempDir, 'cache');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

        const tempFilePath = path.join(tempDir, fileName);
        zip.writeZip(tempFilePath);
        const fileSize = fs.statSync(tempFilePath).size;

        // 4. Envio ao Telegram
        this.currentJob.step = 'Enviando ao canal do Telegram...';
        this.currentJob.progress = 90;

        let messageId = null;

        // Dicionário de bandeiras e nomes amigáveis para a legenda
        const LANG_MAP = {
            'pt-br': '🇧🇷 Português (Brasil)',
            'en': '🇺🇸 Inglês',
            'es-la': '🇲🇽 Espanhol (Latino)',
            'es': '🇪🇸 Espanhol',
            'ja': '🇯🇵 Japonês',
            'ko': '🇰🇷 Coreano',
            'zh': '🇨🇳 Chinês'
        };
        const langDisplay = LANG_MAP[language?.toLowerCase()] || `🌐 ${language?.toUpperCase() || 'PT-BR'}`;
        const sizeMb = (fileSize / (1024 * 1024)).toFixed(1);

        const caption = [
            `📚 **${manga_title}**`,
            ``,
            `📖 **Capítulo:** ${chapter_number}`,
            `📝 **Título:** ${title || 'Sem título específico'}`,
            `👥 **Scan:** ${scan_group || 'Padrão'}`,
            `🌐 **Idioma:** ${langDisplay}`,
            `📄 **Páginas:** ${pagesCount} páginas`,
            `📦 **Tamanho:** ${sizeMb} MB`,
            `🏷️ **ID Dex:** \`${chapter_dex_id}\``
        ].join('\n');

        // 4.1 Pyrogram
        try {
            const pyScript = path.join(__dirname, '..', 'scripts', 'uploadMangaChapter.py');
            if (fs.existsSync(pyScript)) {
                const pyResult = await new Promise((resolve) => {
                    const proc = spawn('python3', [pyScript, tempFilePath, caption]);
                    let stdout = '';
                    let stderr = '';
                    proc.stdout.on('data', d => { stdout += d.toString(); });
                    proc.stderr.on('data', d => { stderr += d.toString(); });
                    proc.on('close', code => {
                        if (code === 0) {
                            const match = stdout.match(/MESSAGE_ID:\s*(\d+)/i);
                            resolve({ success: true, messageId: match ? parseInt(match[1]) : null });
                        } else {
                            resolve({ success: false, error: stderr || stdout });
                        }
                    });
                });

                if (pyResult.success && pyResult.messageId) {
                    messageId = pyResult.messageId;
                }
            }
        } catch (pyErr) {
            console.warn('[Manga Worker] Pyrogram warning:', pyErr.message);
        }

        // 4.2 Fallback GramJS
        if (!messageId) {
            const tgClient = await getTelegramClient();
            if (!tgClient) throw new Error('Telegram não conectado');

            const zipBuffer = fs.readFileSync(tempFilePath);
            const toEntity = await tgClient.getInputEntity(channelIdStr.includes('-100') ? parseInt(channelIdStr) : channelIdStr);
            const customFile = new CustomFile(fileName, zipBuffer.length, "", zipBuffer);
            
            const message = await tgClient.sendFile(toEntity, {
                file: customFile,
                caption,
                parseMode: 'markdown'
            });
            messageId = message.id;
        }

        // 5. Salvar em cache local instantâneo
        try {
            if (messageId) {
                const chapterCacheDir = path.join(cacheDir, `ch_msg_${messageId}`);
                if (!fs.existsSync(chapterCacheDir)) {
                    fs.mkdirSync(chapterCacheDir, { recursive: true });
                    zip.extractAllTo(chapterCacheDir, true);
                }
            }
        } catch (cacheErr) {}

        // 6. Limpar CBZ temporário
        try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch (e) {}

        // 6.1 Executar manutenção LRU automática garantindo que o cache não ultrapasse 4.5 GB
        try {
            const cleanScript = path.join(__dirname, '..', 'scripts', 'cleanMangaCache.py');
            if (fs.existsSync(cleanScript)) {
                spawn('python3', [cleanScript, cacheDir, '4.5'], { detached: true, stdio: 'ignore' }).unref();
            }
        } catch (lruErr) {}

        // 7. Gravar capítulo no banco de dados com a versão/scan e idioma
        await this.db.run(`
            INSERT INTO manga_chapters (manga_id, chapter_number, title, telegram_message_id, file_size, pages_count, scan_group, language, chapter_dex_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [manga_id, chapter_number, title, messageId, fileSize, pagesCount, scan_group || 'Padrão', language || 'pt-br', chapter_dex_id]);

        this.currentJob.progress = 100;
        this.currentJob.step = 'Pronto!';
    }
}

export const mangaWorker = new MangaQueueWorker();
export default mangaWorker;
