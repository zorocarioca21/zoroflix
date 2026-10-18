import { getNextTmdbKey } from './tmdbKeyService.js';
import { getOrFetchMediaDetails } from './tmdbCacheService.js';
import { initTmdbCatalogDB } from '../tmdbCatalogDB.js';
import { extractMetadataWithAI } from './aiMetadataService.js';
import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ family: 4 }); // Força IPv4 para evitar problemas de DNS/IPv6 em VPS

let tmdbDbInstance = null;
let isAiMapperPaused = false;

// Cache local de episódios de temporadas do TMDB para evitar requisições repetidas
const seasonEpisodesCache = new Map();

/**
 * Busca a lista de episódios de uma temporada no TMDB (em pt-BR e en-US) e tenta
 * identificar o episode_number correto a partir do nome do episódio contido no título.
 * Ex: "Lanternas S01 Dirt and Stars HD" -> S1E8
 */
async function resolveEpisodeNumberFromSeason(tmdbId, seasonNum, candidateEpName, apiKey) {
    if (!tmdbId || !seasonNum || !candidateEpName || candidateEpName.length < 2 || !apiKey) return null;

    const cacheKey = `${tmdbId}_s${seasonNum}`;
    let episodeList = seasonEpisodesCache.get(cacheKey);

    const norm = (s) => (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!episodeList) {
        try {
            const [ptRes, enRes] = await Promise.all([
                axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${apiKey}&language=pt-BR`, { timeout: 8000, httpsAgent: agent }).catch(() => null),
                axios.get(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${apiKey}&language=en-US`, { timeout: 8000, httpsAgent: agent }).catch(() => null)
            ]);

            const ptEps = ptRes?.data?.episodes || [];
            const enEps = enRes?.data?.episodes || [];

            if (ptEps.length === 0 && enEps.length === 0) return null;

            episodeList = ptEps.map(ep => {
                const enEp = enEps.find(e => e.episode_number === ep.episode_number);
                return {
                    episode_number: ep.episode_number,
                    names: [norm(ep.name), norm(enEp?.name)].filter(Boolean)
                };
            });

            // Se enEps tiver episódios que não vieram em ptEps
            for (const enEp of enEps) {
                if (!episodeList.some(e => e.episode_number === enEp.episode_number)) {
                    episodeList.push({
                        episode_number: enEp.episode_number,
                        names: [norm(enEp.name)].filter(Boolean)
                    });
                }
            }

            seasonEpisodesCache.set(cacheKey, episodeList);
        } catch (e) {
            return null;
        }
    }

    if (!episodeList || episodeList.length === 0) return null;

    const normCandidate = norm(candidateEpName);
    if (!normCandidate || normCandidate.length < 2) return null;

    // 1. Match exato de nome
    let found = episodeList.find(e => e.names.some(n => n === normCandidate));
    if (found) return found.episode_number;

    // 2. Match parcial (conter substring com mais de 3 chars)
    if (normCandidate.length >= 4) {
        found = episodeList.find(e => e.names.some(n => n.length >= 4 && (n.includes(normCandidate) || normCandidate.includes(n))));
        if (found) return found.episode_number;
    }

    return null;
}

export function setAiMapperPauseState(paused) {
    isAiMapperPaused = Boolean(paused);
    console.log(`[TMDB MAPPER] ⏸️ IA no mapeador automático de 10 em 10 ${isAiMapperPaused ? 'PAUSADA' : 'RETOMADA'}.`);
    return isAiMapperPaused;
}

export function getAiMapperPauseState() {
    return isAiMapperPaused;
}

/**
 * Mapeia em lote APENAS os itens que JÁ FORAM BAIXADOS (status = 'completed') 
 * que ainda não possuem tmdb_id ou falharam há mais de 24 horas.
 * Itens pendentes na fila NÃO são mapeados aqui.
 */
