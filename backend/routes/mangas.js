import express from 'express';
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

export default function createMangasRouter(db) {
    const router = express.Router();

    // Listar mangás (admin e público)
    router.get('/', async (req, res) => {
        try {
            const includeEmpty = req.query.includeEmpty === 'true';
            let query = `
                SELECT m.*, 
                (SELECT COUNT(*) FROM manga_chapters WHERE manga_id = m.id) as chapters_count
                FROM mangas m
            `;
            if (!includeEmpty) {
                query += " WHERE (SELECT COUNT(*) FROM manga_chapters WHERE manga_id = m.id) > 0";
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

            const result = await db.run(`
                INSERT INTO mangas (title, original_title, synopsis, cover_url, banner_url, author, genres, status, type, year, anilist_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [title, original_title, synopsis, cover_url, banner_url, author, genres, status, type, year, anilist_id]);

            res.status(201).json({ success: true, id: result.lastID });
        } catch (e) {
            console.error('Erro ao criar mangá:', e);
            res.status(500).json({ error: 'Erro interno do servidor.' });
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

            // 1. Apaga mensagens do Telegram via script Python
            if (msgIds.length > 0) {
                try {
                    const pyScript = path.join(__dirname, '..', 'scripts', 'deleteMangaMessages.py');
                    if (fs.existsSync(pyScript)) {
                        const proc = spawn('python3', [pyScript, ...msgIds.map(String)]);
                        proc.on('close', (code) => {
                            console.log(`[Telegram Delete] Deletadas ${msgIds.length} mensagens com código: ${code}`);
                        });
                    }
                } catch (tgErr) {
                    console.warn(`[Telegram Delete] Falha ao acionar deleção no Telegram:`, tgErr.message);
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

            // 3. Remove do banco de dados
            await db.run("DELETE FROM manga_chapters WHERE manga_id = ?", [id]);
            await db.run("DELETE FROM mangas WHERE id = ?", [id]);

            res.json({ success: true, message: 'Mangá e capítulos apagados com sucesso!' });
        } catch (e) {
            console.error('Erro ao deletar mangá:', e);
            res.status(500).json({ error: 'Erro interno ao deletar mangá' });
        }
    });

    // Listar capítulos de um mangá
    router.get('/:id/chapters', async (req, res) => {
        try {
            const { id } = req.params;
            const chapters = await db.all("SELECT * FROM manga_chapters WHERE manga_id = ? ORDER BY chapter_number ASC", [id]);
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
                // 1. Apaga a mensagem do Telegram
                try {
                    const pyScript = path.join(__dirname, '..', 'scripts', 'deleteMangaMessages.py');
                    if (fs.existsSync(pyScript)) {
                        const proc = spawn('python3', [pyScript, String(chapter.telegram_message_id)]);
                        proc.on('close', (code) => {
                            console.log(`[Telegram Delete] Mensagem ${chapter.telegram_message_id} deletada com código: ${code}`);
                        });
                    }
                } catch (tgErr) {
                    console.warn(`[Telegram Delete] Erro ao deletar no Telegram:`, tgErr.message);
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
        const imgPath = path.join(__dirname, '..', 'temp_mangas', 'cache', `ch_msg_${msgId}`, safeFilename);
        if (fs.existsSync(imgPath)) {
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
                const synopsis = manga.attributes.description['pt-br'] || manga.attributes.description.en || '';

                return {
                    id: manga.id,
                    title,
                    synopsis,
                    cover_url,
                    type: manga.attributes.originalLanguage === 'ko' ? 'webtoon' : (manga.attributes.originalLanguage === 'en' ? 'hq' : 'manga')
                };
            });

            res.json({ results });
        } catch (e) {
            console.error('Erro na pesquisa mangadex:', e);
            res.status(500).json({ error: 'Erro ao buscar no MangaDex' });
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

    // 2. Listar capítulos de um mangá no MangaDex
    router.get('/mangadex/:id/chapters', async (req, res) => {
        try {
            const { id } = req.params;
            const response = await axios.get(`https://api.mangadex.org/manga/${id}/feed`, {
                params: {
                    limit: 100, // Limite pra teste, ideal usar paginação dps
                    'translatedLanguage[]': 'pt-br',
                    'order[chapter]': 'asc'
                }
            });

            const chapters = response.data.data.map(ch => ({
                id: ch.id,
                chapter_number: parseFloat(ch.attributes.chapter) || 0,
                title: ch.attributes.title || `Capítulo ${ch.attributes.chapter}`,
                pages: ch.attributes.pages
            }));

            res.json({ chapters });
        } catch (e) {
            console.error('Erro ao listar capítulos do mangadex:', e);
            res.status(500).json({ error: 'Erro ao listar capítulos do MangaDex' });
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
