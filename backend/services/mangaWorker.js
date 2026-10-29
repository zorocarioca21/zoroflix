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
        this.isRunning = false; // Controle de pausa/início
        this.isProcessing = false;
        this.currentJob = null; // { manga_id, manga_title, chapter_number, progress, step }
        this.stats = {
            totalPending: 0,
            totalCompleted: 0,
            totalError: 0
        };
        this.loopTimeout = null;
    }

    init(database) {
        this.db = database;
        console.log('[Manga Worker] Serviço de fila de mangás inicializado.');
        this.updateStats();
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
            stats: this.stats
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

    async addChapterToQueue(manga_id, chapter_dex_id, chapter_number, title, language = 'pt-br') {
        if (!this.db) throw new Error('DB não inicializado');
        
        // Verifica se já não foi baixado na tabela oficial de capítulos
        const alreadyDownloaded = await this.db.get(`
            SELECT id FROM manga_chapters 
            WHERE manga_id = ? AND chapter_number = ?
        `, [manga_id, chapter_number]);

        if (alreadyDownloaded) {
            return { added: false, reason: 'already_downloaded' };
        }

        try {
            await this.db.run(`
                INSERT INTO manga_download_queue (manga_id, chapter_dex_id, chapter_number, title, language, status)
                VALUES (?, ?, ?, ?, ?, 'pending')
                ON CONFLICT(manga_id, chapter_dex_id) DO UPDATE SET status = 'pending', error_message = NULL
            `, [manga_id, chapter_dex_id, chapter_number, title, language]);

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
            const res = await this.addChapterToQueue(
                manga_id, 
                ch.id || ch.chapter_dex_id, 
                ch.chapter_number, 
                ch.title, 
                language
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
        const { manga_id, chapter_dex_id, chapter_number, title, manga_title } = job;
        const channelIdStr = process.env.TELEGRAM_MANGA_CHANNEL_ID;
        if (!channelIdStr) throw new Error('Canal de mangás não configurado no .env');

        this.currentJob.step = 'Buscando servidores do MangaDex...';

        // 1. Pega URLs do MangaDex
        const serverRes = await axios.get(`https://api.mangadex.org/at-home/server/${chapter_dex_id}`, { timeout: 15000 });
        const { baseUrl, chapter } = serverRes.data;
        const { hash, data: images } = chapter;

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

            const imgRes = await axios.get(imgUrl, { 
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });

            const ext = imgName.split('.').pop();
            const paddedName = String(i + 1).padStart(3, '0') + '.' + ext;
            zip.addFile(paddedName, imgRes.data);
        }

        // 3. Compactação do arquivo CBZ
        this.currentJob.step = 'Compactando arquivo CBZ...';
        this.currentJob.progress = 80;

        const fileName = `${manga_title.replace(/[^a-zA-Z0-9]/g, '_')}_Cap_${chapter_number}.cbz`;
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
        const caption = `📚 **${manga_title}**\n\n📖 Capítulo: ${chapter_number}\n📝 Título: ${title || 'N/A'}\n📄 Páginas: ${pagesCount}`;

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

        // 7. Gravar capítulo no banco de dados
        await this.db.run(`
            INSERT INTO manga_chapters (manga_id, chapter_number, title, telegram_message_id, file_size, pages_count)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [manga_id, chapter_number, title, messageId, fileSize, pagesCount]);

        this.currentJob.progress = 100;
        this.currentJob.step = 'Pronto!';
    }
}

export const mangaWorker = new MangaQueueWorker();
export default mangaWorker;
