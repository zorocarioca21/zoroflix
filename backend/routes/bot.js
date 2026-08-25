import express from 'express';
import fetch from 'node-fetch'; // Vite/Node environment
import { checkTitleMatch, getBestMatches } from '../../src/utils/titleMatch.js';

const router = express.Router();

export default function botRoutes(db) {
    // API Key Verification Middleware (reused from embed logic)
    const verifyKey = async (req, res, next) => {
        const apikey = req.query.apikey || req.query.apiKey;
        if (!apikey) {
            return res.status(401).json({ error: "Missing API Key" });
        }

        try {
            const keyData = await db.get("SELECT * FROM api_keys WHERE key = ? AND active = 1", [apikey]);
            if (!keyData) {
                return res.status(401).json({ error: "Invalid or inactive API Key" });
            }

            // Update usage count
            await db.run("UPDATE api_keys SET usage_count = usage_count + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?", [keyData.id]);
            next();
        } catch (err) {
            console.error("Error verifying key:", err);
            res.status(500).json({ error: "Internal server error" });
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

            const API_KEY = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY;
            const BASE_URL = 'https://api.themoviedb.org/3';

            // 1. Fetch TMDB API to get exact name, year, and ID
            const tmdbRes = await fetch(`${BASE_URL}/search/multi?query=${encodeURIComponent(q)}&api_key=${API_KEY}&language=pt-BR`);
            const tmdbData = await tmdbRes.json();

            if (!tmdbData.results || tmdbData.results.length === 0) {
                return res.json({
                    found: false,
                    title: null,
                    type: null,
                    telegram_message_id: null,
                    direct_download_url: null,
                    site_url: null,
                    error: "Media not found on TMDB"
                });
            }

            // Filter for movie or tv
            const bestMatch = tmdbData.results.find(r => r.media_type === 'movie' || r.media_type === 'tv');
            if (!bestMatch) {
                return res.json({
                    found: false,
                    error: "Media type not supported"
                });
            }

            let searchName = bestMatch.name || bestMatch.title;
            let originalName = bestMatch.original_name || bestMatch.original_title;
            let releaseYear = bestMatch.release_date ? bestMatch.release_date.split('-')[0] : (bestMatch.first_air_date ? bestMatch.first_air_date.split('-')[0] : null);
            let baseName = searchName ? searchName.split(':')[0] : null;
            let type = bestMatch.media_type === 'movie' ? 'filme' : 'serie';
            let tmdbId = bestMatch.id;
            let slug = searchName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            
            const siteUrl = `https://www.cinegeek.shop/${type}/${slug}`;

            // 2. Query local database
            const query = `
                SELECT id, title, telegram_message_id, status 
                FROM sync_queue 
                WHERE status = 'completed' AND title LIKE ?
            `;
            const searchParam = `%${searchName}%`;
            const items = await db.all(query, [searchParam]);

            let foundMsgId = null;

            if (items && items.length > 0) {
                const validItems = items.filter(i => {
                    if (i.status !== 'completed' || !i.telegram_message_id) return false;
                    
                    if (!checkTitleMatch(i.title, searchName, originalName, baseName, releaseYear, season)) return false;
                    
                    if (type === 'serie' && season && episode) {
                        const seasonRegex = /\b(?:S|T)(?:EMPORADA\s*)?0?(\d{1,2})\b/i;
                        const sMatch = i.title.match(seasonRegex);
                        if (sMatch) {
                            const fileSeason = parseInt(sMatch[1]);
                            if (fileSeason !== parseInt(season)) return false;
                        }

                        const s = String(season).padStart(2, '0');
                        const e = String(episode).padStart(2, '0');
                        const patterns = [
                            `S${s}E${e}`, `S${s} E${e}`,
                            `S${season}E${episode}`, `S${season} E${episode}`,
                            `Episódio ${episode}`, `EP${e}`, `EP ${e}`, `E${e}`
                        ];
                        const upperTitle = i.title.toUpperCase();
                        const hasEp = patterns.some(p => upperTitle.includes(p.toUpperCase()));
                        if (!hasEp) return false;
                    }

                    return true;
                });

                if (validItems.length > 0) {
                    const matches = getBestMatches(validItems, type === 'filme' ? releaseYear : null);
                    if (matches) {
                        const qualityOrder = ['FHD', 'Normal', '4K', 'TS'];
                        let selectedQuality = Object.keys(matches)[0];
                        for (let q of qualityOrder) {
                            if (matches[q]) {
                                selectedQuality = q;
                                break;
                            }
                        }
                        // Default to dubbed if available, otherwise subbed
                        foundMsgId = matches[selectedQuality].dub || matches[selectedQuality].leg;
                    }
                }
            }

            let fullTitle = searchName + (releaseYear ? ` (${releaseYear})` : '') + (season && episode ? ` S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : '');
            
            const downloadFileName = fullTitle + ' - www.cinegeek.shop';

            if (foundMsgId) {
                const payload = JSON.stringify({ id: foundMsgId, title: downloadFileName });
                const textoInvertido = payload.split('').reverse().join('');
                const textoSubstituido = textoInvertido.replace(/a/g, '§').replace(/b/g, '¶').replace(/c/g, '©');
                let token = Buffer.from(textoSubstituido, 'utf-8').toString('base64');
                token = token.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                return res.json({
                    found: true,
                    title: fullTitle,
                    type: type,
                    telegram_message_id: foundMsgId,
                    direct_download_url: `https://www.cinegeek.shop/api/stream/d/${token}`,
                    site_url: siteUrl
                });
            } else {
                return res.json({
                    found: false,
                    title: fullTitle,
                    type: type,
                    telegram_message_id: null,
                    direct_download_url: null,
                    site_url: siteUrl
                });
            }

        } catch (err) {
            console.error("Error in bot search:", err);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    return router;
}
