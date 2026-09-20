import { uploadRemoteUrlToDrive } from './zoroDriveService.js';

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
            return parsedData;
        }
    } catch (err) {
        console.error('[TMDB CACHE] Erro ao consultar banco:', err.message);
    }

    // 2. Não encontrou no cache -> Buscar do TMDB
    try {
        console.log(`[TMDB CACHE] Baixando ${type} ${idStr} do TMDB...`);
        const url = `${TMDB_BASE_URL}/${type}/${idStr}?api_key=${apiKey}&language=pt-BR&append_to_response=credits,videos`;
        const res = await fetch(url);
        if (!res.ok) return null;

        const tmdbData = await res.json();

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
        console.log(`[TMDB CACHE] Baixando temporada ${seasonNum} da série ${idStr}...`);
        const url = `${TMDB_BASE_URL}/tv/${idStr}/season/${seasonNum}?api_key=${apiKey}&language=pt-BR`;
        const res = await fetch(url);
        if (!res.ok) return null;

        const seasonData = await res.json();

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
