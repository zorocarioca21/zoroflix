import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Star, Clock, Calendar, Play, List, ChevronRight, ChevronLeft, Heart } from 'lucide-react';
import AdBanner from './AdBanner';
import { RatingCircle, AgeBadge } from './Badges';
import CommentSection from './CommentSection';
import TrailerModal from './TrailerModal';
import { useAuth } from '../context/AuthContext';
import { getSlug } from '../utils/slug';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function DetailsPage() {
  const { id: rawId } = useParams();
  const [id, setId] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [cast, setCast] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [certification, setCertification] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState([]);
  const { user, uuid, loading: authLoading } = useAuth();

  const isMovie = location.pathname.includes('/filme/');

  // Resolvendo o ID do TMDB a partir do slug
  useEffect(() => {
    if (!rawId || authLoading) return;
    
    // Se for apenas ID numérico puro (compatibilidade)
    if (/^\d+$/.test(rawId)) {
        setId(rawId);
        return;
    }
    
    // Se o ID foi passado no stage
    if (location.state?.id) {
        setId(location.state.id);
        return;
    }

    // Busca o ID no TMDB pelo título no slug
    const type = isMovie ? 'movie' : 'tv';
    const query = rawId.replace(/-/g, ' ');
    const searchUrl = `${BASE_URL}/search/${type}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;
    
    fetch(searchUrl)
        .then(r => r.json())
        .then(data => {
            const bestMatch = data.results?.[0];
            if (bestMatch) {
                setId(bestMatch.id);
            } else {
                setLoading(false);
            }
        })
        .catch(() => setLoading(false));
  }, [rawId, isMovie, authLoading, location.state]);

  useEffect(() => {
    if (!id || authLoading) return;
    const checkFavorite = async () => {
       const token = localStorage.getItem('cinegeek_token');
       const headers = { 'x-device-uuid': uuid };
       if (token) headers['Authorization'] = `Bearer ${token}`;
       
       try {
           const res = await fetch(`/api/favorites/check/${id}`, { headers });
           if (res.ok) {
               const data = await res.json();
               setIsFavorite(data.isFavorite);
           }
       } catch (err) {}
    };
    checkFavorite();
  }, [id, user, uuid, authLoading]);

  const toggleFavorite = async (e) => {
      e.stopPropagation();
      if (!data) return;
      const token = localStorage.getItem('cinegeek_token');
      const headers = { 'x-device-uuid': uuid, 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      try {
          if (isFavorite) {
              await fetch(`/api/favorites/${id}`, { method: 'DELETE', headers });
              setIsFavorite(false);
          } else {
              await fetch('/api/favorites', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                      content_id: id,
                      media_type: isMovie ? 'movie' : 'tv',
                      title: data.title || data.name,
                      poster_path: data.poster_path
                  })
              });
              setIsFavorite(true);
          }
      } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (!id) return;
    window.scrollTo(0, 0);
    fetchDetails();
  }, [id, location.pathname]);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const type = isMovie ? 'movie' : 'tv';
      const [detailsResp, creditsResp, videosResp] = await Promise.all([
        fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=pt-BR`),
        fetch(`${BASE_URL}/${type}/${id}/credits?api_key=${API_KEY}&language=pt-BR`),
        fetch(`${BASE_URL}/${type}/${id}/videos?api_key=${API_KEY}`) // Puxando videos tbm em inglês para garantir
      ]);

      const detailsData = await detailsResp.json();
      const creditsData = await creditsResp.json();
      const videosData = await videosResp.json();

      const vid = videosData.results?.find(v => v.type === 'Trailer' || v.type === 'Teaser');
      if (vid) setTrailerKey(vid.key);

      const title = detailsData.title || detailsData.name;
      
      // Atualiza aba do navegador e URL com slug pra ficar profissional (sem ID)
      document.title = `${title} - CineGeek`;
      const slug = getSlug(title);
      const newUrl = `/${isMovie ? 'filme' : 'serie'}/${slug}`;
      window.history.replaceState({ id }, '', newUrl);

      setData(detailsData);
      setCast(creditsData.cast?.slice(0, 15) || []);

      if (!isMovie) {
        fetchEpisodes(1);
        const certResp = await fetch(`${BASE_URL}/tv/${id}/content_ratings?api_key=${API_KEY}`);
        const certData = await certResp.json();
        const br = certData.results?.find(r => r.iso_3166_1 === 'BR');
        setCertification(br?.rating || 'L');

        // Buscar episódios concluídos
        try {
            const token = localStorage.getItem('cinegeek_token');
            const uuidVal = localStorage.getItem('cinegeek_uuid') || uuid;
            const headers = { 'x-device-uuid': uuidVal || '' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const watchedResp = await fetch(`/api/recents/watched-episodes/${id}`, { headers });
            if (watchedResp.ok) {
                const watchedData = await watchedResp.json();
                setWatchedEpisodes(watchedData);
            }
        } catch (err) {}
      } else {
        const certResp = await fetch(`${BASE_URL}/movie/${id}/release_dates?api_key=${API_KEY}`);
        const certData = await certResp.json();
        const br = certData.results?.find(r => r.iso_3166_1 === 'BR');
        const cert = br?.release_dates?.find(d => d.certification)?.certification;
        setCertification(cert || 'L');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEpisodes = async (seasonNumber) => {
    try {
      const resp = await fetch(`${BASE_URL}/tv/${id}/season/${seasonNumber}?api_key=${API_KEY}&language=pt-BR`);
      const data = await resp.json();
      setEpisodes(data.episodes || []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSeasonChange = (season) => {
    setSelectedSeason(season);
    fetchEpisodes(season);
  };

  const statusMap = {
    'Returning Series': 'Em Lançamento',
    'Ended': 'Finalizada',
    'Canceled': 'Cancelada',
    'In Production': 'Em Produção',
    'Planned': 'Planejada',
    'Released': 'Lançado'
  };

  // Se não tiver dados nenhum ainda, mostra carregando full.
  // Se já tiver (ex: trocando de filme), o Backdrop já estará lá.
  const backdropUrl = data?.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '';

  return (
    <div className="details-container">
      {/* O Backdrop fica SEMPRE renderizado se houver URL, independente do loading do conteúdo interno */}
      {backdropUrl && <div className="details-hero" style={{ backgroundImage: `url(${backdropUrl})` }}></div>}

      {loading && !data ? (
        <div className="loading-full-screen">Carregando CineGeek...</div>
      ) : data && (
        <>
          <div className="details-content-main">
            <div className="details-poster-area">
                <div className="details-poster-wrap">
                    <img 
                        src={`https://image.tmdb.org/t/p/w500${data.poster_path}`} 
                        alt={data.title || data.name} 
                        className="details-main-poster"
                    />
                    <div className="details-badges-overlay">
                        <AgeBadge rating={certification} />
                        <RatingCircle rating={data.vote_average} />
                    </div>
                    <div className={`favorite-btn-overlay ${isFavorite ? 'active' : ''}`} onClick={toggleFavorite}>
                        <Heart size={22} fill={isFavorite ? 'currentColor' : 'none'} />
                    </div>
                </div>
                
                <button className="btn-main-play" onClick={() => {
                    if (isMovie) {
                        navigate(`/filme/${getSlug(data.title)}/player`, { state: { id, title: data.title, poster_path: data.poster_path } });
                    } else {
                        // Série/Anime/Dorama: sempre começa na T1E1
                        navigate(`/serie/${getSlug(data.name)}/1/1/player`, { state: { id, title: `${data.name} - Episódio 1`, poster_path: data.poster_path } });
                    }
                }}>
                    <Play fill="currentColor" /> ASSISTIR AGORA
                </button>
                {trailerKey && (
                    <button className="btn-trailer-popup" onClick={() => setShowTrailer(true)}>VER TRAILER</button>
                )}
            </div>

            <div className="details-info-area">
              <h1 className="details-title">{data.title || data.name}</h1>
              <div className="details-meta">
                <span className="meta-item"><Calendar size={16} /> {new Date(data.release_date || data.first_air_date).getFullYear()}</span>
                {data.runtime && <span className="meta-item"><Clock size={16} /> {data.runtime} min</span>}
                <span className="meta-item status-badge">{statusMap[data.status] || data.status}</span>
              </div>

              <div className="details-genres">
                {data.genres?.map(g => <span key={g.id} className="genre-tag">{g.name}</span>)}
              </div>

              <p className="details-overview">{data.overview || "Sinopse não disponível em português."}</p>

              <div className="details-cast-section">
                <div className="section-header">
                    <h3>Elenco Principal</h3>
                    <div className="scroll-controls">
                        <button className="scroll-btn"><ChevronLeft size={20} /></button>
                        <button className="scroll-btn"><ChevronRight size={20} /></button>
                    </div>
                </div>
                <div className="cast-grid-scroll">
                  {cast.map(person => (
                    <div key={person.id} className="cast-card">
                      <div className="cast-img-wrap">
                        <img src={person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : 'https://via.placeholder.com/185x278?text=Sem+Foto'} alt={person.name} />
                      </div>
                      <div className="cast-info">
                        <p className="cast-real-name">{person.name}</p>
                        <p className="cast-character">{person.character}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {!isMovie && (
            <div className="episodes-section">
              <div className="episodes-header">
                <h3>Episódios</h3>
                <select 
                  className="season-select"
                  value={selectedSeason}
                  onChange={(e) => handleSeasonChange(e.target.value)}
                >
                  {data.seasons?.filter(s => s.season_number > 0).map(s => (
                    <option key={s.id} value={s.season_number}>Temporada {s.season_number}</option>
                  ))}
                </select>
              </div>

              <div className="episodes-grid-modern">
                {episodes.map(ep => {
                  const showSlug = getSlug(data.name);
                  const isWatched = watchedEpisodes.some(we => we.season === parseInt(selectedSeason) && we.episode === parseInt(ep.episode_number));
                  return (
                  <div key={ep.id} className="episode-card-modern" onClick={() => navigate(`/serie/${showSlug}/${selectedSeason}/${ep.episode_number}/player`, { state: { id, title: `${data.name} - ${ep.name}`, poster_path: data.poster_path } })}>
                    <div className="ep-image-wrap">
                      <img src={ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : `https://image.tmdb.org/t/p/w300${data.backdrop_path}`} alt={ep.name} />
                      <div className="ep-badges-overlay">
                        <div className="ep-lang-badges">
                            <span className="badge-dub">DUB</span>
                            <span className="badge-leg">LEG</span>
                        </div>
                      </div>
                      <span className="ep-runtime-badge">{ep.runtime || '??'} min</span>
                      <div className="ep-play-overlay"><Play fill="currentColor" /></div>
                      {isWatched && (
                        <div className="ep-watched-overlay" style={{
                           position: 'absolute',
                           top: 0,
                           left: 0,
                           right: 0,
                           bottom: 0,
                           background: 'rgba(0, 0, 0, 0.80)',
                           display: 'flex',
                           alignItems: 'center',
                           justifyContent: 'center',
                           color: 'var(--primary, #00ff88)',
                           fontWeight: '700',
                           fontSize: '1rem',
                           letterSpacing: '1px',
                           zIndex: 3,
                           pointerEvents: 'none',
                           textShadow: '0 0 10px rgba(0, 0, 0, 0.8)',
                           textTransform: 'uppercase'
                        }}>
                           Assistido
                        </div>
                      )}
                    </div>
                    <div className="ep-info-modern">
                        <p className="ep-title-meta">EP {ep.episode_number} <span className="ep-real-title">{ep.name}</span></p>
                        <p className="ep-overview-modern">{ep.overview || "Sinopse indisponível."}</p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="ad-section-details">
            <AdBanner adId={isMovie ? 'details-movie-bottom' : 'details-series-bottom'} />
          </div>

          <CommentSection 
            contentId={id} 
            mediaType={isMovie ? 'movie' : 'tv'} 
          />

          {showTrailer && trailerKey && (
              <TrailerModal videoKey={trailerKey} onClose={() => setShowTrailer(false)} />
          )}
        </>
      )}
    </div>
  );
}