export async function mapPendingTmdbItems(db, batchSize = 20) {
    if (!tmdbDbInstance) {
        tmdbDbInstance = await initTmdbCatalogDB();
    }
    try {
        const itemsToMap = await db.all(`
            SELECT id, title
            FROM sync_queue
            WHERE status = 'completed'
              AND (tmdb_id IS NULL OR (tmdb_id = 'NOT_FOUND' AND updated_at < datetime('now', '-24 hours')))
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

            let candidateEpName = null;

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
            } else if (sMatch && !epMatch) {
                season_number = parseInt(sMatch[1]);
                const beforeMatch = q.substring(0, sMatch.index).trim();
                let afterSeason = q.substring(sMatch.index + sMatch[0].length).trim();
                afterSeason = afterSeason.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();

                const tagsRegexEarly = /\b(DUBLADO|LEGENDADO|LEG|HD|FHD|4K|1080P|720P|2160P|CAMRIP|MP4|MKV|AVI)\b/i;
                const earlyTag = afterSeason.match(tagsRegexEarly);
                candidateEpName = earlyTag ? afterSeason.substring(0, earlyTag.index).trim() : afterSeason.trim();
                candidateEpName = candidateEpName.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();

                if (beforeMatch.length > 1) {
                    q = beforeMatch;
                } else {
                    q = q.replace(sMatch[0], '').trim();
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
            
            // Lista de variações locais para tentar antes de gastar cota de IA
            // Ex: "D.P.A. 2: O Filme - O Mistério Italiano" -> tenta o título completo, depois remove ": O Filme...", etc.
            const queryCandidates = [q];
            if (q.includes(':')) {
                queryCandidates.push(q.split(':')[0].trim());
            }
            if (q.includes(' - ')) {
                queryCandidates.push(q.split(' - ')[0].trim());
            }
            if (/\b\d{1,2}\b/.test(q)) {
                // Ex: "D.P.A. 2: O Filme" -> "D.P.A. 2"
                const numMatch = q.match(/^(.*?\b\d{1,2}\b)/);
                if (numMatch && numMatch[1].trim() !== q) {
                    queryCandidates.push(numMatch[1].trim());
                }
            }

            // Remove duplicados
            const uniqueQueries = [...new Set(queryCandidates.filter(Boolean))];

            try {
                for (const candidate of uniqueQueries) {
                    const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(candidate)}&api_key=${apiKey}&language=pt-BR`;
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
                            break;
                        }
                    } else {
                        console.error(`[TMDB MAPPER] HTTP Error ${tmdbRes.status} ao buscar ${candidate}`);
                        if (tmdbRes.status === 429) hasNetworkError = true;
                    }
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

            let hadAiRateLimit = false;

            // ==========================================
            // FALLBACK COM IA (GEMINI 3.5 FLASH)
            // ==========================================
            if (!tmdb_id && !hasNetworkError) {
                if (isAiMapperPaused) {
                    // IA pausada pelo administrador: não chama a API ZoroBot/Gemini
                } else {
                    try {
                        console.log(`[TMDB MAPPER] 🤖 Tentando decodificar com IA (Gemini 3.5 Flash): "${item.title}"...`);
                        const aiResult = await extractMetadataWithAI(item.title);
                    if (aiResult) {
                        if (aiResult.is_rate_limit) {
                            hadAiRateLimit = true;
                            console.warn(`[TMDB MAPPER] ⏳ Cota temporária da IA atingida (429/503). O item "${item.title}" será reprocessado no próximo ciclo sem ser descartado.`);
                        } else if (aiResult.is_porn) {
                            console.log(`[TMDB MAPPER] 🔞 Conteúdo pornográfico detectado pela IA: "${item.title}". Marcando como NOT_FOUND.`);
                            await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND', status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
                            continue;
                        } else if (aiResult.is_live_stream) {
                            console.log(`[TMDB MAPPER] 📹 Câmera ao vivo / Canal 24h detectado pela IA: "${item.title}". Pulando.`);
                            await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND', status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
                            continue;
                        } else {
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
                    }
                } catch (aiErr) {
                    console.warn(`[TMDB MAPPER] Erro no fallback de IA:`, aiErr.message);
                }
            }
        }

            if (tmdb_id) {
                // Se temos uma temporada e um nome de episódio candidato, mas não tínhamos o número do episódio
                if (media_type === 'tv' && season_number && !episode_number && candidateEpName) {
                    try {
                        const resolvedEp = await resolveEpisodeNumberFromSeason(tmdb_id, season_number, candidateEpName, apiKey);
                        if (resolvedEp) {
                            episode_number = resolvedEp;
                            console.log(`[TMDB MAPPER] 🔎 Episódio identificado pelo nome: S${String(season_number).padStart(2, '0')}E${String(episode_number).padStart(2, '0')} ("${candidateEpName}")`);
                        }
                    } catch (epErr) {}
                }

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
            } else if (!hasNetworkError && !hadAiRateLimit) {
                console.log(`[TMDB MAPPER] ❌ FALHA: Não encontrou "${item.title}" no TMDB. Arquivo possivelmente fora do padrão.`);
                await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
            }
            
            // Pausa entre itens para respeitar rate limits (1.5s se usou IA, 500ms se foi busca direta)
            await new Promise(res => setTimeout(res, hadAiRateLimit ? 5000 : 800));
        }

        console.log(`[TMDB MAPPER] Mapeados ${updatedCount} de ${itemsToMap.length} processados.`);
    } catch (err) {
        console.error("[TMDB MAPPER] Erro geral no loop:", err);
    }
}

