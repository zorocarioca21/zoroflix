import express from 'express';
import { getOrFetchMediaDetails, getOrFetchSeasonDetails, getOrFetchEpisodeGroupDetails } from '../services/tmdbCacheService.js';
import { getNextTmdbKey } from '../services/tmdbKeyService.js';

const router = express.Router();

export default function tmdbRoutes(db) {

    // GET /api/tmdb/details/:type/:id
    router.get('/details/:type/:id', async (req, res) => {
        const { type, id } = req.params;
        try {
            const apiKey = await getNextTmdbKey(db);
            const data = await getOrFetchMediaDetails(db, id, type, apiKey);
            if (!data) return res.status(404).json({ error: 'Conteúdo não encontrado no TMDB' });
            res.json(data);
        } catch (err) {
            console.error('[TMDB ROUTE] Erro ao buscar detalhes:', err);
            res.status(500).json({ error: 'Erro ao buscar detalhes' });
        }
    });

    // GET /api/tmdb/season/:id/:season
    router.get('/season/:id/:season', async (req, res) => {
        const { id, season } = req.params;
        try {
            const apiKey = await getNextTmdbKey(db);
            const data = await getOrFetchSeasonDetails(db, id, season, apiKey);
            if (!data) return res.status(404).json({ error: 'Temporada não encontrada no TMDB' });
            res.json(data);
        } catch (err) {
            console.error('[TMDB ROUTE] Erro ao buscar temporada:', err);
            res.status(500).json({ error: 'Erro ao buscar temporada' });
        }
    });

    // GET /api/tmdb/episode-group/:id
    router.get('/episode-group/:id', async (req, res) => {
        const { id } = req.params;
        const force = req.query.force === 'true';
        try {
            const apiKey = await getNextTmdbKey(db);
            const data = await getOrFetchEpisodeGroupDetails(db, id, apiKey, force);
            if (!data) return res.status(404).json({ error: 'Nenhum grupo de episódios encontrado' });
            res.json(data);
        } catch (err) {
            console.error('[TMDB ROUTE] Erro ao buscar grupo de episódios:', err);
            res.status(500).json({ error: 'Erro ao buscar grupo de episódios' });
        }
    });

    // PROXY de imagens — Resolve o problema de CORS do Zoro Drive
    // Qualquer imagem do Zoro Drive ou TMDB será servida pelo nosso backend
    router.get('/img-proxy', async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).send('URL obrigatória');

        // Só permite domínios confiáveis
        const allowed = ['api.zorobot.shop', 'image.tmdb.org'];
        try {
            const parsed = new URL(url);
            if (!allowed.some(d => parsed.hostname.includes(d))) {
                return res.status(403).send('Domínio não permitido');
            }
        } catch {
            return res.status(400).send('URL inválida');
        }

        try {
            const { default: axios } = await import('axios');
            const https = await import('https');
            const agent = new https.Agent({ family: 4 });

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                httpsAgent: agent,
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const contentType = response.headers['content-type'] || 'image/jpeg';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable'); // 30 dias de cache
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(Buffer.from(response.data));
        } catch (err) {
            console.error('[IMG PROXY] Erro:', err.message);
            res.status(502).send('Erro ao buscar imagem');
        }
    });


    return router;
}

