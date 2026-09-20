import express from 'express';
import fetch from 'node-fetch'; // Vite/Node environment
import { checkTitleMatch, getBestMatches } from '../../src/utils/titleMatch.js';

const router = express.Router();

export default function botRoutes(db) {
    // API Key Verification Middleware (reused from embed logic)
    const verifyKey = async (req, res, next) => {
        const apikey = req.query.apikey ||
                       req.query.apiKey ||
                       req.query.api_key ||
                       req.headers['x-api-key'] ||
                       req.headers['x-apikey'] ||
                       (req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '') : null);

        if (!apikey) {
            return res.status(401).json({ error: "Missing API Key" });
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
            let { q } = req.query;
            if (!q) {
                return res.status(400).json({ error: "Query parameter 'q' is required" });
            }

            let season = null;
            let episode = null;

            // Extractor for patterns like S01E05, T01E05, S1 E5, Temporada 1 Episodio 5
            const seasonEpRegex = /\b(?:S|T|TEMPORADA\s*)(\d{1,2})(?:[\sEXP-]+|(?:\s*EPIS[OÓ]DIO\s*))(\d{1,3})\b/i;
            const match = q.match(seasonEpRegex);
            
            const altMatch = q.match(/\b(\d{1,2})[xX](\d{1,3})\b/); // 1x05
            const epOnlyRegex = /\b(?:EP|EPIS[OÓ]DIO)\s*(\d{1,3})\b/i; // Ep 05

            if (match) {
                season = parseInt(match[1]);
                episode = parseInt(match[2]);
                q = q.replace(match[0], '').trim();
            } else if (altMatch) {
                season = parseInt(altMatch[1]);
                episode = parseInt(altMatch[2]);
                q = q.replace(altMatch[0], '').trim();
            } else {
                const epMatch = q.match(epOnlyRegex);
                if (epMatch) {
                    season = 1;
                    episode = parseInt(epMatch[1]);
                    q = q.replace(epMatch[0], '').trim();
                }
            }

            // Cleanup any trailing hyphens or colons
            q = q.replace(/[-:]$/, '').trim();

            const API_KEY = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY || 'f9cbdd4fabd4ac77cd2ca54d80a476a5';
            const BASE_URL = 'https://api.themoviedb.org/3';

            // 1. Fetch TMDB API to get exact name, year, and ID
            let tmdbData = { results: [] };
            try {
                const tmdbRes = await fetch(`${BASE_URL}/search/multi?query=${encodeURIComponent(q)}&api_key=${API_KEY}&language=pt-BR`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });
                tmdbData = await tmdbRes.json();
            } catch (tmdbErr) {
                console.error("⚠️ Failed to reach TMDB API:", tmdbErr.message);
            }

            let searchName = q;
            let originalName = null;
            let releaseYear = null;
            let baseName = q.split(':')[0];
            let type = 'filme';
            let slug = q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

            const bestMatch = (tmdbData.results || []).find(r => r.media_type === 'movie' || r.media_type === 'tv') || (tmdbData.results && tmdbData.results[0]);
            if (bestMatch) {
                searchName = bestMatch.name || bestMatch.title || q;
                originalName = bestMatch.original_name || bestMatch.original_title || null;
                releaseYear = bestMatch.release_date ? bestMatch.release_date.split('-')[0] : (bestMatch.first_air_date ? bestMatch.first_air_date.split('-')[0] : null);
                baseName = searchName ? searchName.split(':')[0] : null;
                type = bestMatch.media_type === 'movie' ? 'filme' : 'serie';
                slug = searchName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            }
            
            const siteUrl = `https://www.cinegeek.shop/${type}/${slug}`;

            // 2. Query local database by TMDB ID or title match
            let items = [];
            if (bestMatch && bestMatch.id) {
                items = await db.all(
                    `SELECT id, title, telegram_message_id, status FROM sync_queue WHERE status = 'completed' AND (tmdb_id = ? OR title LIKE ? OR title LIKE ?)`,
                    [bestMatch.id, `%${searchName}%`, `%${q}%`]
                ).catch(() => []);
            }
            
            if (!items || items.length === 0) {
                const searchParam = `%${searchName}%`;
                items = await db.all(
                    `SELECT id, title, telegram_message_id, status FROM sync_queue WHERE status = 'completed' AND (title LIKE ? OR title LIKE ?)`,
                    [searchParam, `%${q}%`]
                ).catch(() => []);
            }

            let foundMsgId = null;

            if (items && items.length > 0) {
                const validItems = items.filter(i => {
                    if (i.status !== 'completed' || !i.telegram_message_id) return false;
                    
                    const isTitleMatch = checkTitleMatch(i.title, searchName, originalName, baseName, releaseYear, season);
                    let hasEp = true;

                    if (type === 'serie' && season && episode) {
                        const seasonRegex = /\b(?:S|T)(?:EMPORADA\s*)?0?(\d{1,2})\b/i;
                        const sMatch = i.title.match(seasonRegex);
                        if (sMatch) {
                            const fileSeason = parseInt(sMatch[1]);
                            if (fileSeason !== parseInt(season)) {
                                hasEp = false;
                            }
                        }

                        if (hasEp) {
                            const s = String(season).padStart(2, '0');
                            const e = String(episode).padStart(2, '0');
                            const patterns = [
                                `S${s}E${e}`, `S${s} E${e}`,
                                `S${season}E${episode}`, `S${season} E${episode}`,
                                `Episódio ${episode}`, `EPISÓDIO 0${episode}`, `EP${e}`, `EP ${e}`, `E${e}`
                            ];
                            const upperTitle = i.title.toUpperCase();
                            hasEp = patterns.some(p => upperTitle.includes(p.toUpperCase()));
                        }
                    }

                    return isTitleMatch && hasEp;
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

            let fullTitle = searchName + (releaseYear ? ` (${releaseYear})` : '') + (season && episode ? ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : '');
            
            const downloadFileName = fullTitle + ' - www.cinegeek.shop';

            if (foundMsgId) {
                // Adicionamos uma data de validade de 4 horas (14400000 ms) para o token do stream
                const expiration = Date.now() + 14400000;
                
                const payloadData = { id: foundMsgId, title: downloadFileName, exp: expiration };
                if (req.query.app === 'true') {
                    payloadData.app = true;
                }
                const payload = JSON.stringify(payloadData);
                
                const textoInvertido = payload.split('').reverse().join('');
                const textoSubstituido = textoInvertido.replace(/a/g, '§').replace(/b/g, '¶').replace(/c/g, '©');
                let token = Buffer.from(textoSubstituido, 'utf-8').toString('base64');
                token = token.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                return res.json({
                    found: true,
                    title: fullTitle,
                    type: type,
                    telegram_message_id: foundMsgId,
                    stream_url: `https://www.cinegeek.shop/api/stream/s/${token}.mp4`,
                    direct_download_url: `https://www.cinegeek.shop/api/stream/d/${token}`,
                    site_url: siteUrl
                });
            } else {
                return res.json({
                    found: false,
                    title: fullTitle,
                    type: type,
                    telegram_message_id: null,
                    stream_url: null,
                    direct_download_url: null,
                    site_url: siteUrl
                });
            }

        } catch (err) {
            console.error("Error in bot search:", err);
            res.status(500).json({ error: "Internal server error", details: err.message, stack: err.stack });
        }
    });

    return router;
}
