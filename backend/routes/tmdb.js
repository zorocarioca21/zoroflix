import express from 'express';
import { getOrFetchMediaDetails, getOrFetchSeasonDetails, getOrFetchEpisodeGroupDetails } from '../services/tmdbCacheService.js';
import { getNextTmdbKey } from '../services/tmdbKeyService.js';

const router = express.Router();

export default function tmdbRoutes(db, appDb) {
    const mainDb = appDb || db;

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
            const data = await getOrFetchSeasonDetails(db, id, season, apiKey, mainDb);
            if (!data) return res.status(404).json({ error: 'Temporada não encontrada no TMDB' });
            res.json(data);
        } catch (err) {
            console.error('[TMDB ROUTE] Erro ao buscar temporada:', err);
            res.status(500).json({ error: 'Erro ao buscar temporada' });
        }
    });

    // GET /api/tmdb/episode-group/:id (DESATIVADO: usa a lista oficial do TMDB diretamente)
    router.get('/episode-group/:id', async (req, res) => {
        return res.status(404).json({ error: 'Episode groups desativados. Usando lista oficial do TMDB.' });
    });

    // =========================================================================
    // 🎬 PROXY DE CATÁLOGO TMDB (USADO PELO APP MOBILE E BOTS)
    // Permite que o app busque trending, popular, lançamentos e busca sem expor
    // a chave do TMDB no APK e com cache inteligente de alto desempenho.
    // =========================================================================

    const TMDB_API_URL = 'https://api.themoviedb.org/3';
    const catalogCache = new Map();
    const CATALOG_CACHE_TTL = 30 * 60 * 1000; // 30 minutos de cache

    async function fetchFromTmdb(endpointPath, queryParams, dbInstance) {
        const cacheKey = `${endpointPath}?${new URLSearchParams(queryParams).toString()}`;
        const cached = catalogCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CATALOG_CACHE_TTL)) {
            return cached.data;
        }

        const apiKey = await getNextTmdbKey(dbInstance);
        const { default: axios } = await import('axios');
        const https = await import('https');
        const agent = new https.Agent({ family: 4 });

        const params = {
            api_key: apiKey,
            language: queryParams.language || 'pt-BR',
            ...queryParams
        };

        const response = await axios.get(`${TMDB_API_URL}/${endpointPath}`, {
            params,
            httpsAgent: agent,
            timeout: 10000
        });

        catalogCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
        return response.data;
    }

    // 1. Trending Movies da Semana (Banner Principal)
    router.get('/trending/movie/week', async (req, res) => {
        try {
            const data = await fetchFromTmdb('trending/movie/week', req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro trending/movie/week:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar trending' });
        }
    });

    // 2. Filmes Lançamentos (Now Playing)
    router.get('/movie/now_playing', async (req, res) => {
        try {
            const data = await fetchFromTmdb('movie/now_playing', req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro movie/now_playing:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar filmes lançamentos' });
        }
    });

    // 3. Filmes Populares
    router.get('/movie/popular', async (req, res) => {
        try {
            const data = await fetchFromTmdb('movie/popular', req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro movie/popular:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar filmes populares' });
        }
    });

    // 4. Filmes Mais Bem Avaliados (Top Rated)
    router.get('/movie/top_rated', async (req, res) => {
        try {
            const data = await fetchFromTmdb('movie/top_rated', req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro movie/top_rated:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar filmes top rated' });
        }
    });

    // 5. Séries em Alta (TV Popular)
    router.get('/tv/popular', async (req, res) => {
        try {
            const data = await fetchFromTmdb('tv/popular', req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro tv/popular:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar séries populares' });
        }
    });

    // 6. Discover Movies (Banners / Destaques)
    router.get('/discover/movie', async (req, res) => {
        try {
            const data = await fetchFromTmdb('discover/movie', req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro discover/movie:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao descobrir filmes' });
        }
    });

    // 7. Busca Multi / Busca TMDB
    router.get('/search', async (req, res) => {
        try {
            const query = req.query.query || req.query.q;
            if (!query) return res.status(400).json({ error: 'Parâmetro query é obrigatório' });
            const data = await fetchFromTmdb('search/multi', { ...req.query, query }, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro search:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao pesquisar no TMDB' });
        }
    });

    // 8. Detalhes de Filme por ID direto (/movie/:id)
    router.get('/movie/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const apiKey = await getNextTmdbKey(db);
            const data = await getOrFetchMediaDetails(db, id, 'movie', apiKey);
            if (!data) return res.status(404).json({ error: 'Filme não encontrado no TMDB' });
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro movie/:id:', err.message);
            res.status(500).json({ error: 'Erro ao buscar detalhes do filme' });
        }
    });

    // 8.1 Elenco do Filme (/movie/:id/credits)
    router.get('/movie/:id/credits', async (req, res) => {
        try {
            const data = await fetchFromTmdb(`movie/${req.params.id}/credits`, req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro movie/:id/credits:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar elenco do filme' });
        }
    });

    // 8.2 Recomendações do Filme (/movie/:id/recommendations)
    router.get('/movie/:id/recommendations', async (req, res) => {
        try {
            const data = await fetchFromTmdb(`movie/${req.params.id}/recommendations`, req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro movie/:id/recommendations:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar recomendações do filme' });
        }
    });

    // 8.3 Vídeos e Trailers do Filme (/movie/:id/videos)
    router.get('/movie/:id/videos', async (req, res) => {
        try {
            const data = await fetchFromTmdb(`movie/${req.params.id}/videos`, req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro movie/:id/videos:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar trailers do filme' });
        }
    });

    // 9. Detalhes de Série por ID direto (/tv/:id)
    router.get('/tv/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const apiKey = await getNextTmdbKey(db);
            const data = await getOrFetchMediaDetails(db, id, 'tv', apiKey);
            if (!data) return res.status(404).json({ error: 'Série não encontrada no TMDB' });
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro tv/:id:', err.message);
            res.status(500).json({ error: 'Erro ao buscar detalhes da série' });
        }
    });

    // 9.1 Elenco da Série (/tv/:id/credits)
    router.get('/tv/:id/credits', async (req, res) => {
        try {
            const data = await fetchFromTmdb(`tv/${req.params.id}/credits`, req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro tv/:id/credits:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar elenco da série' });
        }
    });

    // 9.2 Recomendações da Série (/tv/:id/recommendations)
    router.get('/tv/:id/recommendations', async (req, res) => {
        try {
            const data = await fetchFromTmdb(`tv/${req.params.id}/recommendations`, req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro tv/:id/recommendations:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar recomendações da série' });
        }
    });

    // 9.3 Vídeos e Trailers da Série (/tv/:id/videos)
    router.get('/tv/:id/videos', async (req, res) => {
        try {
            const data = await fetchFromTmdb(`tv/${req.params.id}/videos`, req.query, db);
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro tv/:id/videos:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao buscar trailers da série' });
        }
    });

    // 9.4 Temporada da Série (/tv/:id/season/:season_number)
    router.get('/tv/:id/season/:season_number', async (req, res) => {
        const { id, season_number } = req.params;
        try {
            const apiKey = await getNextTmdbKey(db);
            const data = await getOrFetchSeasonDetails(db, id, season_number, apiKey, mainDb);
            if (!data) return res.status(404).json({ error: 'Temporada não encontrada no TMDB' });
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro tv/:id/season/:season_number:', err.message);
            res.status(500).json({ error: 'Erro ao buscar episódios da temporada' });
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

