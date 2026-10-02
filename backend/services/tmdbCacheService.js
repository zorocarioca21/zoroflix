import { uploadRemoteUrlToDrive } from './zoroDriveService.js';
import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ family: 4 }); // Força IPv4

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * Busca os detalhes de um filme ou série. Se existir no BD local, retorna do cache.
 * Se não existir, busca no TMDB, espelha as imagens no Zoro Drive, salva no BD local e retorna.
 */
export async function getOrFetchMediaDetails(db, tmdbId, mediaType = 'movie', apiKey) {
    if (!tmdbId || !apiKey) return null;

    const type = mediaType === 'tv' || mediaType === 'serie' ? 'tv' : 'movie';
    const idStr = String(tmdbId);

    // 1. Tentar buscar no cache do banco de dados
    try {
        const cached = await db.get(
            'SELECT * FROM tmdb_media_cache WHERE tmdb_id = ? AND media_type = ?',
            [idStr, type]
        );
        if (cached && cached.raw_data) {
            const parsedData = JSON.parse(cached.raw_data);
            if (cached.poster_url) parsedData.poster_path = cached.poster_url;
            if (cached.backdrop_url) parsedData.backdrop_path = cached.backdrop_url;

            // Se o cache ainda possui URLs do TMDB (não espelhadas no Zoro Drive), agenda espelhamento em segundo plano
            const needsPosterSync = parsedData.poster_path && !parsedData.poster_path.includes('zorobot.shop');
            const needsBackdropSync = parsedData.backdrop_path && !parsedData.backdrop_path.includes('zorobot.shop');

            if (needsPosterSync || needsBackdropSync) {
                (async () => {
                    try {
                        let newPoster = cached.poster_url;
                        let newBackdrop = cached.backdrop_url;

                        if (needsPosterSync) {
                            const rawPosterUrl = parsedData.poster_path.startsWith('http') ? parsedData.poster_path : `https://image.tmdb.org/t/p/w500${parsedData.poster_path}`;
                            const drivePoster = await uploadRemoteUrlToDrive(rawPosterUrl, 'TMDB_Posters', `poster_${type}_${idStr}.jpg`);
                            if (drivePoster) { newPoster = drivePoster; parsedData.poster_path = drivePoster; }
                        }

                        if (needsBackdropSync) {
                            const rawBackdropUrl = parsedData.backdrop_path.startsWith('http') ? parsedData.backdrop_path : `https://image.tmdb.org/t/p/original${parsedData.backdrop_path}`;
                            const driveBackdrop = await uploadRemoteUrlToDrive(rawBackdropUrl, 'TMDB_Backdrops', `backdrop_${type}_${idStr}.jpg`);
                            if (driveBackdrop) { newBackdrop = driveBackdrop; parsedData.backdrop_path = driveBackdrop; }
                        }

                        await db.run(
                            'UPDATE tmdb_media_cache SET poster_url = ?, backdrop_url = ?, raw_data = ?, updated_at = CURRENT_TIMESTAMP WHERE tmdb_id = ? AND media_type = ?',
                            [newPoster, newBackdrop, JSON.stringify(parsedData), idStr, type]
                        );
                    } catch (e) {
                        console.error('[TMDB CACHE BG] Erro ao espelhar em background:', e.message);
                    }
                })();
            }

            return parsedData;
        }
    } catch (err) {
        console.error('[TMDB CACHE] Erro ao consultar banco:', err.message);
    }

    // 2. Não encontrou no cache -> Buscar do TMDB
    try {
        console.log(`[TMDB CACHE] Baixando ${type} ${idStr} do TMDB...`);
        const url = `${TMDB_BASE_URL}/${type}/${idStr}?api_key=${apiKey}&language=pt-BR&append_to_response=credits,videos`;
        const res = await axios.get(url, { httpsAgent: agent, timeout: 10000 });
        if (res.status !== 200) return null;

        const tmdbData = res.data;

        // 3. Espelhar imagens no Zoro Drive em segundo plano / paralelo
        let posterUrl = null;
        let backdropUrl = null;

        if (tmdbData.poster_path) {
            const rawPosterUrl = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;
            posterUrl = await uploadRemoteUrlToDrive(rawPosterUrl, 'TMDB_Posters', `poster_${type}_${idStr}.jpg`);
            if (posterUrl) tmdbData.poster_path = posterUrl;
        }

        if (tmdbData.backdrop_path) {
            const rawBackdropUrl = `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}`;
            backdropUrl = await uploadRemoteUrlToDrive(rawBackdropUrl, 'TMDB_Backdrops', `backdrop_${type}_${idStr}.jpg`);
            if (backdropUrl) tmdbData.backdrop_path = backdropUrl;
        }

        // Espelhar fotos do elenco principal no Zoro Drive (top 10)
        if (tmdbData.credits && Array.isArray(tmdbData.credits.cast)) {
            const topCast = tmdbData.credits.cast.slice(0, 10);
            for (const person of topCast) {
                if (person.profile_path && !person.profile_path.includes('zorobot.shop')) {
                    const rawProfile = `https://image.tmdb.org/t/p/w185${person.profile_path}`;
                    const driveProfile = await uploadRemoteUrlToDrive(rawProfile, 'TMDB_Cast', `cast_${person.id}.jpg`);
                    if (driveProfile) person.profile_path = driveProfile;
                }
            }
        }

        const title = tmdbData.title || tmdbData.name || '';
        const origTitle = tmdbData.original_title || tmdbData.original_name || '';
        const overview = tmdbData.overview || '';
        const releaseDate = tmdbData.release_date || tmdbData.first_air_date || '';

        // 4. Salvar no banco de dados local
        await db.run(`
            INSERT OR REPLACE INTO tmdb_media_cache 
            (tmdb_id, media_type, title, original_title, overview, release_date, poster_url, backdrop_url, raw_data, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            idStr,
            type,
            title,
            origTitle,
            overview,
            releaseDate,
            posterUrl || tmdbData.poster_path || null,
            backdropUrl || tmdbData.backdrop_path || null,
            JSON.stringify(tmdbData)
        ]);

        console.log(`[TMDB CACHE] Salvo com sucesso no cache local e Zoro Drive: ${title}`);
        return tmdbData;
    } catch (err) {
        console.error('[TMDB CACHE] Erro ao buscar/salvar mídia:', err.message);
        return null;
    }
}

/**
 * Busca episódios de uma temporada. Espelha as imagens dos episódios (stills em qualidade original) para o Zoro Drive.
 */
export async function getOrFetchSeasonDetails(db, tmdbId, seasonNumber, apiKey) {
    if (!tmdbId || apiKey === undefined) return null;

    const idStr = String(tmdbId);
    const seasonNum = parseInt(seasonNumber, 10);

    try {
        // 1. Tentar buscar se existe Episode Group (para Animes e Séries reorganizadas)
        const groupDetails = await getOrFetchEpisodeGroupDetails(db, idStr, apiKey);
        if (groupDetails && Array.isArray(groupDetails.groups) && groupDetails.groups.length > 0) {
            // Filtrar grupos que contenham episódios (ignora grupos vazios ou apenas especiais se houver outros)
            const matchedGroup = groupDetails.groups.find(g => g.order === seasonNum)
                || groupDetails.groups.find((g, idx) => (g.order !== 0 ? g.order : idx + 1) === seasonNum)
                || groupDetails.groups[seasonNum - 1];

            if (matchedGroup && Array.isArray(matchedGroup.episodes) && matchedGroup.episodes.length > 0) {
                console.log(`[TMDB CACHE] Usando episódios do Episode Group '${matchedGroup.name}' (${matchedGroup.episodes.length} eps) para série ${idStr} temp ${seasonNum}`);
                
                // Processar fotos (stills) para Zoro Drive se necessário
                for (const ep of matchedGroup.episodes) {
                    if (ep.still_path && !ep.still_path.includes('zorobot.shop')) {
                        const rawStill = `https://image.tmdb.org/t/p/original${ep.still_path}`;
                        const driveStill = await uploadRemoteUrlToDrive(
                            rawStill,
                            'TMDB_Stills',
                            `still_${idStr}_s${seasonNum}_e${ep.episode_number}.jpg`
                        );
                        if (driveStill) ep.still_path = driveStill;
                    }
                }

                return {
                    id: matchedGroup.id || idStr,
                    name: matchedGroup.name || `Temporada ${seasonNum}`,
                    season_number: seasonNum,
                    episodes: matchedGroup.episodes
                };
            }
        }

        console.log(`[TMDB CACHE] Baixando temporada ${seasonNum} da série ${idStr}...`);
        const url = `${TMDB_BASE_URL}/tv/${idStr}/season/${seasonNum}?api_key=${apiKey}&language=pt-BR`;
        const res = await axios.get(url, { httpsAgent: agent, timeout: 10000 });
        if (res.status !== 200) return null;

        const seasonData = res.data;

        if (Array.isArray(seasonData.episodes)) {
            for (const ep of seasonData.episodes) {
                if (ep.still_path && !ep.still_path.includes('zorobot.shop')) {
                    // Usando qualidade 'original' conforme alinhado
                    const rawStill = `https://image.tmdb.org/t/p/original${ep.still_path}`;
                    const driveStill = await uploadRemoteUrlToDrive(
                        rawStill,
                        'TMDB_Stills',
                        `still_${idStr}_s${seasonNum}_e${ep.episode_number}.jpg`
                    );
                    if (driveStill) ep.still_path = driveStill;
                }

                // Salva episódio individual no BD
                await db.run(`
                    INSERT OR REPLACE INTO tmdb_episodes_cache
                    (tmdb_id, season, episode, name, overview, runtime, still_url, raw_data, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    idStr,
                    seasonNum,
                    ep.episode_number,
                    ep.name || '',
                    ep.overview || '',
                    ep.runtime || 0,
                    ep.still_path || null,
                    JSON.stringify(ep)
                ]);
            }
        }

        return seasonData;
    } catch (err) {
        console.error('[TMDB CACHE] Erro ao buscar temporada:', err.message);
        return null;
    }
}


/**
 * Busca grupos de episódios (Episode Groups / Seasons) de um anime ou série no TMDB.
 * Salva o resultado no banco SQLite local para não precisar consultar a API novamente.
 */
export async function getOrFetchEpisodeGroupDetails(db, tmdbId, apiKey, forceRefresh = false) {
    if (!tmdbId || !apiKey) return null;

    const idStr = String(tmdbId);

    // 1. Verificar no banco SQLite local (se não for forceRefresh)
    if (!forceRefresh) {
        try {
            const cached = await db.get(
                'SELECT * FROM tmdb_episode_groups_cache WHERE tmdb_id = ?',
                [idStr]
            );
            if (cached) {
                if (cached.group_id && cached.group_id !== 'NONE' && cached.raw_data && cached.raw_data !== 'null') {
                    return JSON.parse(cached.raw_data);
                }
                // Se estiver marcado como NONE, verifica se a gravação foi recente (menos de 5 min)
                const updatedAt = new Date(cached.updated_at || 0).getTime();
                if (Date.now() - updatedAt < 5 * 60 * 1000) {
                    return null;
                }
            }
        } catch (err) {
            console.error('[TMDB CACHE] Erro ao consultar episode_groups no BD:', err.message);
        }
    }


    // 2. Não está em cache -> Buscar lista de grupos no TMDB
    try {
        console.log(`[TMDB CACHE] Buscando episode_groups para série ${idStr}...`);
        const listUrl = `${TMDB_BASE_URL}/tv/${idStr}/episode_groups?api_key=${apiKey}`;
        const res = await axios.get(listUrl, { httpsAgent: agent, timeout: 10000 });
        if (res.status !== 200) {
            await db.run('INSERT OR REPLACE INTO tmdb_episode_groups_cache (tmdb_id, group_id, raw_data) VALUES (?, ?, ?)', [idStr, 'NONE', 'null']);
            return null;
        }

        const data = res.data;
        const results = data.results || [];
        if (results.length === 0) {
            await db.run('INSERT OR REPLACE INTO tmdb_episode_groups_cache (tmdb_id, group_id, raw_data) VALUES (?, ?, ?)', [idStr, 'NONE', 'null']);
            return null;
        }

        // Selecionar o melhor grupo (tipo 1 Seasons, nome "Seasons" / "Temporadas", tipo 6 ou tipo 5)
        const selectedGroup = results.find(g => g.type === 1)
            || results.find(g => g.name && (g.name.toLowerCase() === 'seasons' || g.name.toLowerCase() === 'temporadas'))
            || results.find(g => g.name && (g.name.toLowerCase().includes('seasons') || g.name.toLowerCase().includes('temporadas')))
            || results.find(g => g.type === 6)
            || results.find(g => g.type === 5)
            || results[0];

        if (!selectedGroup) {
            await db.run('INSERT OR REPLACE INTO tmdb_episode_groups_cache (tmdb_id, group_id, raw_data) VALUES (?, ?, ?)', [idStr, 'NONE', 'null']);
            return null;
        }

        // 3. Detalhes do grupo escolhido
        console.log(`[TMDB CACHE] Grupo selecionado '${selectedGroup.name}' (${selectedGroup.id}) para série ${idStr}`);
        const groupUrl = `${TMDB_BASE_URL}/tv/episode_group/${selectedGroup.id}?api_key=${apiKey}&language=pt-BR`;
        const groupRes = await axios.get(groupUrl, { httpsAgent: agent, timeout: 10000 });
        if (groupRes.status !== 200) {
            await db.run('INSERT OR REPLACE INTO tmdb_episode_groups_cache (tmdb_id, group_id, raw_data) VALUES (?, ?, ?)', [idStr, 'NONE', 'null']);
            return null;
        }

        const groupDetails = groupRes.data;

        // 4. Salvar no banco SQLite local
        await db.run(
            'INSERT OR REPLACE INTO tmdb_episode_groups_cache (tmdb_id, group_id, raw_data, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            [idStr, selectedGroup.id, JSON.stringify(groupDetails)]
        );

        return groupDetails;
    } catch (err) {
        console.error('[TMDB CACHE] Erro ao buscar episode_groups:', err.message);
        return null;
    }
}

