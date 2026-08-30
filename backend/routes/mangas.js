import express from 'express';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { getTelegramClient } from '../telegram.js';
import { CustomFile } from 'telegram/client/uploads.js';

export default function createMangasRouter(db) {
    const router = express.Router();

    // Listar mangás (admin e público)
    router.get('/', async (req, res) => {
        try {
            const mangas = await db.all("SELECT * FROM mangas ORDER BY updated_at DESC");
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
                const cover_url = coverFileName ? `https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}` : null;
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

            const zipBuffer = zip.toBuffer();
            const fileName = `${manga.title.replace(/[^a-zA-Z0-9]/g, '_')}_Cap_${chapter_number}.cbz`;

            // Enviar pro Telegram
            const tgClient = await getTelegramClient();
            if (!tgClient) return res.status(500).json({ error: 'Telegram não conectado' });

            console.log(`[Telegram] Enviando arquivo ${fileName} (${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB)...`);
            
            const toEntity = await tgClient.getInputEntity(channelIdStr.includes('-100') ? parseInt(channelIdStr) : channelIdStr);
            const customFile = new CustomFile(fileName, zipBuffer.length, "", zipBuffer);
            
            const message = await tgClient.sendFile(toEntity, {
                file: customFile,
                caption: `📚 **${manga.title}**\n\n📖 Capítulo: ${chapter_number}\n📝 Título: ${title || 'N/A'}\n📄 Páginas: ${pagesCount}`,
                parseMode: 'markdown'
            });

            console.log(`[Telegram] Enviado com sucesso. MessageID: ${message.id}`);

            // Salvar no DB
            await db.run(`
                INSERT INTO manga_chapters (manga_id, chapter_number, title, telegram_message_id, file_size, pages_count)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [manga_id, chapter_number, title, message.id, zipBuffer.length, pagesCount]);

            res.json({ success: true, message_id: message.id });
        } catch (e) {
            console.error('Erro ao processar download do MangaDex:', e);
            res.status(500).json({ error: 'Erro ao processar o capítulo' });
        }
    });

    return router;
}
