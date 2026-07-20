import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronRight, List, ArrowLeft } from 'lucide-react';
import CommentSection from './CommentSection';
import { fetchWithProxy } from '../utils/api';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function PlayerPage() {
  const { id: rawId, season, episode, canalId } = useParams();
  const [id, setId] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const state = location.state || {};

  const [episodes, setEpisodes] = useState([]);
  const [showList, setShowList] = useState(false);
  const [configs, setConfigs] = useState({});
  const [ready, setReady] = useState(false);
  const hasTracked = useRef(false);
  const [resolvedChannel, setResolvedChannel] = useState(null);
  const [seriesDetail, setSeriesDetail] = useState(null);
  const [showNextSeasonModal, setShowNextSeasonModal] = useState(false);

  // Resolvendo as informações do Canal (Nome e Logo_url)
  useEffect(() => {
    if (!canalId) return;

    // Se for canal customizado (Esportes rde-...)
    if (String(canalId).startsWith('rde-')) {
        setResolvedChannel({
            name: state.title || 'Evento Esportivo Ao Vivo',
            logo_url: '/cinegeek-icon.png'
        });
        return;
    }

    // Busca na lista oficial de canais do SuperFlix
    const url = 'https://superflixapi.fit/lista?category=canais&format=json';
    fetchWithProxy(url)
        .then(res => {
            if (res && res.data) {
                const found = res.data.find(ch => String(ch.id) === String(canalId));
                if (found) {
                    setResolvedChannel({
                        name: found.name,
                        logo_url: found.placeholder_url || found.logo_url || '/cinegeek-icon.png'
                    });
                } else {
                    setResolvedChannel({
                        name: state.title || `Canal ${canalId}`,
                        logo_url: '/cinegeek-icon.png'
                    });
                }
            }
        })
        .catch(() => {
            setResolvedChannel({
                name: state.title || `Canal ${canalId}`,
                logo_url: '/cinegeek-icon.png'
            });
        });
  }, [canalId, state]);

  // Resolvendo o ID do TMDB a partir do slug
  useEffect(() => {
    if (canalId) return;
    if (!rawId || loading) return;
    
    // Se for apenas ID numérico puro (compatibilidade)
    if (/^\d+$/.test(rawId)) {
        setId(rawId);
        return;
    }
    
    // Se o ID foi passado no state
    if (location.state?.id) {
        setId(location.state.id);
        return;
    }

    // Busca o ID no TMDB pelo título no slug
    const isMovie = location.pathname.includes('/filme/');
    const type = isMovie ? 'movie' : 'tv';
    const query = rawId.replace(/-/g, ' ');
    const searchUrl = `${BASE_URL}/search/${type}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;
    
    fetch(searchUrl)
        .then(r => r.json())
        .then(data => {
            const bestMatch = data.results?.[0];
            if (bestMatch) {
                setId(bestMatch.id);
            }
        })
        .catch(() => {});
  }, [rawId, canalId, loading, location.state]);

  useEffect(() => {
    if (canalId) {
        if (resolvedChannel) {
            document.title = `${resolvedChannel.name} - CineGeek`;
        } else if (state.title) {
            document.title = `${state.title} - CineGeek`;
        }
    } else if (state.title) {
        document.title = `${state.title} - CineGeek`;
    }
  }, [state.title, canalId, resolvedChannel]);

  useEffect(() => {
    fetch('/api/admin/config/all')
      .then(r => r.json())
      .then(data => {
        setConfigs(data);
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (loading || !ready) return;
    if (!configs.ads_enabled || !configs.ads_popunder) return;
    if (user?.role && user.role !== 'free') return;
    const script = document.createElement('script');
    script.src = "https://pl29672000.effectivecpmnetwork.com/d7/32/c1/d732c1442b56faa1946720b33505fca5.js";
    script.async = true;
    document.body.appendChild(script);
    return () => { try { document.body.removeChild(script); } catch(e){} };
  }, [user, loading, configs, ready]);

  useEffect(() => {
    if (season && id) {
        fetch(`${BASE_URL}/tv/${id}/season/${season}?api_key=${API_KEY}&language=pt-BR`)
            .then(r => r.json())
            .then(data => setEpisodes(data.episodes || []));
    }
  }, [id, season]);

  useEffect(() => {
    if (id && !canalId) {
        fetch(`${BASE_URL}/tv/${id}?api_key=${API_KEY}&language=pt-BR`)
            .then(r => r.json())
            .then(data => setSeriesDetail(data))
            .catch(() => {});
    }
  }, [id, canalId]);

  // Timer de 30s: registra nos recentes após assistir pelo menos meio minuto
  useEffect(() => {
    hasTracked.current = false; // Reseta ao mudar de episódio/conteúdo
    
    // Se for canal, espera carregar o resolvedChannel para registrar corretamente
    if (canalId && !resolvedChannel) return;

    const timer = setTimeout(async () => {
      if (hasTracked.current) return;
      hasTracked.current = true;

      const token = localStorage.getItem('cinegeek_token');
      const uuid = localStorage.getItem('cinegeek_uuid');
      const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuid || '' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const mediaType = canalId ? 'canal' : (season ? 'tv' : 'movie');

      // Para séries/canais: content_id = ID único do conteúdo para sobrescrever histórico
      const trackId = canalId ? canalId : id;
      const targetTitle = canalId ? resolvedChannel.name : (state.title || title);
      const targetPoster = canalId ? resolvedChannel.logo_url : (state.poster_path || null);

      try {
        await fetch('/api/recents', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            content_id: trackId,
            media_type: mediaType,
            title: targetTitle,
            poster_path: targetPoster,
            season: season ? parseInt(season) : null,
            episode: episode ? parseInt(episode) : null,
          })
        });
      } catch (e) { /* silencioso */ }
    }, 30000); // 30 segundos

    return () => clearTimeout(timer);
  }, [id, season, episode, canalId, resolvedChannel]);

  let playerUrl = '';
  let title = canalId 
    ? (resolvedChannel?.name || state.title || 'Carregando Canal...') 
    : (state.title || 'Carregando...');

  if (canalId) {
    playerUrl = (state.embed_url || `https://superflixapi.fit/canal/${canalId}`) + '#noEpList';
  } else {
    const isMovie = location.pathname.includes('/filme/');
    const apiType = isMovie ? 'filme' : 'serie';
    if (season && episode) {
      playerUrl = `https://superflixapi.fit/${apiType}/${id}/${season}/${episode}#noEpList`;
    } else {
      playerUrl = `https://superflixapi.fit/${apiType}/${id}#noEpList`;
    }
  }

  const handleNext = () => {
    const nextEp = parseInt(episode) + 1;
    const exists = episodes.find(e => e.episode_number === nextEp);
    if (exists) {
        navigate(`/serie/${rawId}/${season}/${nextEp}/player`, { state: { id, title: `${state.title?.split(' - ')[0]} - ${exists.name}`, poster_path: state.poster_path } });
    } else {
        // É o último episódio da temporada atual
        const nextSeasonNum = parseInt(season) + 1;
        const nextSeasonExists = seriesDetail?.seasons?.find(s => s.season_number === nextSeasonNum && s.episode_count > 0);
        if (nextSeasonExists) {
            setShowNextSeasonModal(true);
        }
    }
  };

  const handleConfirmNextSeason = () => {
      const nextSeasonNum = parseInt(season) + 1;
      setShowNextSeasonModal(false);
      navigate(`/serie/${rawId}/${nextSeasonNum}/1/player`, { 
          state: { 
              id, 
              title: `${state.title?.split(' - ')[0]} - Temporada ${nextSeasonNum}, Episódio 1`, 
              poster_path: state.poster_path 
          } 
      });
  };

  const handlePrev = () => {
    const prevEp = parseInt(episode) - 1;
    if (prevEp >= 1) {
        const exists = episodes.find(e => e.episode_number === prevEp);
        navigate(`/serie/${rawId}/${season}/${prevEp}/player`, { state: { id, title: `${state.title?.split(' - ')[0]} - ${exists?.name || `Episódio ${prevEp}`}`, poster_path: state.poster_path } });
    }
  };

  const handleGoBack = () => {
    if (canalId) navigate('/canais');
    else if (season) navigate(`/serie/${rawId}`, { state: { id } });
    else navigate(`/filme/${rawId}`, { state: { id } });
  }

  if (!canalId && !id) {
    return <div className="details-loading">Carregando Player...</div>;
  }

  return (
    <div className="player-page-container">
      {/* Player Area (Top) */}
      <div className="player-view-layout">
          <div className="fullscreen-player-wrapper">
            <iframe src={playerUrl} allowFullScreen title="Zoroflix Player"></iframe>
          </div>

          {showList && (
              <div className="player-ep-sidebar">
                  <h4>Temporada {season}</h4>
                  <div className="player-sidebar-list">
                      {episodes.map(ep => (
                          <div 
                            key={ep.id} 
                            className={`sidebar-ep-item ${parseInt(episode) === ep.episode_number ? 'active' : ''}`}
                            onClick={() => {
                                navigate(`/serie/${rawId}/${season}/${ep.episode_number}/player`, { state: { id, title: `${state.title?.split(' - ')[0]} - ${ep.name}`, poster_path: state.poster_path } });
                                setShowList(false);
                            }}
                          >
                              <span className="ep-num">{ep.episode_number}</span>
                              <span className="ep-name">{ep.name}</span>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>

      {/* Info & Controls Area (Below Player) */}
      <div className="player-bottom-controls-area">
        <div className="player-info-row">
            <h1 className="player-title">{title}</h1>
            {!canalId && season && (
                <div className="player-nav-group">
                    <button className="nav-btn-modern" onClick={handlePrev} disabled={parseInt(episode) <= 1}><ChevronLeft size={20}/> Anterior</button>
                    <button className="nav-btn-modern" onClick={() => setShowList(!showList)}><List size={20}/> Episódios</button>
                    <button className="nav-btn-modern" onClick={handleNext}>Próximo <ChevronRight size={20}/></button>
                </div>
            )}
        </div>

        <div className="player-back-row">
            <button className="btn-back-to-info" onClick={handleGoBack}>
                <ArrowLeft size={18} /> {canalId ? 'VOLTAR PARA CANAIS' : 'VOLTAR PARA DETALHES'}
            </button>
        </div>
      </div>

      <div className="player-comments-area">
          <CommentSection 
            contentId={id} 
            mediaType={canalId ? 'canal' : (season ? 'tv' : 'movie')} 
            episodeId={episode} 
          />
      </div>

      {showNextSeasonModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{
            background: '#13131a',
            border: '2px solid var(--primary, #00ff88)',
            boxShadow: '0 0 25px rgba(0, 255, 136, 0.25)',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '450px',
            padding: '2rem',
            textAlign: 'center',
            color: '#fff',
            fontFamily: 'inherit'
          }}>
            <h3 style={{
              fontSize: '1.4rem',
              color: 'var(--primary, #00ff88)',
              marginBottom: '1rem',
              fontWeight: '700'
            }}>Fim da Temporada!</h3>
            
            <p style={{
              fontSize: '0.95rem',
              color: '#d1d1d6',
              lineHeight: '1.6',
              marginBottom: '2rem'
            }}>
              Você assistiu ao último episódio da <strong style={{ color: '#fff' }}>Temporada {season}</strong>. <br />
              Deseja começar a assistir ao <strong style={{ color: '#fff' }}>Episódio 1 da Temporada {parseInt(season) + 1}</strong>?
            </p>

            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center'
            }}>
              <button 
                onClick={handleConfirmNextSeason}
                style={{
                  background: 'var(--primary, #00ff88)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '30px',
                  padding: '0.8rem 2rem',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 10px rgba(0, 255, 136, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'scale(1.05)';
                  e.target.style.boxShadow = '0 6px 15px rgba(0, 255, 136, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'scale(1)';
                  e.target.style.boxShadow = '0 4px 10px rgba(0, 255, 136, 0.3)';
                }}
              >
                Sim, assistir
              </button>
              
              <button 
                onClick={() => setShowNextSeasonModal(false)}
                style={{
                  background: '#2c2c35',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '30px',
                  padding: '0.8rem 2.2rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
              >
                Não
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
