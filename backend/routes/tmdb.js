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

    // Função para gerar o token e a URL do stream segura do Telegram
    function buildStreamUrl(telegramMessageId, title) {
        if (!telegramMessageId) return null;
        const expiration = Date.now() + 14400000; // 4 horas
        const payload = JSON.stringify({ id: telegramMessageId, title: title || '', exp: expiration, app: true });
        const textoInvertido = payload.split('').reverse().join('');
        const textoSubstituido = textoInvertido.replace(/a/g, '§').replace(/b/g, '¶').replace(/c/g, '©');
        let token = Buffer.from(textoSubstituido, 'utf-8').toString('base64');
        token = token.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return `https://www.cinegeek.shop/api/stream/s/${token}.mp4`;
    }

    // Função para sanitizar URLs de imagens para apps mobile (Glide compatibility)
    function sanitizeForMobile(url) {
        if (!url || typeof url !== 'string') return url;
        // Se já for uma URL completa do TMDB, remove o prefixo para deixar no formato relativo "/path.jpg"
        const tmdbMatch = url.match(/image\.tmdb\.org\/t\/p\/[^/]+(\/.*)$/);
        if (tmdbMatch) return tmdbMatch[1];
        return url;
    }

    // Filtra lista de itens do TMDB mantendo apenas os que foram baixados no Telegram
    async function filterAvailableInTelegram(items, defaultMediaType = null) {
        if (!items || !Array.isArray(items) || items.length === 0) return [];
        try {
            // Busca todos os tmdb_ids com download concluído no Telegram
            const completedRows = await mainDb.all(
                "SELECT tmdb_id, media_type, telegram_message_id, title FROM sync_queue WHERE status = 'completed' AND telegram_message_id IS NOT NULL AND tmdb_id IS NOT NULL"
            );

            const completedMap = new Map();
            for (const row of completedRows) {
                const key = `${row.tmdb_id}`;
                completedMap.set(key, row);
            }

            const filtered = [];
            for (const item of items) {
                const itemKey = String(item.id);
                if (completedMap.has(itemKey)) {
                    const matched = completedMap.get(itemKey);
                    item.media_type = item.media_type || defaultMediaType || matched.media_type || 'movie';
                    item.stream_url = buildStreamUrl(matched.telegram_message_id, matched.title || item.title || item.name);
                    
                    // Sanitiza caminhos de imagem caso o app use Glide com prefixo tmdb
                    if (item.poster_path) item.poster_path = sanitizeForMobile(item.poster_path);
                    if (item.backdrop_path) item.backdrop_path = sanitizeForMobile(item.backdrop_path);

                    filtered.push(item);
                }
            }
            return filtered;
        } catch (err) {
            console.error('[TMDB FILTER] Erro ao filtrar conteúdos disponíveis no Telegram:', err.message);
            return items;
        }
    }

    // 1. Trending Movies da Semana (Banner Principal)
    router.get('/trending/movie/week', async (req, res) => {
        try {
            const data = await fetchFromTmdb('trending/movie/week', req.query, db);
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results, 'movie');
            }
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
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results, 'movie');
            }
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
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results, 'movie');
            }
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
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results, 'movie');
            }
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
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results, 'tv');
            }
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
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results, 'movie');
            }
            res.json(data);
        } catch (err) {
            console.error('[TMDB PROXY] Erro discover/movie:', err.message);
            res.status(err.response?.status || 500).json({ error: 'Erro ao descobrir filmes' });
        }
    });

    // 7. Busca Multi / Busca TMDB (com interceptação inteligente para Animes e Doramas do App)
    router.get('/search', async (req, res) => {
        try {
            const rawQuery = req.query.query || req.query.q;
            if (!rawQuery) return res.status(400).json({ error: 'Parâmetro query é obrigatório' });
            
            const normalizedQuery = rawQuery.trim().toLowerCase();

            // Interceptação inteligente para carrosséis do app:
            // Quando o app pesquisa "anime", buscamos animes de verdade (discover/tv com gênero de animação e idioma japonês)
            if (normalizedQuery === 'anime' || normalizedQuery === 'animes') {
                const animeData = await fetchFromTmdb('discover/tv', {
                    ...req.query,
                    with_genres: '16', // Gênero Animação no TMDB
                    with_original_language: 'ja',
                    sort_by: 'popularity.desc'
                }, db);

                if (animeData && animeData.results) {
                    animeData.results = await filterAvailableInTelegram(animeData.results, 'tv');
                }
                return res.json(animeData);
            }

            // Quando o app pesquisa "dorama" ou "doramas", buscamos séries dramáticas coreanas/asiáticas
            if (normalizedQuery === 'dorama' || normalizedQuery === 'doramas') {
                const doramaData = await fetchFromTmdb('discover/tv', {
                    ...req.query,
                    with_genres: '18', // Gênero Drama no TMDB
                    with_original_language: 'ko', // Séries Coreanas / K-Dramas
                    sort_by: 'popularity.desc'
                }, db);

                if (doramaData && doramaData.results) {
                    doramaData.results = await filterAvailableInTelegram(doramaData.results, 'tv');
                }
                return res.json(doramaData);
            }

            // Busca normal para outros termos
            const data = await fetchFromTmdb('search/multi', { ...req.query, query: rawQuery }, db);
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results);
            }
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

            // Anexa stream_url se existir no Telegram
            const tgRow = await mainDb.get(
                "SELECT telegram_message_id, title FROM sync_queue WHERE tmdb_id = ? AND status = 'completed' AND telegram_message_id IS NOT NULL",
                [String(id)]
            );
            if (tgRow) {
                data.stream_url = buildStreamUrl(tgRow.telegram_message_id, tgRow.title || data.title);
            }

            if (data.poster_path) data.poster_path = sanitizeForMobile(data.poster_path);
            if (data.backdrop_path) data.backdrop_path = sanitizeForMobile(data.backdrop_path);

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
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results, 'movie');
            }
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

            if (data.poster_path) data.poster_path = sanitizeForMobile(data.poster_path);
            if (data.backdrop_path) data.backdrop_path = sanitizeForMobile(data.backdrop_path);

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
            if (data && data.results) {
                data.results = await filterAvailableInTelegram(data.results, 'tv');
            }
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

            // Filtra os episódios para manter apenas os que estão baixados no Telegram
            if (Array.isArray(data.episodes) && data.episodes.length > 0) {
                const completedEps = await mainDb.all(
                    "SELECT episode_number, telegram_message_id, title FROM sync_queue WHERE tmdb_id = ? AND season_number = ? AND status = 'completed' AND telegram_message_id IS NOT NULL",
                    [String(id), Number(season_number)]
                );

                const epMap = new Map();
                for (const row of completedEps) {
                    epMap.set(Number(row.episode_number), row);
                }

                // Mantém apenas os episódios baixados no Telegram e anexa stream_url
                data.episodes = data.episodes
                    .filter(ep => epMap.has(Number(ep.episode_number)))
                    .map(ep => {
                        const epMatch = epMap.get(Number(ep.episode_number));
                        ep.stream_url = buildStreamUrl(epMatch.telegram_message_id, epMatch.title || ep.name);
                        return ep;
                    });
            }

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

