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
            const keyData = await db.get("SELECT * FROM api_keys WHERE key = ? AND status = 'active'", [apikey]);
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
            const { q } = req.query;
            if (!q) {
                return res.status(400).json({ error: "Query parameter 'q' is required" });
            }

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
            
            const siteUrl = `https://www.cinegeek.shop/${type}/${tmdbId}-${slug}`;

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
                    
                    // Note: season is null for this general search, we are just looking if the media exists.
                    // For series, this will return true if at least one episode matches the base name.
                    if (!checkTitleMatch(i.title, searchName, originalName, baseName, releaseYear, null)) return false;
                    
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

            if (foundMsgId) {
                return res.json({
                    found: true,
                    title: searchName + (releaseYear ? ` (${releaseYear})` : ''),
                    type: type,
                    telegram_message_id: foundMsgId,
                    direct_download_url: `https://www.cinegeek.shop/api/stream/telegram/${foundMsgId}?download=true`,
                    site_url: siteUrl
                });
            } else {
                return res.json({
                    found: false,
                    title: searchName + (releaseYear ? ` (${releaseYear})` : ''),
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
