import express from 'express';
import { getOrFetchMediaDetails, getOrFetchSeasonDetails, getOrFetchEpisodeGroupDetails } from '../services/tmdbCacheService.js';

const router = express.Router();
const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY || 'f9cbdd4fabd4ac77cd2ca54d80a476a5';

export default function tmdbRoutes(db) {

    // GET /api/tmdb/details/:type/:id
    router.get('/details/:type/:id', async (req, res) => {
        const { type, id } = req.params;
        try {
            const data = await getOrFetchMediaDetails(db, id, type, TMDB_API_KEY);
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
            const data = await getOrFetchSeasonDetails(db, id, season, TMDB_API_KEY);
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
            const data = await getOrFetchEpisodeGroupDetails(db, id, TMDB_API_KEY, force);
            if (!data) return res.status(404).json({ error: 'Nenhum grupo de episódios encontrado' });
            res.json(data);
        } catch (err) {
            console.error('[TMDB ROUTE] Erro ao buscar grupo de episódios:', err);
            res.status(500).json({ error: 'Erro ao buscar grupo de episódios' });
        }
    });


    return router;
}

