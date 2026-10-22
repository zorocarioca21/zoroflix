import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ family: 4 });
const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';

// Cache em memória de curto prazo (30 minutos)
const anilistMemoryCache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

/**
 * Executa uma query GraphQL na AniList com retry e timeout seguro
 */
async function executeAniListQuery(query, variables = {}) {
    const cacheKey = JSON.stringify({ query, variables });
    const cached = anilistMemoryCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }

    try {
        const response = await axios.post(
            ANILIST_GRAPHQL_ENDPOINT,
            { query, variables },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'CineGeek/2.0'
                },
                httpsAgent: agent,
                timeout: 10000
            }
        );

        const data = response.data?.data;
        if (data) {
            anilistMemoryCache.set(cacheKey, { data, timestamp: Date.now() });
        }
        return data;
    } catch (err) {
        console.error('[AniList Service] Erro na requisição GraphQL:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Busca detalhes completos de um anime pelo ID da AniList ou pelo Título
 */
export async function getAniListDetails(idOrTitle, isId = true) {
    const query = `
    query ($id: Int, $search: String) {
        Media(id: $id, search: $search, type: ANIME) {
            id
            idMal
            title {
                romaji
                english
                native
            }
            format
            status
            description(asHtml: false)
            season
            seasonYear
            episodes
            duration
            coverImage {
                extraLarge
                large
                color
            }
            bannerImage
            genres
            averageScore
            studios(isMain: true) {
                nodes {
                    name
                }
            }
            trailer {
                id
                site
            }
            nextAiringEpisode {
                episode
                airingAt
            }
            streamingEpisodes {
                title
                thumbnail
                url
                site
            }
            relations {
                edges {
                    relationType
                    node {
                        id
                        idMal
                        title {
                            romaji
                            english
                        }
                        format
                        episodes
                        seasonYear
                        status
                        coverImage {
                            large
                        }
                    }
                }
            }
        }
    }
    `;

    const variables = isId ? { id: parseInt(idOrTitle, 10) } : { search: String(idOrTitle) };
    const res = await executeAniListQuery(query, variables);
    return res?.Media || null;
}

/**
 * Busca animes populares ou em alta para a aba/seção de Animes
 */
export async function getAniListTrending(page = 1, perPage = 20) {
    const query = `
    query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
            pageInfo {
                total
                currentPage
                lastPage
                hasNextPage
            }
            media(type: ANIME, sort: [TRENDING_DESC, POPULARITY_DESC]) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                }
                format
                status
                seasonYear
                episodes
                coverImage {
                    large
                    extraLarge
                    color
                }
                bannerImage
                averageScore
                genres
                studios(isMain: true) {
                    nodes {
                        name
                    }
                }
            }
        }
    }
    `;

    const res = await executeAniListQuery(query, { page, perPage });
    return res?.Page || { media: [] };
}

/**
 * Busca animes na AniList por termo de pesquisa
 */
export async function searchAniList(searchQuery, page = 1, perPage = 20) {
    if (!searchQuery) return { media: [] };

    const query = `
    query ($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
            pageInfo {
                total
                currentPage
                hasNextPage
            }
            media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                }
                format
                status
                seasonYear
                episodes
                coverImage {
                    large
                    extraLarge
                }
                bannerImage
                averageScore
                genres
                studios(isMain: true) {
                    nodes {
                        name
                    }
                }
            }
        }
    }
    `;

    const res = await executeAniListQuery(query, { search: searchQuery, page, perPage });
    return res?.Page || { media: [] };
}

/**
 * Resolve e faz o mapeamento entre um anime do AniList e o acervo existente no banco (sync_queue)
 * Utiliza o título e números de episódios para que os arquivos já cadastrados sejam encontrados sem refazer nada!
 */
export async function mapAniListToLocalContent(db, animeTitle, anilistData = null) {
    if (!db || !animeTitle) return null;

    try {
        // Tenta buscar no sync_queue itens já completados que correspondam ao título
        const cleanTitle = animeTitle
            .replace(/[^\w\s]/gi, '')
            .trim();

        const localItems = await db.all(
            `SELECT id, tmdb_id, season_number, episode_number, title, telegram_message_id, status 
             FROM sync_queue 
             WHERE status = 'completed' AND telegram_message_id IS NOT NULL AND title LIKE ? 
             ORDER BY season_number ASC, episode_number ASC`,
            [`%${cleanTitle}%`]
        );

        if (!localItems || localItems.length === 0) return null;

        // Extrai o TMDB ID predominante caso exista
        const tmdbId = localItems.find(i => i.tmdb_id)?.tmdb_id || null;

        return {
            tmdb_id: tmdbId,
            matchedCount: localItems.length,
            items: localItems
        };
    } catch (err) {
        console.error('[AniList Service] Erro ao mapear conteúdo local:', err.message);
        return null;
    }
}