/**
 * Mapeia um único item recém-baixado da IPTV ou enviado via upload manual.
 * Chamado pontualmente logo após o download ou upload concluir.
 */
export async function mapSingleQueueItem(db, itemId) {
    if (!itemId) return;
    try {
        const item = await db.get("SELECT id, title, tmdb_id FROM sync_queue WHERE id = ?", [itemId]);
        if (!item || (item.tmdb_id && item.tmdb_id !== 'NOT_FOUND')) return;

        console.log(`[TMDB MAPPER] 🎯 Mapeando item individual recém-processado #${item.id}: "${item.title}"`);
        
        // Executa uma rodada pontual apenas para esse ID
        const apiKey = await getNextTmdbKey(db);
        if (!apiKey) return;

        if (!tmdbDbInstance) {
            tmdbDbInstance = await initTmdbCatalogDB();
        }

        // Reutiliza a rotina passando uma lista contendo apenas este item
        const singleList = [{ id: item.id, title: item.title }];
        
        // Executa busca para o item
        let tmdb_id = null;
        let media_type = null;
        let season_number = null;
        let episode_number = null;

        let q = item.title;
        const yearMatch = q.match(/[\(\[](\d{4})[\)\]]/);
        const year = yearMatch ? yearMatch[1] : null;
        q = q.replace(/[\(\[]\d{4}[\)\]]/g, '').trim();

        const sEpCombinedMatch = q.match(/\b(?:S|T)0?(\d{1,2})\s*(?:E|EP|EPIS[OÓ]DIO)\s*0?(\d{1,3})\b/i);
        const sMatch = q.match(/\b(?:S|T)(?:EMPORADA\s*)?0?(\d{1,2})\b/i);
        const epMatch = q.match(/\b(?:E|EP|EPIS[OÓ]DIO)\s*0?(\d{1,3})\b/i);

        let candidateEpName = null;

        if (sEpCombinedMatch) {
            season_number = parseInt(sEpCombinedMatch[1], 10);
            episode_number = parseInt(sEpCombinedMatch[2], 10);
            media_type = 'tv';
        } else if (sMatch && epMatch) {
            season_number = parseInt(sMatch[1], 10);
            episode_number = parseInt(epMatch[1], 10);
            media_type = 'tv';
        } else if (sMatch && !epMatch) {
            season_number = parseInt(sMatch[1], 10);
            media_type = 'tv';
            let afterSeason = q.substring(sMatch.index + sMatch[0].length).trim();
            afterSeason = afterSeason.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();

            const tagsRegexEarly = /\b(DUBLADO|LEGENDADO|LEG|HD|FHD|4K|1080P|720P|2160P|CAMRIP|MP4|MKV|AVI)\b/i;
            const earlyTag = afterSeason.match(tagsRegexEarly);
            candidateEpName = earlyTag ? afterSeason.substring(0, earlyTag.index).trim() : afterSeason.trim();
            candidateEpName = candidateEpName.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();
        }

        const isTvRegex = /\b(?:S\d{1,2}|T\d{1,2}|Temporada\s*\d{1,2}|Epis[oó]dio\s*\d{1,3}|E\d{1,3})\b/i;
        if (isTvRegex.test(q)) {
            media_type = 'tv';
        } else {
            media_type = 'movie';
        }

        // Limpeza básica
        let cleanQuery = q
            .replace(/\b(?:S\d{1,2}\s*E\d{1,3}|S\d{1,2}|T\d{1,2}|Temporada\s*\d{1,2}|Epis[oó]dio\s*\d{1,3}|E\d{1,3})\b/gi, ' ')
            .replace(/\b(?:4K|1080P|720P|FHD|HD|WEB-?DL|WEBRIP|BLURAY|DUBLADO|LEGENDADO|NACIONAL|COMPLETO)\b/gi, ' ')
            .replace(/[-_.]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const endpoint = media_type === 'tv'
            ? `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(cleanQuery)}&language=pt-BR`
            : `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(cleanQuery)}&language=pt-BR${year ? `&year=${year}` : ''}`;

        const resp = await axios.get(endpoint, { timeout: 8000, httpsAgent: agent }).catch(() => null);
        const results = resp?.data?.results || [];

        let bestMatch = results[0] || null;

        // Se falhou e IA estiver ativa, usa Gemini 3.5 Flash
        if (!bestMatch && !isAiMapperPaused) {
            try {
                const aiData = await extractMetadataWithAI(item.title);
                if (aiData?.search_query) {
                    const aiType = aiData.media_type || media_type;
                    const aiEndpoint = aiType === 'tv'
                        ? `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(aiData.search_query)}&language=pt-BR`
                        : `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(aiData.search_query)}&language=pt-BR`;
                    
                    const aiResp = await axios.get(aiEndpoint, { timeout: 8000, httpsAgent: agent }).catch(() => null);
                    if (aiResp?.data?.results?.length > 0) {
                        bestMatch = aiResp.data.results[0];
                        media_type = aiType;
                        if (aiData.season) season_number = aiData.season;
                        if (aiData.episode) episode_number = aiData.episode;
                    }
                }
            } catch (aiErr) {}
        }

        if (bestMatch && bestMatch.id) {
            tmdb_id = String(bestMatch.id);
            if (media_type === 'tv' && season_number && !episode_number && candidateEpName) {
                try {
                    const resolvedEp = await resolveEpisodeNumberFromSeason(tmdb_id, season_number, candidateEpName, apiKey);
                    if (resolvedEp) {
                        episode_number = resolvedEp;
                        console.log(`[TMDB MAPPER] 🔎 Episódio pontual identificado pelo nome: S${String(season_number).padStart(2, '0')}E${String(episode_number).padStart(2, '0')} ("${candidateEpName}")`);
                    }
                } catch (epErr) {}
            }

            await db.run(`
                UPDATE sync_queue 
                SET tmdb_id = ?, media_type = ?, season_number = ?, episode_number = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [tmdb_id, media_type, season_number, episode_number, item.id]);
            console.log(`[TMDB MAPPER] ✅ Mapeado pontualmente #${item.id} -> TMDB #${tmdb_id} [${media_type}] (S:${season_number || '-'} E:${episode_number || '-'})`);
        }
    } catch (e) {
        console.warn(`[TMDB MAPPER] Falha ao mapear item #${itemId}:`, e.message);
    }
}

