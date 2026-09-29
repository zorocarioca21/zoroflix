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


    return router;
}

