import { getNextTmdbKey } from './tmdbKeyService.js';
import fetch from 'node-fetch'; // Para ambiente onde fetch não for global

/**
 * Mapeia em lote os itens que ainda não possuem tmdb_id na fila.
 * Deve ser chamado via Worker (setInterval)
 */
export async function mapPendingTmdbItems(db, batchSize = 20) {
    try {
        const itemsToMap = await db.all(`
            SELECT id, title
            FROM sync_queue
            WHERE tmdb_id IS NULL
            AND status IN ('pending', 'completed')
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

            // Extrai as infos básicas do título (temporada/episódio/ano)
            let q = item.title;
            const yearMatch = q.match(/[\(\[](\d{4})[\)\]]/);
            const year = yearMatch ? yearMatch[1] : null;
            q = q.replace(/[\(\[]\d{4}[\)\]]/g, '').trim();

            const sMatch = q.match(/\b(?:S|T)(?:EMPORADA\s*)?0?(\d{1,2})\b/i);
            const epRegex = /\b(?:E|EP|EPIS[OÓ]DIO)\s*0?(\d{1,3})\b/i;
            const epMatch = q.match(epRegex);

            if (sMatch && epMatch) {
                season_number = parseInt(sMatch[1]);
                episode_number = parseInt(epMatch[1]);
                q = q.replace(sMatch[0], '').replace(epMatch[0], '').trim();
            } else {
                const epOnlyRegex = /\b(?:EPIS[OÓ]DIO|EP|E)\s*0?(\d{1,3})\b/i;
                const altMatch = q.match(epOnlyRegex);
                if (altMatch) {
                    season_number = 1;
                    episode_number = parseInt(altMatch[1]);
                    q = q.replace(altMatch[0], '').trim();
                }
            }

            // Remove tags e limpa o texto principal
            const tagsRegex = /\b(DUBLADO|LEGENDADO|LEG|HD|FHD|4K|1080P|720P|2160P|CAMRIP)\b/i;
            const tagMatch = q.match(tagsRegex);
            if (tagMatch) {
                q = q.substring(0, tagMatch.index).trim();
            }
            q = q.replace(/[-:]$/, '').trim();

            if (!q) {
                // Título não pode ser vazio para a busca
                await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND' WHERE id = ?", [item.id]);
                continue;
            }

            try {
                const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&api_key=${apiKey}&language=pt-BR`;
                const tmdbRes = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                });
                
                if (tmdbRes.ok) {
                    const tmdbData = await tmdbRes.json();
                    let bestMatch = null;
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
                }
            } catch (err) {
                console.error(`[TMDB MAPPER] Falha ao buscar ${q}:`, err.message);
            }

            if (tmdb_id) {
                await db.run(
                    "UPDATE sync_queue SET tmdb_id = ?, media_type = ?, season_number = ?, episode_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [tmdb_id, media_type, season_number, episode_number, item.id]
                );
                updatedCount++;
            } else {
                await db.run("UPDATE sync_queue SET tmdb_id = 'NOT_FOUND', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);
            }
            
            // Pausa um pouquinho para não estourar a API
            await new Promise(res => setTimeout(res, 200));
        }

        console.log(`[TMDB MAPPER] Mapeados ${updatedCount} de ${itemsToMap.length} processados.`);
    } catch (err) {
        console.error("[TMDB MAPPER] Erro geral no loop:", err);
    }
}
