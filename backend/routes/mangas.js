import express from 'express';
import axios from 'axios';
import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { getTelegramClient } from '../telegram.js';
import { CustomFile } from 'telegram/client/uploads.js';

import { UPLOADS_PATH } from '../db.js';
import mangaWorker from '../services/mangaWorker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper para baixar capa externa ou do MangaDex e salvar em disco local (/uploads/covers/mangas/)
export async function downloadAndSaveCover(coverUrl, mangaSlugOrId) {
    if (!coverUrl) return null;
    
    // Se já for uma imagem local, retorna como está
    if (coverUrl.startsWith('/uploads/')) return coverUrl;

    try {
        const coversDir = path.join(UPLOADS_PATH, 'covers', 'mangas');
        if (!fs.existsSync(coversDir)) {
            fs.mkdirSync(coversDir, { recursive: true });
        }

        let targetUrl = coverUrl;
        let reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        // Se for URL do nosso proxy local (/api/mangas/cover-proxy?mangaId=...&file=...)
        if (coverUrl.includes('/api/mangas/cover-proxy')) {
            const urlObj = new URL(coverUrl, 'http://localhost');
            const mangaId = urlObj.searchParams.get('mangaId');
            const file = urlObj.searchParams.get('file');
            if (mangaId && file) {
                targetUrl = `https://uploads.mangadex.org/covers/${mangaId}/${file}.512.jpg`;
                reqHeaders['Referer'] = 'https://mangadex.org/';
            }
        } else if (coverUrl.includes('mangadex.org')) {
            reqHeaders['Referer'] = 'https://mangadex.org/';
        }

        const safeId = String(mangaSlugOrId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `manga_${safeId}_${Date.now()}.jpg`;
        const destPath = path.join(coversDir, filename);

        let response;
        try {
            response = await axios.get(targetUrl, {
                responseType: 'arraybuffer',
                headers: reqHeaders,
                timeout: 10000
            });
        } catch (err512) {
            // Se falhou o .512.jpg, tenta a URL normal sem .512.jpg
            const fallbackUrl = targetUrl.replace('.512.jpg', '');
            response = await axios.get(fallbackUrl, {
                responseType: 'arraybuffer',
                headers: reqHeaders,
                timeout: 10000
            });
        }

        fs.writeFileSync(destPath, response.data);
        console.log(`[Manga Cover] Capa baixada com sucesso e salva em: ${destPath}`);
        return `/uploads/covers/mangas/${filename}`;
    } catch (e) {
        console.warn(`[Manga Cover] Falha ao baixar capa local (${coverUrl}):`, e.message);
        // Em caso de erro ao baixar, mantém a coverUrl original como fallback seguro
        return coverUrl;
    }
}

export default function createMangasRouter(db) {
    const router = express.Router();
    mangaWorker.init(db);

    // Listar mangás (admin e público)
    router.get('/', async (req, res) => {
        try {
            const includeEmpty = req.query.includeEmpty === 'true';
            let query = `
                SELECT m.*, 
                (SELECT COUNT(DISTINCT chapter_number) FROM manga_chapters WHERE manga_id = m.id) as chapters_count
                FROM mangas m
            `;
            if (!includeEmpty) {
                query += " WHERE (SELECT COUNT(DISTINCT chapter_number) FROM manga_chapters WHERE manga_id = m.id) > 0";
            }
            query += " ORDER BY m.updated_at DESC";

            const mangas = await db.all(query);
            res.json({ mangas });
        } catch (e) {
            console.error('Erro ao listar mangás:', e);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    });

    // Adicionar um novo mangá (Apenas Admin)
    router.post('/', async (req, res) => {
        try {
            const { title, original_title, synopsis, cover_url, banner_url, author, genres, status, type, year, anilist_id } = req.body;
            
            if (!title) {
                return res.status(400).json({ error: 'O título é obrigatório.' });
            }

            // Baixar a capa para a VPS caso venha do MangaDex ou URL externa
            const localCoverUrl = await downloadAndSaveCover(cover_url, title);

            const result = await db.run(`
                INSERT INTO mangas (title, original_title, synopsis, cover_url, banner_url, author, genres, status, type, year, anilist_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [title, original_title, synopsis, localCoverUrl, banner_url, author, genres, status, type, year, anilist_id]);

            res.status(201).json({ success: true, id: result.lastID, cover_url: localCoverUrl });
        } catch (e) {
            console.error('Erro ao criar mangá:', e);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    });

    // Proxy seguro de capas do MangaDex (com Referer e User-Agent para entregar a capa oficial colorida)
    router.get('/cover-proxy', async (req, res) => {
        try {
            const { mangaId, file } = req.query;
            if (!mangaId || !file) return res.status(400).send('Faltam parâmetros');

            const targetUrl = `https://uploads.mangadex.org/covers/${mangaId}/${file}.512.jpg`;
            const fallbackUrl = `https://uploads.mangadex.org/covers/${mangaId}/${file}`;

            let imgRes;
            try {
                imgRes = await axios.get(targetUrl, {
                    responseType: 'stream',
                    headers: {
                        'Referer': 'https://mangadex.org/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 7000
                });
            } catch (err512) {
                imgRes = await axios.get(fallbackUrl, {
                    responseType: 'stream',
                    headers: {
                        'Referer': 'https://mangadex.org/',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 7000
                });
            }

            res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/jpeg');
            res.setHeader('Cache-Control', 'public, max-age=604800'); // Cache de 7 dias
            imgRes.data.pipe(res);
        } catch (e) {
            res.status(404).send('Erro ao carregar capa');
        }
    });

    // Obter detalhes de um mangá
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const manga = await db.get("SELECT * FROM mangas WHERE id = ?", [id]);
            if (!manga) return res.status(404).json({ error: 'Mangá não encontrado' });
            res.json({ manga });
        } catch (e) {
            console.error('Erro ao buscar detalhes do mangá:', e);
            res.status(500).json({ error: 'Erro interno' });
        }
    });

    // Deletar um mangá e todos os seus capítulos (no Banco, no Cache e no Canal do Telegram)
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            
            // Pega todos os telegram_message_id dos capítulos deste mangá
            const chapters = await db.all("SELECT telegram_message_id FROM manga_chapters WHERE manga_id = ?", [id]);
            const msgIds = chapters.map(c => c.telegram_message_id).filter(Boolean);

            // 1. Apaga mensagens do Telegram (Pyrogram com fallback GramJS)
            if (msgIds.length > 0) {
                let deletedViaPy = false;
                try {
                    const pyScript = path.join(__dirname, '..', 'scripts', 'deleteMangaMessages.py');
                    if (fs.existsSync(pyScript)) {
                        const pyResult = await new Promise((resolve) => {
                            const proc = spawn('python3', [pyScript, ...msgIds.map(String)]);
                            let output = '';
                            proc.stdout.on('data', d => { output += d.toString(); });
                            proc.stderr.on('data', d => { output += d.toString(); });
                            proc.on('close', code => {
                                resolve({ success: code === 0, output });
                            });
                        });
                        if (pyResult.success) {
                            deletedViaPy = true;
                            console.log(`[Telegram Delete] ${msgIds.length} mensagens deletadas via Pyrogram.`);
                        }
                    }
                } catch (tgErr) {
                    console.warn(`[Telegram Delete] Pyrogram falhou:`, tgErr.message);
                }

                // Fallback GramJS se Pyrogram não apagou
                if (!deletedViaPy) {
                    try {
                        const tgClient = await getTelegramClient();
                        const channelIdStr = process.env.TELEGRAM_MANGA_CHANNEL_ID;
                        if (tgClient && channelIdStr) {
                            const toEntity = await tgClient.getInputEntity(channelIdStr.includes('-100') ? parseInt(channelIdStr) : channelIdStr);
                            await tgClient.deleteMessages(toEntity, msgIds, { revoke: true });
                            console.log(`[Telegram Delete] ${msgIds.length} mensagens deletadas via GramJS fallback.`);
                        }
                    } catch (gramErr) {
                        console.warn(`[Telegram Delete] GramJS fallback falhou:`, gramErr.message);
                    }
                }
            }

            // 2. Limpa cache local em disco de cada capítulo
            try {
                const cacheDir = path.join(__dirname, '..', 'temp_mangas', 'cache');
                for (let mid of msgIds) {
                    const chFolder = path.join(cacheDir, `ch_msg_${mid}`);
                    if (fs.existsSync(chFolder)) {
                        fs.rmSync(chFolder, { recursive: true, force: true });
                    }
                }
            } catch (cacheErr) {}

            // 3. Remove a capa do disco se for local
            const mangaToDelete = await db.get("SELECT cover_url FROM mangas WHERE id = ?", [id]);
            if (mangaToDelete && mangaToDelete.cover_url && mangaToDelete.cover_url.startsWith('/uploads/covers/mangas/')) {
                try {
                    const localCoverFile = path.join(UPLOADS_PATH, mangaToDelete.cover_url.replace('/uploads/', ''));
                    if (fs.existsSync(localCoverFile)) fs.unlinkSync(localCoverFile);
                } catch (delCoverErr) {}
            }

            // 4. Remove do banco de dados (capítulos, fila e a obra)
            await db.run("DELETE FROM manga_chapters WHERE manga_id = ?", [id]);
            await db.run("DELETE FROM manga_download_queue WHERE manga_id = ?", [id]);
            await db.run("DELETE FROM mangas WHERE id = ?", [id]);

            mangaWorker.updateStats();

            res.json({ success: true, message: 'Mangá, capítulos e itens da fila apagados com sucesso!' });
        } catch (e) {
            console.error('Erro ao deletar mangá:', e);
            res.status(500).json({ error: 'Erro interno ao deletar mangá' });
        }
    });

    // Listar capítulos de um mangá (com suporte a múltiplas versões / grupos de scan)
    router.get('/:id/chapters', async (req, res) => {
        try {
            const { id } = req.params;
            const chapters = await db.all(`
                SELECT * FROM manga_chapters 
                WHERE manga_id = ? AND pages_count > 0
                ORDER BY chapter_number ASC, scan_group ASC
            `, [id]);
            res.json({ chapters });
        } catch (e) {
            console.error('Erro ao listar capítulos:', e);
            res.status(500).json({ error: 'Erro interno' });
        }
    });

    // Deletar um capítulo específico (no Banco, no Cache e no Canal do Telegram)
    router.delete('/chapters/:chapterId', async (req, res) => {
        try {
            const { chapterId } = req.params;
            const chapter = await db.get("SELECT telegram_message_id, manga_id FROM manga_chapters WHERE id = ?", [chapterId]);

            if (chapter && chapter.telegram_message_id) {
                // 1. Apaga a mensagem do Telegram (Pyrogram com fallback GramJS)
                let deletedViaPy = false;
                try {
                    const pyScript = path.join(__dirname, '..', 'scripts', 'deleteMangaMessages.py');
                    if (fs.existsSync(pyScript)) {
                        const pyResult = await new Promise((resolve) => {
                            const proc = spawn('python3', [pyScript, String(chapter.telegram_message_id)]);
                            proc.on('close', code => {
                                resolve(code === 0);
                            });
                        });
                        deletedViaPy = pyResult;
                    }
                } catch (tgErr) {
                    console.warn(`[Telegram Delete] Erro ao deletar no Telegram:`, tgErr.message);
                }

                if (!deletedViaPy) {
                    try {
                        const tgClient = await getTelegramClient();
                        const channelIdStr = process.env.TELEGRAM_MANGA_CHANNEL_ID;
                        if (tgClient && channelIdStr) {
                            const toEntity = await tgClient.getInputEntity(channelIdStr.includes('-100') ? parseInt(channelIdStr) : channelIdStr);
                            await tgClient.deleteMessages(toEntity, [chapter.telegram_message_id], { revoke: true });
                        }
                    } catch (gramErr) {}
                }

                // 2. Limpa cache local em disco do capítulo
                try {
                    const chFolder = path.join(__dirname, '..', 'temp_mangas', 'cache', `ch_msg_${chapter.telegram_message_id}`);
                    if (fs.existsSync(chFolder)) {
                        fs.rmSync(chFolder, { recursive: true, force: true });
                    }
                } catch (cacheErr) {}
            }

            // 3. Remove do banco de dados
            await db.run("DELETE FROM manga_chapters WHERE id = ?", [chapterId]);

            // 4. Se a obra ficou com 0 capítulos, remove a obra também para não ficar card vazio no site
            let mangaDeleted = false;
            if (chapter && chapter.manga_id) {
                const remaining = await db.get("SELECT COUNT(*) as count FROM manga_chapters WHERE manga_id = ?", [chapter.manga_id]);
                if (!remaining || remaining.count === 0) {
                    await db.run("DELETE FROM mangas WHERE id = ?", [chapter.manga_id]);
                    mangaDeleted = true;
                }
            }

            res.json({ 
                success: true, 
                mangaDeleted,
                message: mangaDeleted ? 'Capítulo e obra removidos com sucesso (sem mais capítulos restantes)!' : 'Capítulo deletado com sucesso!' 
            });
        } catch (e) {
            console.error('Erro ao deletar capítulo:', e);
            res.status(500).json({ error: 'Erro interno ao deletar capítulo' });
        }
    });

    // Obter páginas de um capítulo (baixando/extraindo do Telegram e servindo URLs)
    router.get('/chapters/:chapterId/pages', async (req, res) => {
        try {
            const { chapterId } = req.params;
            const chapter = await db.get("SELECT * FROM manga_chapters WHERE id = ?", [chapterId]);
            if (!chapter) return res.status(404).json({ error: 'Capítulo não encontrado' });

            const cacheDir = path.join(__dirname, '..', 'temp_mangas', 'cache');
            const pyScript = path.join(__dirname, '..', 'scripts', 'getMangaChapterPages.py');

            const pyResult = await new Promise((resolve) => {
                const proc = spawn('python3', [pyScript, String(chapter.telegram_message_id), cacheDir]);
                let stdout = '';
                let stderr = '';
                proc.stdout.on('data', d => { stdout += d.toString(); });
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => {
                    if (code === 0) {
                        try {
                            resolve(JSON.parse(stdout));
                        } catch (err) {
                            resolve({ error: stdout || 'Erro ao processar JSON' });
                        }
                    } else {
                        resolve({ error: stderr || stdout });
                    }
                });
            });

            if (pyResult.error) {
                return res.status(500).json({ error: pyResult.error });
            }

            const pages = pyResult.pages.map(img => `/api/mangas/pages/${chapter.telegram_message_id}/${img}`);
            res.json({
                chapter_id: chapter.id,
                chapter_number: chapter.chapter_number,
                title: chapter.title,
                pages_count: pages.length,
                pages
            });
        } catch (e) {
            console.error('Erro ao obter páginas do capítulo:', e);
            res.status(500).json({ error: 'Erro ao carregar páginas' });
        }
    });

    // Rota para servir a imagem individual da página do mangá do cache local
    router.get('/pages/:msgId/:filename', (req, res) => {
        const { msgId, filename } = req.params;
        const safeFilename = path.basename(filename);
        const chapterDir = path.join(__dirname, '..', 'temp_mangas', 'cache', `ch_msg_${msgId}`);
        const imgPath = path.join(chapterDir, safeFilename);
        if (fs.existsSync(imgPath)) {
            // Atualiza o mtime/atime do diretório para manter o LRU preciso (evita remover o que está sendo lido)
            try {
                const now = new Date();
                fs.utimes(chapterDir, now, now, () => {});
            } catch (uErr) {}

            res.setHeader('Cache-Control', 'public, max-age=86400');
            res.sendFile(imgPath);
        } else {
            res.status(404).json({ error: 'Imagem não encontrada' });
        }
    });

    // ==========================================
    // MANGADEX INTEGRATION
    // ==========================================

    // 1. Pesquisar mangá
    router.get('/mangadex/search', async (req, res) => {
        try {
            const { q } = req.query;
            if (!q) return res.status(400).json({ error: 'Falta parâmetro q' });

            const response = await axios.get(`https://api.mangadex.org/manga`, {
                params: {
                    title: q,
                    limit: 10,
                    'includes[]': 'cover_art',
                    'order[relevance]': 'desc'
                }
            });

            const results = response.data.data.map(manga => {
                const title = manga.attributes.title.en || manga.attributes.title['pt-br'] || Object.values(manga.attributes.title)[0];
                const coverRel = manga.relationships.find(r => r.type === 'cover_art');
                const coverFileName = coverRel ? coverRel.attributes.fileName : null;
                // Usa o proxy local para burlar o anti-hotlink do MangaDex (que manda logo deles em vez da capa real)
                const cover_url = coverFileName ? `/api/mangas/cover-proxy?mangaId=${manga.id}&file=${coverFileName}` : null;
                const origLang = manga.attributes.originalLanguage;
                const type = (origLang === 'ko' || origLang === 'zh' || origLang === 'zh-hk') ? 'webtoon' : (origLang === 'en' ? 'hq' : 'manga');

                return {
                    id: manga.id,
                    title,
                    synopsis,
                    cover_url,
                    type
                };
            });

            res.json({ results });
        } catch (e) {
            console.error('Erro na pesquisa mangadex:', e);
            res.status(500).json({ error: 'Erro ao buscar no MangaDex' });
        }
    });

    // 1.1 Estatísticas Globais do MangaDex em Tempo Real (Obras no mundo, PT-BR, EN, ES e capítulos)
    router.get('/mangadex/global-stats', async (req, res) => {
        try {
            const [allManga, ptManga, enManga, esManga, allChapters, ptChapters] = await Promise.all([
                axios.get('https://api.mangadex.org/manga?limit=1', { timeout: 8000 }).then(r => r.data.total).catch(() => 95000),
                axios.get('https://api.mangadex.org/manga?limit=1&availableTranslatedLanguage[]=pt-br', { timeout: 8000 }).then(r => r.data.total).catch(() => 13150),
                axios.get('https://api.mangadex.org/manga?limit=1&availableTranslatedLanguage[]=en', { timeout: 8000 }).then(r => r.data.total).catch(() => 54600),
                axios.get('https://api.mangadex.org/manga?limit=1&availableTranslatedLanguage[]=es-la', { timeout: 8000 }).then(r => r.data.total).catch(() => 10000),
                axios.get('https://api.mangadex.org/chapter?limit=1', { timeout: 8000 }).then(r => r.data.total).catch(() => 2024000),
                axios.get('https://api.mangadex.org/chapter?limit=1&translatedLanguage[]=pt-br', { timeout: 8000 }).then(r => r.data.total).catch(() => 243500)
            ]);

            res.json({
                totalObrasMundo: allManga,
                totalObrasPtBr: ptManga,
                totalObrasEn: enManga,
                totalObrasEsLa: esManga,
                totalCapitulosMundo: allChapters,
                totalCapitulosPtBr: ptChapters
            });
        } catch (e) {
            console.error('Erro ao buscar stats globais do mangadex:', e);
            res.status(500).json({ error: 'Erro ao obter estatísticas' });
        }
    });

    // 1.2 Obter detalhes e TODAS as linguagens disponíveis da obra no MangaDex
    router.get('/mangadex/:id/info', async (req, res) => {
        try {
            const { id } = req.params;
            const response = await axios.get(`https://api.mangadex.org/manga/${id}`, { timeout: 10000 });
            const mangaData = response.data.data;
            const availableLanguages = mangaData?.attributes?.availableTranslatedLanguages || [];
            
            res.json({
                id: mangaData.id,
                title: mangaData.attributes.title,
                availableLanguages
            });
        } catch (e) {
            console.error('Erro ao buscar info do mangadex:', e.message);
            res.status(500).json({ error: 'Erro ao buscar informações do mangá' });
        }
    });

    // 2. Listar capítulos de um mangá no MangaDex (suporta filtro por qualquer idioma e traz grupo de scan)
    router.get('/mangadex/:id/chapters', async (req, res) => {
        try {
            const { id } = req.params;
            const lang = req.query.lang || 'pt-br';
            const limit = parseInt(req.query.limit) || 250;
            const offset = parseInt(req.query.offset) || 0;

            const response = await axios.get(`https://api.mangadex.org/manga/${id}/feed`, {
                params: {
                    limit,
                    offset,
                    'translatedLanguage[]': lang,
                    'order[chapter]': 'asc',
                    'includes[]': 'scanlation_group'
                }
            });

            // Filtra links externos e capítulos vazios sem páginas
            const validData = (response.data.data || []).filter(ch => !ch.attributes.externalUrl && ch.attributes.pages > 0);

            const chapters = validData.map(ch => {
                const scanRel = ch.relationships?.find(r => r.type === 'scanlation_group');
                const scanGroup = scanRel?.attributes?.name || 'Padrão';
                return {
                    id: ch.id,
                    chapter_number: parseFloat(ch.attributes.chapter) || 0,
                    title: ch.attributes.title || `Capítulo ${ch.attributes.chapter}`,
                    scan_group: scanGroup,
                    pages: ch.attributes.pages,
                    publishAt: ch.attributes.publishAt
                };
            });

            res.json({ chapters, total: chapters.length });
        } catch (e) {
            console.error('Erro ao listar capítulos do mangadex:', e);
            res.status(500).json({ error: 'Erro ao listar capítulos do MangaDex' });
        }
    });

    // ==========================================
    // AUTO-INGESTÃO / AUTO-IMPORTADOR DE MANGÁS
    // ==========================================

    // Iniciar auto-ingestor
    router.post('/auto-importer/start', async (req, res) => {
        try {
            await mangaWorker.startAutoImporter();
            res.json({ success: true, message: 'Auto-ingestão iniciada!', status: mangaWorker.getStatus() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Pausar auto-ingestor
    router.post('/auto-importer/pause', async (req, res) => {
        try {
            await mangaWorker.pauseAutoImporter();
            res.json({ success: true, message: 'Auto-ingestão pausada!', status: mangaWorker.getStatus() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Salvar configurações do auto-ingestor
    router.post('/auto-importer/config', async (req, res) => {
        try {
            const { 
                primaryLanguage, 
                orderBy, 
                delaySeconds, 
                currentOffset, 
                autoEnqueueChapters, 
                maxChaptersPerManga 
            } = req.body;

            await mangaWorker.saveAutoImporterConfig({
                primaryLanguage: primaryLanguage || mangaWorker.autoImporter.primaryLanguage,
                orderBy: orderBy || mangaWorker.autoImporter.orderBy,
                delaySeconds: Number(delaySeconds) >= 1 ? Number(delaySeconds) : 3,
                currentOffset: Number(currentOffset) >= 0 ? Number(currentOffset) : mangaWorker.autoImporter.currentOffset,
                autoEnqueueChapters: autoEnqueueChapters !== undefined ? (autoEnqueueChapters ? 1 : 0) : 1,
                maxChaptersPerManga: Number(maxChaptersPerManga) >= 0 ? Number(maxChaptersPerManga) : 0
            });

            res.json({ success: true, message: 'Configurações atualizadas com sucesso!', status: mangaWorker.getStatus() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Resetar offset do auto-ingestor para o início (0)
    router.post('/auto-importer/reset-offset', async (req, res) => {
        try {
            await mangaWorker.resetAutoImporterOffset();
            res.json({ success: true, message: 'Offset reiniciado para 0!', status: mangaWorker.getStatus() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ==========================================
    // ROTAS DE CONTROLE DA FILA DE DOWNLOADS
    // ==========================================

    // Obter status completo da fila
    router.get('/queue/status', async (req, res) => {
        try {
            const status = mangaWorker.getStatus();
            // Buscar itens recentes da fila para visualização no painel
            const queueItems = await db.all(`
                SELECT q.*, m.title as manga_title 
                FROM manga_download_queue q
                JOIN mangas m ON m.id = q.manga_id
                ORDER BY CASE WHEN q.status = 'downloading' THEN 0 WHEN q.status = 'pending' THEN 1 ELSE 2 END, q.id ASC
                LIMIT 50
            `);
            res.json({ ...status, items: queueItems });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Iniciar a fila
    router.post('/queue/start', (req, res) => {
        mangaWorker.start();
        res.json({ success: true, message: 'Fila iniciada com sucesso!', status: mangaWorker.getStatus() });
    });

    // Pausar a fila
    router.post('/queue/pause', (req, res) => {
        mangaWorker.pause();
        res.json({ success: true, message: 'Fila pausada com sucesso!', status: mangaWorker.getStatus() });
    });

    // Adicionar capítulos selecionados à fila
    router.post('/queue/add', async (req, res) => {
        try {
            const { manga_id, chapters, language } = req.body;
            if (!manga_id || !chapters || !Array.isArray(chapters)) {
                return res.status(400).json({ error: 'Dados inválidos' });
            }
            const result = await mangaWorker.addMultipleChaptersToQueue(manga_id, chapters, language || 'pt-br');
            res.json({ success: true, ...result });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Enfileirar TODOS os capítulos faltantes de um mangá
    router.post('/queue/add-all', async (req, res) => {
        try {
            const { manga_id, language } = req.body;
            const lang = language || 'pt-br';
            const manga = await db.get("SELECT * FROM mangas WHERE id = ?", [manga_id]);
            if (!manga || !manga.anilist_id) {
                return res.status(404).json({ error: 'Mangá ou ID do MangaDex não encontrado' });
            }

            // Buscar capítulos do MangaDex (paginando se houver mais de 500)
            let allDexChapters = [];
            let offset = 0;
            let total = 1;

            while (offset < total && offset < 1000) {
                const response = await axios.get(`https://api.mangadex.org/manga/${manga.anilist_id}/feed`, {
                    params: {
                        limit: 250,
                        offset,
                        'translatedLanguage[]': lang,
                        'order[chapter]': 'asc',
                        'includes[]': 'scanlation_group'
                    }
                });
                total = response.data.total || 0;
                const batch = (response.data.data || [])
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
                allDexChapters.push(...batch);
                offset += 250;
                if ((response.data.data || []).length === 0) break;
            }

            // Filtrar capítulos que já temos no banco com a mesma versão/scan
            const localCaps = await db.all("SELECT chapter_number, scan_group FROM manga_chapters WHERE manga_id = ? AND pages_count > 0", [manga_id]);
            const localSet = new Set(localCaps.map(c => `${c.chapter_number}_${c.scan_group || 'Padrão'}`));

            const toAdd = allDexChapters.filter(ch => !localSet.has(`${ch.chapter_number}_${ch.scan_group}`));

            const result = await mangaWorker.addMultipleChaptersToQueue(manga_id, toAdd, lang);
            res.json({ success: true, totalFound: allDexChapters.length, added: result.addedCount });
        } catch (e) {
            console.error('Erro ao adicionar todos à fila:', e);
            res.status(500).json({ error: e.message });
        }
    });

    // Limpar itens concluídos da fila
    router.post('/queue/clear-completed', async (req, res) => {
        try {
            await mangaWorker.clearCompletedQueue();
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Limpar TODA a fila (pendentes, concluídos e erros)
    router.post('/queue/clear-all', async (req, res) => {
        try {
            await mangaWorker.clearAllQueue();
            res.json({ success: true, message: 'Toda a fila de downloads foi limpa com sucesso!' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Reenfileirar capítulos com erro
    router.post('/queue/retry-errors', async (req, res) => {
        try {
            await mangaWorker.retryErrors();
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // 3. Baixar capítulo do MangaDex, zipar e enviar pro Telegram
    router.post('/mangadex/download', async (req, res) => {
        const { manga_id, chapter_id, chapter_number, title } = req.body;
        if (!manga_id || !chapter_id) return res.status(400).json({ error: 'Faltam dados do capítulo' });

        const channelIdStr = process.env.TELEGRAM_MANGA_CHANNEL_ID;
        if (!channelIdStr) return res.status(400).json({ error: 'Canal de mangás não configurado no .env' });

        try {
            // Verifica se a obra existe
            const manga = await db.get("SELECT * FROM mangas WHERE id = ?", [manga_id]);
            if (!manga) return res.status(404).json({ error: 'Obra não encontrada no banco local' });

            // Pega a URL do servidor e as imagens
            const serverRes = await axios.get(`https://api.mangadex.org/at-home/server/${chapter_id}`);
            const { baseUrl, chapter } = serverRes.data;
            const { hash, data: images } = chapter;

            const zip = new AdmZip();
            let pagesCount = images.length;

            console.log(`[MangaDex] Baixando ${pagesCount} páginas do capítulo ${chapter_number}...`);
            
            // Baixa cada imagem e coloca no zip
            for (let i = 0; i < images.length; i++) {
                const imgName = images[i];
                const imgUrl = `${baseUrl}/data/${hash}/${imgName}`;
                const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
                // Salvar com zeros à esquerda (ex: 001.jpg, 002.png) para leitura ordenada
                const ext = imgName.split('.').pop();
                const paddedName = String(i + 1).padStart(3, '0') + '.' + ext;
                zip.addFile(paddedName, imgRes.data);
            }

            const fileName = `${manga.title.replace(/[^a-zA-Z0-9]/g, '_')}_Cap_${chapter_number}.cbz`;
            const tempDir = path.join(__dirname, '..', 'temp_mangas');
            const cacheDir = path.join(tempDir, 'cache');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

            const tempFilePath = path.join(tempDir, fileName);
            zip.writeZip(tempFilePath);
            const fileSize = fs.statSync(tempFilePath).size;

            console.log(`[Manga Upload] Arquivo CBZ salvo: ${tempFilePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

            let messageId = null;
            const caption = `📚 **${manga.title}**\n\n📖 Capítulo: ${chapter_number}\n📝 Título: ${title || 'N/A'}\n📄 Páginas: ${pagesCount}`;

            // 1. Tenta upload via Pyrogram primeiro (usa sessão oficial my_account já no canal)
            try {
                const pyScript = path.join(__dirname, '..', 'scripts', 'uploadMangaChapter.py');
                if (fs.existsSync(pyScript)) {
                    console.log(`[Manga Upload] Tentando envio via Pyrogram script...`);
                    const pyResult = await new Promise((resolve) => {
                        const proc = spawn('python3', [pyScript, tempFilePath, caption]);
                        let stdout = '';
                        let stderr = '';
                        proc.stdout.on('data', d => { stdout += d.toString(); });
                        proc.stderr.on('data', d => { stderr += d.toString(); });
                        proc.on('close', code => {
                            if (code === 0) {
                                const match = stdout.match(/MESSAGE_ID:\s*(\d+)/i);
                                resolve({ success: true, messageId: match ? parseInt(match[1]) : null, stdout });
                            } else {
                                resolve({ success: false, error: stderr || stdout });
                            }
                        });
                    });

                    if (pyResult.success && pyResult.messageId) {
                        messageId = pyResult.messageId;
                        console.log(`[Manga Upload] Upload via Pyrogram sucesso! MessageID: ${messageId}`);
                    } else {
                        console.warn(`[Manga Upload] Pyrogram falhou (${pyResult.error}), tentando GramJS fallback...`);
                    }
                }
            } catch (pyErr) {
                console.warn(`[Manga Upload] Erro no subprocesso Pyrogram:`, pyErr.message);
            }

            // 2. Se não foi pelo Pyrogram, tenta GramJS
            if (!messageId) {
                const tgClient = await getTelegramClient();
                if (!tgClient) {
                    throw new Error('Telegram não conectado');
                }

                console.log(`[GramJS] Enviando arquivo ${fileName}...`);
                const zipBuffer = fs.readFileSync(tempFilePath);
                const toEntity = await tgClient.getInputEntity(channelIdStr.includes('-100') ? parseInt(channelIdStr) : channelIdStr);
                const customFile = new CustomFile(fileName, zipBuffer.length, "", zipBuffer);
                
                const message = await tgClient.sendFile(toEntity, {
                    file: customFile,
                    caption,
                    parseMode: 'markdown'
                });

                messageId = message.id;
                console.log(`[GramJS] Enviado com sucesso. MessageID: ${messageId}`);
            }

            // Extrair direto no cache local para que a abertura pelo leitor seja INSTANTÂNEA
            try {
                if (messageId) {
                    const chapterCacheDir = path.join(cacheDir, `ch_msg_${messageId}`);
                    if (!fs.existsSync(chapterCacheDir)) {
                        fs.mkdirSync(chapterCacheDir, { recursive: true });
                        zip.extractAllTo(chapterCacheDir, true);
                        console.log(`[Manga Cache] Capítulo extraído em cache instantâneo: ${chapterCacheDir}`);
                    }
                }
            } catch (cacheErr) {
                console.warn(`[Manga Cache] Aviso ao salvar pré-cache:`, cacheErr.message);
            }

            // Remove o arquivo temporário
            try {
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            } catch (cleanErr) {}

            // Salvar no DB
            await db.run(`
                INSERT INTO manga_chapters (manga_id, chapter_number, title, telegram_message_id, file_size, pages_count)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [manga_id, chapter_number, title, messageId, fileSize, pagesCount]);

            res.json({ success: true, message_id: messageId });
        } catch (e) {
            console.error('Erro ao processar download do MangaDex:', e);
            res.status(500).json({ error: e.message || 'Erro ao processar o capítulo' });
        }
    });

    return router;
}
