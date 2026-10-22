import express from 'express';
import { 
    getAniListDetails, 
    getAniListTrending, 
    searchAniList, 
    mapAniListToLocalContent 
} from '../services/anilistService.js';

const router = express.Router();

export default function anilistRoutes(appDb, tmdbDb) {
    const db = appDb;

    /**
     * GET /api/anilist/trending
     * Retorna animes populares e em alta na temporada
     */
    router.get('/trending', async (req, res) => {
        try {
            const page = parseInt(req.query.page, 10) || 1;
            const perPage = parseInt(req.query.perPage, 10) || 20;
            const data = await getAniListTrending(page, perPage);
            res.json(data);
        } catch (err) {
            console.error('[AniList Route] Erro ao buscar trending:', err);
            res.status(500).json({ error: 'Erro ao buscar animes em alta' });
        }
    });

    /**
     * GET /api/anilist/search
     * Busca animes na AniList
     */
    router.get('/search', async (req, res) => {
        try {
            const q = req.query.q;
            if (!q) return res.json({ media: [] });
            const page = parseInt(req.query.page, 10) || 1;
            const perPage = parseInt(req.query.perPage, 10) || 20;
            const data = await searchAniList(q, page, perPage);
            res.json(data);
        } catch (err) {
            console.error('[AniList Route] Erro na busca:', err);
            res.status(500).json({ error: 'Erro ao buscar animes' });
        }
    });

    /**
     * GET /api/anilist/details/:id
     * Detalhes completos do anime, com relações (temporadas e filmes) e cruza com arquivos locais do banco
     */
    router.get('/details/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const details = await getAniListDetails(id, true);
            if (!details) {
                return res.status(404).json({ error: 'Anime não encontrado na AniList' });
            }

            // Tenta mapear com os arquivos que já temos salvos no sync_queue (TMDB ID e Telegram Message IDs)
            const mainTitle = details.title.english || details.title.romaji;
            const localMatch = await mapAniListToLocalContent(db, mainTitle, details);

            // Adiciona informações de disponibilidade local sem alterar a estrutura da AniList
            const responseData = {
                ...details,
                localMapping: localMatch ? {
                    tmdb_id: localMatch.tmdb_id,
                    availableEpisodesCount: localMatch.matchedCount,
                    hasLocalFiles: localMatch.matchedCount > 0
                } : null
            };

            res.json(responseData);
        } catch (err) {
            console.error('[AniList Route] Erro ao buscar detalhes:', err);
            res.status(500).json({ error: 'Erro ao buscar detalhes do anime' });
        }
    });

    /**
     * GET /api/anilist/mapping/:tmdbId
     * Permite ao frontend descobrir o AniList ID de um anime a partir de um TMDB ID já existente
     */
    router.get('/mapping/:tmdbId', async (req, res) => {
        try {
            const { tmdbId } = req.params;
            // Busca o nome do anime no cache do TMDB ou no query param title
            let titleToSearch = req.query.title;
            if (!titleToSearch) {
                const tmdbItem = await tmdbDb?.get(
                    'SELECT title, original_title FROM tmdb_media_cache WHERE tmdb_id = ? AND media_type = "tv"',
                    [String(tmdbId)]
                );
                titleToSearch = tmdbItem?.original_title || tmdbItem?.title;
            }
            if (!titleToSearch) {
                return res.json({ found: false, anilistId: null });
            }

            const searchResult = await searchAniList(titleToSearch, 1, 5);
            const best = searchResult.media?.[0];

            if (best) {
                return res.json({
                    found: true,
                    anilistId: best.id,
                    title: best.title,
                    coverImage: best.coverImage
                });
            }

            res.json({ found: false, anilistId: null });
        } catch (err) {
            console.error('[AniList Route] Erro no mapeamento TMDB -> AniList:', err);
            res.status(500).json({ error: 'Erro ao mapear ID' });
        }
    });

    return router;
}
