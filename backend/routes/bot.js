import express from 'express';
import axios from 'axios';
import https from 'https';
import jwt from 'jsonwebtoken';
import { checkTitleMatch, getBestMatches } from '../../src/utils/titleMatch.js';
import { getNextTmdbKey } from '../services/tmdbKeyService.js';

const agent = new https.Agent({ family: 4 });
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

export default function botRoutes(db) {
    // API Key / Session Token Verification Middleware
    const verifyKey = async (req, res, next) => {
        // 1. Verifica se foi enviado Bearer token (Token de Sessão Seguro do App ou JWT de Usuário)
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace(/^Bearer\s+/i, '').trim();
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                req.sessionInfo = decoded;
                req.isAppClient = true;
                return next();
            } catch (err) {
                // Se falhar a verificação JWT, continua para checar se é uma API Key no formato Bearer
            }
        }

        // 2. Verifica se foi enviado Session Token via header dedicado x-session-token
        const sessionHeader = req.headers['x-session-token'];
        if (sessionHeader) {
            try {
                const decoded = jwt.verify(sessionHeader, JWT_SECRET);
                req.sessionInfo = decoded;
                req.isAppClient = true;
                return next();
            } catch (err) {
                return res.status(401).json({ error: 'Sessão expirada. Realize novo handshake em /api/mobile/session.' });
            }
        }

        // 3. Fallback: API Key tradicional
        const apikey = req.query.apikey ||
                       req.query.apiKey ||
                       req.query.api_key ||
                       req.headers['x-api-key'] ||
                       req.headers['x-apikey'] ||
                       (authHeader ? authHeader.replace(/^Bearer\s+/i, '') : null);

        if (!apikey) {
            return res.status(401).json({ error: "Missing API Key or Session Token" });
        }

        try {
            const keyData = await db.get("SELECT * FROM api_keys WHERE key = ? AND (active = 1 OR active IS NULL)", [apikey]);
            if (!keyData) {
                return res.status(401).json({ error: "Invalid or inactive API Key" });
            }

            // Update usage count
            await db.run("UPDATE api_keys SET usage_count = COALESCE(usage_count, 0) + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?", [keyData.id]);
            next();
        } catch (err) {
            console.error("Error verifying key in bot route:", err);
            res.status(500).json({ error: "Internal server error: " + err.message });
        }
    };

    router.get('/search', verifyKey, async (req, res) => {
        try {
            let { q, tmdb_id, id } = req.query;
            let targetTmdbId = tmdb_id || id || null;
            let season = req.query.season ? parseInt(req.query.season) : null;
            let episode = req.query.episode ? parseInt(req.query.episode) : null;

            if (!q && !targetTmdbId) {
                return res.status(400).json({ error: "Parâmetro 'q' ou 'tmdb_id' é obrigatório." });
            }

            // Se 'q' for puramente numérico e nenhum tmdb_id foi passado, trata 'q' como tmdb_id
            if (!targetTmdbId && q && /^\d+$/.test(q.trim())) {
                targetTmdbId = q.trim();
            }

            // Extractor for patterns like S01E05, T01E05, S1 E5, Temporada 1 Episodio 5 se vier dentro de 'q'
            if (q) {
                const seasonEpRegex = /\b(?:S|T|TEMPORADA\s*)(\d{1,2})(?:[\sEXP-]+|(?:\s*EPIS[OÓ]DIO\s*))(\d{1,3})\b/i;
                const match = q.match(seasonEpRegex);
                const altMatch = q.match(/\b(\d{1,2})[xX](\d{1,3})\b/); // 1x05
                const epOnlyRegex = /\b(?:EP|EPIS[OÓ]DIO)\s*(\d{1,3})\b/i; // Ep 05

                if (match) {
                    if (season === null) season = parseInt(match[1]);
                    if (episode === null) episode = parseInt(match[2]);
                    q = q.replace(match[0], '').trim();
                } else if (altMatch) {
                    if (season === null) season = parseInt(altMatch[1]);
                    if (episode === null) episode = parseInt(altMatch[2]);
                    q = q.replace(altMatch[0], '').trim();
                } else {
                    const epMatch = q.match(epOnlyRegex);
                    if (epMatch) {
                        if (season === null) season = 1;
                        if (episode === null) episode = parseInt(epMatch[1]);
                        q = q.replace(epMatch[0], '').trim();
                    }
                }
                q = q.replace(/[-:]$/, '').trim();
            }

            // 1. PRIORIDADE MÁXIMA: Busca direta pelos campos mapeados no SQLite (tmdb_id, season_number, episode_number)
            let foundMsgId = null;
            let fullTitle = q || `TMDB #${targetTmdbId}`;
            let type = (season !== null && episode !== null) ? 'serie' : 'filme';
            let searchName = q || null;
            let originalName = null;
            let releaseYear = null;
            let baseName = q ? q.split(':')[0] : null;
            let slug = q ? q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') : 'item';
            let siteUrl = `https://www.cinegeek.shop/${type}/${slug}`;

            if (targetTmdbId) {
                if (season !== null && episode !== null) {
                    // Episódio de Série exato mapeado!
                    const exactEp = await db.get(
                        `SELECT telegram_message_id, title FROM sync_queue 
                         WHERE status = 'completed' AND telegram_message_id IS NOT NULL 
                         AND tmdb_id = ? AND season_number = ? AND episode_number = ? 
                         ORDER BY id DESC LIMIT 1`,
                        [targetTmdbId, season, episode]
                    ).catch(() => null);

                    if (exactEp?.telegram_message_id) {
                        foundMsgId = exactEp.telegram_message_id;
                        fullTitle = exactEp.title;
                        type = 'serie';
                    }
                } else {
                    // Filme exato mapeado!
                    const exactMovie = await db.get(
                        `SELECT telegram_message_id, title FROM sync_queue 
                         WHERE status = 'completed' AND telegram_message_id IS NOT NULL 
                         AND tmdb_id = ? 
                         ORDER BY id DESC LIMIT 1`,
                        [targetTmdbId]
                    ).catch(() => null);

                    if (exactMovie?.telegram_message_id) {
                        foundMsgId = exactMovie.telegram_message_id;
                        fullTitle = exactMovie.title;
                        type = 'filme';
                    }
                }
            }

            // Se já achou direto pelo mapeamento perfeito do banco, pula requisição externa do TMDB!
            if (!foundMsgId) {
                const API_KEY = await getNextTmdbKey(db);
                const BASE_URL = 'https://api.themoviedb.org/3';

                // 2. Fetch TMDB API para descobrir dados da obra caso 'q' seja textual ou tmdb_id foi passado
                let bestMatch = null;

                try {
                    if (targetTmdbId) {
                        // Tenta buscar diretamente como TV ou Movie
                        const isProbableTv = (season !== null && episode !== null) || type === 'serie';
                        const firstType = isProbableTv ? 'tv' : 'movie';
                        const secondType = isProbableTv ? 'movie' : 'tv';

                        let detailRes = null;
                        try {
                            detailRes = await axios.get(`${BASE_URL}/${firstType}/${targetTmdbId}?api_key=${API_KEY}&language=pt-BR`, {
                                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                                httpsAgent: agent,
                                timeout: 8000
                            });
                            bestMatch = { ...detailRes.data, media_type: firstType };
                        } catch (e1) {
                            try {
                                detailRes = await axios.get(`${BASE_URL}/${secondType}/${targetTmdbId}?api_key=${API_KEY}&language=pt-BR`, {
                                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                                    httpsAgent: agent,
                                    timeout: 8000
                                });
                                bestMatch = { ...detailRes.data, media_type: secondType };
                            } catch (e2) {}
                        }
                    } else if (q) {
                        const tmdbRes = await axios.get(`${BASE_URL}/search/multi?query=${encodeURIComponent(q)}&api_key=${API_KEY}&language=pt-BR`, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                            httpsAgent: agent,
                            timeout: 8000
                        });
                        const results = tmdbRes.data?.results || [];
                        bestMatch = results.find(r => r.media_type === 'movie' || r.media_type === 'tv') || results[0];
                    }
                } catch (tmdbErr) {
                    console.error("⚠️ Failed to reach TMDB API:", tmdbErr.message);
                }

                if (bestMatch) {
                    searchName = bestMatch.name || bestMatch.title || q;
                    originalName = bestMatch.original_name || bestMatch.original_title || null;
                    releaseYear = bestMatch.release_date ? bestMatch.release_date.split('-')[0] : (bestMatch.first_air_date ? bestMatch.first_air_date.split('-')[0] : null);
                    baseName = searchName ? searchName.split(':')[0] : null;
                    type = (season !== null && episode !== null) ? 'serie' : (bestMatch.media_type === 'movie' ? 'filme' : 'serie');
                    slug = searchName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                    if (!targetTmdbId && bestMatch.id) targetTmdbId = bestMatch.id;
                }

                // Nova tentativa com tmdb_id descoberto
                if (targetTmdbId) {
                    if (type === 'serie' && season !== null && episode !== null) {
                        const epMatchDb = await db.get(
                            `SELECT telegram_message_id, title FROM sync_queue 
                             WHERE status = 'completed' AND telegram_message_id IS NOT NULL 
                             AND tmdb_id = ? AND season_number = ? AND episode_number = ? 
                             ORDER BY id DESC LIMIT 1`,
                            [targetTmdbId, season, episode]
                        ).catch(() => null);

                        if (epMatchDb?.telegram_message_id) {
                            foundMsgId = epMatchDb.telegram_message_id;
                            fullTitle = epMatchDb.title;
                        }
                    } else if (type === 'filme') {
                        const movieMatchDb = await db.get(
                            `SELECT telegram_message_id, title FROM sync_queue 
                             WHERE status = 'completed' AND telegram_message_id IS NOT NULL 
                             AND tmdb_id = ? 
                             ORDER BY id DESC LIMIT 1`,
                            [targetTmdbId]
                        ).catch(() => null);

                        if (movieMatchDb?.telegram_message_id) {
                            foundMsgId = movieMatchDb.telegram_message_id;
                            fullTitle = movieMatchDb.title;
                        }
                    }
                }

                siteUrl = `https://www.cinegeek.shop/${type}/${slug}`;

                // 3. Fallback: Se não encontrou pelo mapeamento direto, roda a lógica textual por compatibilidade
                if (!foundMsgId) {
                    if (season !== null && episode !== null) {
                        const s = String(season).padStart(2, '0');
                        const e = String(episode).padStart(2, '0');
                        
                        // 1. Specific episode search (e.g., Reacher S01 E01 / Reacher S01E01)
                        const specificSearch1 = `${searchName} S${s} E${e}`;
                        const specificSearch2 = `${searchName} S${s}E${e}`;
                        
                        let specificItems = [];
                        if (bestMatch && bestMatch.id) {
                            // Se filtrar por tmdb_id aqui, DEVE OBRIGATORIAMENTE bater a temporada e o episódio!
                            specificItems = await db.all(
                                `SELECT id, title, telegram_message_id, status FROM sync_queue 
                                 WHERE status = 'completed' 
                                 AND ((tmdb_id = ? AND season_number = ? AND episode_number = ?) OR title LIKE ? OR title LIKE ?)`,
                                [bestMatch.id, season, episode, `%${specificSearch1}%`, `%${specificSearch2}%`]
                            ).catch(() => []);
                        }
                        
                        if (!specificItems || specificItems.length === 0) {
                            specificItems = await db.all(
                                `SELECT id, title, telegram_message_id, status FROM sync_queue WHERE status = 'completed' AND (title LIKE ? OR title LIKE ?)`,
                                [`%${specificSearch1}%`, `%${specificSearch2}%`]
                            ).catch(() => []);
                        }

                        if ((!specificItems || specificItems.length === 0) && originalName) {
                            const origSearch = `${originalName} S${s} E${e}`;
                            specificItems = await db.all(
                                `SELECT id, title, telegram_message_id, status FROM sync_queue WHERE status = 'completed' AND title LIKE ?`,
                                [`%${origSearch}%`]
                            ).catch(() => []);
                        }

                        if ((!specificItems || specificItems.length === 0) && baseName) {
                            const baseSearch = `${baseName} S${s} E${e}`;
                            specificItems = await db.all(
                                `SELECT id, title, telegram_message_id, status FROM sync_queue WHERE status = 'completed' AND title LIKE ?`,
                                [`%${baseSearch}%`]
                            ).catch(() => []);
                        }

                        const patterns = [
                            `S${s}E${e}`, `S${s} E${e}`,
                            `S${season}E${episode}`, `S${season} E${episode}`,
                            `Episódio ${episode}`, `EPISÓDIO 0${episode}`, `EP${e}`, `EP ${e}`, `E${e}`
                        ];

                        if (specificItems && specificItems.length > 0) {
                            const validSpecificItems = specificItems.filter(i => {
                                if (i.status !== 'completed' || !i.telegram_message_id) return false;
                                if (!checkTitleMatch(i.title, searchName, originalName, baseName)) return false;

                                const upperTitle = i.title.toUpperCase();
                                const seasonRegex = /\b(?:S|T)(?:EMPORADA\s*)?0?(\d{1,2})\b/i;
                                const sMatch = i.title.match(seasonRegex);
                                if (sMatch) {
                                    const fileSeason = parseInt(sMatch[1]);
                                    if (fileSeason !== parseInt(season)) return false;
                                }

                                const hasEp = patterns.some(p => upperTitle.includes(p.toUpperCase()));
                                if (!hasEp) return false;

                                return true;
                            });

                            if (validSpecificItems.length > 0) {
                                const matches = getBestMatches(validSpecificItems);
                                if (matches) {
                                    const qualityOrder = ['FHD', 'HD', 'Normal', '4K', 'TS'];
                                    let selectedQuality = Object.keys(matches)[0];
                                    for (let qQuality of qualityOrder) {
                                        if (matches[qQuality]) {
                                            selectedQuality = qQuality;
                                            break;
                                        }
                                    }
                                    const itemResult = matches[selectedQuality].dub || matches[selectedQuality].leg;
                                    foundMsgId = typeof itemResult === 'object' ? itemResult.id : itemResult;
                                }
                            }
                        }

                        // 2. Fallback search (broad search by searchName / originalName / baseName mas COM filtro estrito de ep)
                        if (!foundMsgId) {
                            let items = [];
                            if (bestMatch && bestMatch.id) {
                                items = await db.all(
                                    `SELECT id, title, telegram_message_id, status FROM sync_queue 
                                     WHERE status = 'completed' AND (tmdb_id = ? OR title LIKE ? OR title LIKE ?)`,
                                    [bestMatch.id, `%${searchName}%`, `%${q}%`]
                                ).catch(() => []);
                            }

                            if (!items || items.length === 0) {
                                items = await db.all(
                                    `SELECT id, title, telegram_message_id, status FROM sync_queue WHERE status = 'completed' AND (title LIKE ? OR title LIKE ?)`,
                                    [`%${searchName}%`, `%${q}%`]
                                ).catch(() => []);
                            }

                            if (items && items.length > 0) {
                                const validItems = items.filter(i => {
                                    if (i.status !== 'completed' || !i.telegram_message_id) return false;
                                    if (!checkTitleMatch(i.title, searchName, originalName, baseName)) return false;

                                    const upperTitle = i.title.toUpperCase();
                                    const seasonRegex = /\b(?:S|T)(?:EMPORADA\s*)?0?(\d{1,2})\b/i;
                                    const sMatch = i.title.match(seasonRegex);
                                    if (sMatch) {
                                        const fileSeason = parseInt(sMatch[1]);
                                        if (fileSeason !== parseInt(season)) return false;
                                    }

                                    const hasEp = patterns.some(p => upperTitle.includes(p.toUpperCase()));
                                    if (!hasEp) return false;

                                    return true;
                                });

                                if (validItems.length > 0) {
                                    const matches = getBestMatches(validItems);
                                    if (matches) {
                                        const qualityOrder = ['FHD', 'HD', 'Normal', '4K', 'TS'];
                                        let selectedQuality = Object.keys(matches)[0];
                                        for (let qQuality of qualityOrder) {
                                            if (matches[qQuality]) {
                                                selectedQuality = qQuality;
                                                break;
                                            }
                                        }
                                        const itemResult = matches[selectedQuality].dub || matches[selectedQuality].leg;
                                        foundMsgId = typeof itemResult === 'object' ? itemResult.id : itemResult;
                                    }
                                }
                            }
                        }
                    } else {
                        // Movie search (or items without season/episode specified)
                        let items = [];
                        if (bestMatch && bestMatch.id) {
                            items = await db.all(
                                `SELECT id, title, telegram_message_id, status FROM sync_queue WHERE status = 'completed' AND (tmdb_id = ? OR title LIKE ? OR title LIKE ?)`,
                                [bestMatch.id, `%${searchName}%`, `%${q}%`]
                            ).catch(() => []);
                        }

                        if (!items || items.length === 0) {
                            items = await db.all(
                                `SELECT id, title, telegram_message_id, status FROM sync_queue WHERE status = 'completed' AND (title LIKE ? OR title LIKE ?)`,
                                [`%${searchName}%`, `%${q}%`]
                            ).catch(() => []);
                        }

                        if (items && items.length > 0) {
                            const validItems = items.filter(i => {
                                if (i.status !== 'completed' || !i.telegram_message_id) return false;
                                return checkTitleMatch(i.title, searchName, originalName, baseName, releaseYear);
                            });

                            if (validItems.length > 0) {
                                const matches = getBestMatches(validItems, type === 'filme' ? releaseYear : null);
                                if (matches) {
                                    const qualityOrder = ['FHD', 'HD', 'Normal', '4K', 'TS'];
                                    let selectedQuality = Object.keys(matches)[0];
                                    for (let qQuality of qualityOrder) {
                                        if (matches[qQuality]) {
                                            selectedQuality = qQuality;
                                            break;
                                        }
                                    }
                                    const itemResult = matches[selectedQuality].dub || matches[selectedQuality].leg;
                                    foundMsgId = typeof itemResult === 'object' ? itemResult.id : itemResult;
                                }
                            }
                        }
                    }
                }
            }

            if (!fullTitle || fullTitle.startsWith('TMDB #')) {
                fullTitle = (searchName || fullTitle) + (releaseYear ? ` (${releaseYear})` : '') + (season && episode ? ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : '');
            }
            
            const downloadFileName = fullTitle + ' - www.cinegeek.shop';

            if (foundMsgId) {
                // Adicionamos uma data de validade de 4 horas (14400000 ms) para o token do stream
                const expiration = Date.now() + 14400000;
                
                const payloadData = { id: foundMsgId, title: downloadFileName, exp: expiration };
                if (req.query.app === 'true' || req.isAppClient || req.headers['x-package-name'] || (req.headers['user-agent'] && req.headers['user-agent'].includes('CineGeek'))) {
                    payloadData.app = true;
                }
                const payload = JSON.stringify(payloadData);
                
                const textoInvertido = payload.split('').reverse().join('');
                const textoSubstituido = textoInvertido.replace(/a/g, '§').replace(/b/g, '¶').replace(/c/g, '©');
                let token = Buffer.from(textoSubstituido, 'utf-8').toString('base64');
                token = token.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                const streamUrl = `https://www.cinegeek.shop/api/stream/s/${token}.mp4`;
                const directDownloadUrl = `https://www.cinegeek.shop/api/stream/d/${token}`;

                const streamItem = {
                    id: foundMsgId,
                    title: fullTitle,
                    type: type,
                    status: 'completed',
                    found: true,
                    telegram_message_id: foundMsgId,
                    stream_url: streamUrl,
                    direct_download_url: directDownloadUrl,
                    site_url: siteUrl
                };

                return res.json({
                    ...streamItem,
                    items: [streamItem]
                });
            } else {
                const emptyItem = {
                    id: null,
                    title: fullTitle,
                    type: type,
                    status: 'not_found',
                    found: false,
                    telegram_message_id: null,
                    stream_url: null,
                    direct_download_url: null,
                    site_url: siteUrl
                };

                return res.json({
                    ...emptyItem,
                    items: []
                });
            }

        } catch (err) {
            console.error("Error in bot search:", err);
            res.status(500).json({ error: "Internal server error", details: err.message, stack: err.stack });
        }
    });

    return router;
}
