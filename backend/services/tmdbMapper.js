import { getNextTmdbKey } from './tmdbKeyService.js';
import { getOrFetchMediaDetails } from './tmdbCacheService.js';
import { initTmdbCatalogDB } from '../tmdbCatalogDB.js';
import { extractMetadataWithAI } from './aiMetadataService.js';
import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ family: 4 }); // Força IPv4 para evitar problemas de DNS/IPv6 em VPS

let tmdbDbInstance = null;

/**
 * Mapeia em lote os itens que ainda não possuem tmdb_id na fila.
 * Deve ser chamado via Worker (setInterval)
 */
export async function mapPendingTmdbItems(db, batchSize = 20) {
    if (!tmdbDbInstance) {
        tmdbDbInstance = await initTmdbCatalogDB();
    }
    try {
        const itemsToMap = await db.all(`
            SELECT id, title
            FROM sync_queue
            WHERE (tmdb_id IS NULL OR (tmdb_id = 'NOT_FOUND' AND updated_at < datetime('now', '-24 hours')))
            ORDER BY tmdb_id IS NULL DESC, updated_at ASC
            LIMIT ?
        `, [batchSize]);

        if (!itemsToMap || itemsToMap.length === 0) {
            return;
        }

        const apiKey = await getNextTmdbKey(db);
        if (!apiKey) {
            console.warn("[TMDB MAPPER] Nenhuma API Key disponível para o mapper.");
            return;
        }

        console.log(`[TMDB MAPPER] Iniciando mapeamento de ${itemsToMap.length} itens...`);

        let updatedCount = 0;

        for (const item of itemsToMap) {
            let tmdb_id = null;
            let media_type = null;
            let season_number = null;
            let episode_number = null;

            // Se for canal ao vivo, canal 24H ou transmissão de câmeras de reality show (ex: A Fazenda CAM 1, 24H • Dragon Ball Z, [24H] Zé Buscapé)
            const isLiveOrRealityCam = (t) => {
                if (!t) return false;
                if (/\[\s*24\s*(?:H|HS|HORAS)?\s*\]/i.test(t)) return true;
                if (/(?:^|\s|[•|:\-\/])24\s*(?:H|HS|HORAS)\b/i.test(t)) return true;
                if (/\b(?:CAM|CAMERA|CÂMERA)\s*\d+\b/i.test(t)) return true;
                if (/\b(?:A\s+FAZENDA|BBB|BIG\s+BROTHER|DE\s+FERIAS\s+COM\s+O\s+EX|ESTRELA\s+DA\s+CASA)\s+.*?\b(?:CAM|MOSAICO|AO\s+VIVO)\b/i.test(t)) return true;
                return false;
            };

            if (isLiveOrRealityCam(item.title)) {
                await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND', status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
                continue;
            }

            // Extrai as infos básicas do título (temporada/episódio/ano)
            let q = item.title;
            const yearMatch = q.match(/[\(\[](\d{4})[\)\]]/);
            const year = yearMatch ? yearMatch[1] : null;
            q = q.replace(/[\(\[]\d{4}[\)\]]/g, '').trim();

            const sEpCombinedMatch = q.match(/\b(?:S|T)0?(\d{1,2})\s*(?:E|EP|EPIS[OÓ]DIO)\s*0?(\d{1,3})\b/i);
            const sMatch = q.match(/\b(?:S|T)(?:EMPORADA\s*)?0?(\d{1,2})\b/i);
            const epMatch = q.match(/\b(?:E|EP|EPIS[OÓ]DIO)\s*0?(\d{1,3})\b/i);

            if (sEpCombinedMatch) {
                season_number = parseInt(sEpCombinedMatch[1]);
                episode_number = parseInt(sEpCombinedMatch[2]);
                // Para séries no padrão "Nome da Série - S01E01 - Nome do Episódio", o que importa para achar no TMDB é o que está ANTES da temporada/episódio!
                const parts = q.split(sEpCombinedMatch[0]);
                if (parts[0] && parts[0].trim().length > 1) {
                    q = parts[0].trim();
                } else {
                    q = q.replace(sEpCombinedMatch[0], '').trim();
                }
            } else if (sMatch && epMatch) {
                season_number = parseInt(sMatch[1]);
                episode_number = parseInt(epMatch[1]);
                const matchIndex = Math.min(sMatch.index, epMatch.index);
                const beforeMatch = q.substring(0, matchIndex).trim();
                if (beforeMatch.length > 1) {
                    q = beforeMatch;
                } else {
                    q = q.replace(sMatch[0], '').replace(epMatch[0], '').trim();
                }
            } else {
                const epOnlyRegex = /\b(?:EPIS[OÓ]DIO|EP|E)\s*0?(\d{1,3})\b/i;
                const altMatch = q.match(epOnlyRegex);
                if (altMatch) {
                    season_number = 1;
                    episode_number = parseInt(altMatch[1]);
                    const beforeMatch = q.substring(0, altMatch.index).trim();
                    if (beforeMatch.length > 1) {
                        q = beforeMatch;
                    } else {
                        q = q.replace(altMatch[0], '').trim();
                    }
                }
            }

            // Remove tags e limpa o texto principal
            const tagsRegex = /\b(DUBLADO|LEGENDADO|LEG|HD|FHD|4K|1080P|720P|2160P|CAMRIP|MP4|MKV|AVI)\b/i;
            const tagMatch = q.match(tagsRegex);
            if (tagMatch) {
                q = q.substring(0, tagMatch.index).trim();
            }
            // Substitui pontos e underscores por espaços (ex: The.Walking.Dead_S01 -> The Walking Dead)
            q = q.replace(/[._]/g, ' ');
            // Remove traços, dois pontos, barras e pontuações do final ou início do nome
            q = q.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();
            // Remove espaços duplos
            q = q.replace(/\s+/g, ' ');

            if (!q) {
                // Título não pode ser vazio para a busca
                await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND' WHERE id = ?", [item.id]);
                continue;
            }

            let hasNetworkError = false;
            let bestMatch = null;
            try {
                const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&api_key=${apiKey}&language=pt-BR`;
                const tmdbRes = await axios.get(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    httpsAgent: agent,
                    timeout: 10000 // 10 segundos
                });
                
                if (tmdbRes.status === 200) {
                    const tmdbData = tmdbRes.data;
                    if (tmdbData.results && tmdbData.results.length > 0) {
                        if (year) {
                            bestMatch = tmdbData.results.find(r => {
                                const rYear = r.release_date ? r.release_date.split('-')[0] : (r.first_air_date ? r.first_air_date.split('-')[0] : null);
                                return rYear === year && (r.media_type === 'movie' || r.media_type === 'tv');
                            });
                        }
                        if (!bestMatch) {
                            bestMatch = tmdbData.results.find(r => r.media_type === 'movie' || r.media_type === 'tv');
                        }
                    }

                    if (bestMatch) {
                        tmdb_id = String(bestMatch.id);
                        media_type = bestMatch.media_type;
                    }
                } else {
                    console.error(`[TMDB MAPPER] HTTP Error ${tmdbRes.status} ao buscar ${q}`);
                    if (tmdbRes.status === 429) hasNetworkError = true; // Rate limit, try again later
                }
            } catch (err) {
                hasNetworkError = true;
                const status = err.response ? err.response.status : 'NETWORK_ERROR';
                if (status === 429) {
                    console.error(`[TMDB MAPPER] Rate Limit (429) ao buscar ${q}.`);
                } else {
                    console.error(`[TMDB MAPPER] Falha de rede ao buscar ${q}:`, err.message);
                }
            }

            // ==========================================
            // FALLBACK COM IA (GEMINI 3.5 FLASH)
            // ==========================================
            if (!tmdb_id && !hasNetworkError) {
                try {
                    console.log(`[TMDB MAPPER] 🤖 Tentando decodificar com IA (Gemini 3.5 Flash): "${item.title}"...`);
                    const aiResult = await extractMetadataWithAI(item.title);
                    if (aiResult) {
                        // Se for conteúdo adulto pornográfico (+18 pornô) que não tem no TMDB
                        if (aiResult.is_porn) {
                            console.log(`[TMDB MAPPER] 🔞 Conteúdo pornográfico detectado pela IA: "${item.title}". Marcando como NOT_FOUND.`);
                            await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND', status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
                            continue;
                        }

                        // Se a IA detectou que é câmera ao vivo de reality ou canal 24H
                        if (aiResult.is_live_stream) {
                            console.log(`[TMDB MAPPER] 📹 Câmera ao vivo / Canal 24h detectado pela IA: "${item.title}". Pulando.`);
                            await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND', status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
                            continue;
                        }

                        if (aiResult.season !== null && aiResult.season !== undefined) season_number = aiResult.season;
                        if (aiResult.episode !== null && aiResult.episode !== undefined) episode_number = aiResult.episode;
                        if (aiResult.media_type) media_type = aiResult.media_type;

                        const aiQueries = [
                            aiResult.parent_series,
                            aiResult.search_query,
                            aiResult.original_title
                        ].filter(Boolean);

                        for (const queryCandidate of aiQueries) {
                            try {
                                const targetType = aiResult.media_type === 'movie' ? 'movie' : (aiResult.media_type === 'tv' ? 'tv' : 'multi');
                                const aiUrl = `https://api.themoviedb.org/3/search/${targetType}?query=${encodeURIComponent(queryCandidate)}&api_key=${apiKey}&language=pt-BR`;
                                const aiTmdbRes = await axios.get(aiUrl, {
                                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                                    httpsAgent: agent,
                                    timeout: 10000
                                });

                                if (aiTmdbRes.status === 200 && aiTmdbRes.data.results && aiTmdbRes.data.results.length > 0) {
                                    bestMatch = aiTmdbRes.data.results[0];
                                    tmdb_id = String(bestMatch.id);
                                    media_type = bestMatch.media_type || aiResult.media_type;
                                    console.log(`[TMDB MAPPER] 🎯 IA Encontrou TMDB com sucesso! "${bestMatch.title || bestMatch.name}" (ID: ${tmdb_id})`);
                                    break;
                                }
                            } catch (e) {
                                // Tenta a próxima query sugerida pela IA
                            }
                        }
                    }
                } catch (aiErr) {
                    console.warn(`[TMDB MAPPER] Erro no fallback de IA:`, aiErr.message);
                }
            }

            if (tmdb_id) {
                await db.run(
                    "UPDATE sync_queue SET tmdb_id = ?, media_type = ?, season_number = ?, episode_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [tmdb_id, media_type, season_number, episode_number, item.id]
                );
                updatedCount++;

                // Salva os dados básicos no catálogo para que apareça no painel e no front, SEM disparar download pro Zoro Drive
                if (bestMatch) {
                    try {
                        const title = bestMatch.title || bestMatch.name || '';
                        const origTitle = bestMatch.original_title || bestMatch.original_name || '';
                        const overview = bestMatch.overview || '';
                        const releaseDate = bestMatch.release_date || bestMatch.first_air_date || '';

                        await tmdbDbInstance.run(`
                            INSERT OR REPLACE INTO tmdb_media_cache 
                            (tmdb_id, media_type, title, original_title, overview, release_date, poster_url, backdrop_url, raw_data, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        `, [
                            tmdb_id,
                            media_type,
                            title,
                            origTitle,
                            overview,
                            releaseDate,
                            bestMatch.poster_path ? `https://image.tmdb.org/t/p/w500${bestMatch.poster_path}` : null,
                            bestMatch.backdrop_path ? `https://image.tmdb.org/t/p/original${bestMatch.backdrop_path}` : null,
                            JSON.stringify(bestMatch)
                        ]);
                    } catch (cacheErr) {
                        console.error("[TMDB MAPPER] Erro ao salvar pre-cache básico:", cacheErr.message);
                    }
                }
            } else if (!hasNetworkError) {
                console.log(`[TMDB MAPPER] ❌ FALHA: Não encontrou "${item.title}" no TMDB. Arquivo possivelmente fora do padrão.`);
                await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
            }
            
            // Pausa maior (500ms) para evitar qualquer block por rajada na API
            await new Promise(res => setTimeout(res, 500));
        }

        console.log(`[TMDB MAPPER] Mapeados ${updatedCount} de ${itemsToMap.length} processados.`);
    } catch (err) {
        console.error("[TMDB MAPPER] Erro geral no loop:", err);
    }
}
