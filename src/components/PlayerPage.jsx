import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronRight, List, ArrowLeft, Check, Download, Loader, X as CloseIcon } from 'lucide-react';
import CommentSection from './CommentSection';
import { fetchWithProxy } from '../utils/api';
import CustomVideoPlayer from './CustomVideoPlayer';

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
  const [activeSidebarSeason, setActiveSidebarSeason] = useState(null);
  const [isWatched, setIsWatched] = useState(false);
  const [telegramMessageId, setTelegramMessageId] = useState(null);
  
  // Modal de Download
  const [dlState, setDlState] = useState({ isVisible: false, status: '', isError: false, isSuccess: false });
  const [isCheckingTelegram, setIsCheckingTelegram] = useState(() => {
      if (canalId) return false;
      return !!(user && (user.role === 'admin' || user.role === 'vip'));
  });

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
    
    // Se o ID foi passado no state (novo padrão com slug)
    if (location.state?.id) {
        setId(location.state.id);
        return;
    }

    // Caso seja acesso direto pelo link (ex: usuário enviou link no whatsapp)
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
            } else if (/^\d+$/.test(rawId)) {
                // Fallback para URLs antigas que usavam TMDB ID direto na URL
                setId(rawId);
            }
        })
        .catch(() => {
            if (/^\d+$/.test(rawId)) setId(rawId);
        });
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
    if (season) {
      setActiveSidebarSeason(parseInt(season));
    }
  }, [season]);

  useEffect(() => {
    if (activeSidebarSeason && id) {
        fetch(`${BASE_URL}/tv/${id}/season/${activeSidebarSeason}?api_key=${API_KEY}&language=pt-BR`)
            .then(r => r.json())
            .then(data => setEpisodes(data.episodes || []))
            .catch(() => {});
    }
  }, [id, activeSidebarSeason]);

  useEffect(() => {
    if (id && !canalId) {
        const isMovie = location.pathname.includes('/filme/');
        const type = isMovie ? 'movie' : 'tv';
        fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=pt-BR`)
            .then(r => r.json())
            .then(data => setSeriesDetail(data))
            .catch(() => {});
    }
  }, [id, canalId, location.pathname]);

  // Checa se existe no Telegram (Para Player Nativo VIP/Admin)
  useEffect(() => {
      if (canalId) return;
      if (!user || (user.role !== 'admin' && user.role !== 'vip')) return;
      
      let seriesName = '';
      if (state.title) {
          seriesName = state.title.split(' - ')[0].trim();
      } else if (seriesDetail && (seriesDetail.title || seriesDetail.name)) {
          seriesName = (seriesDetail.title || seriesDetail.name).trim();
      }

      if (!seriesName) return;

      const token = localStorage.getItem('cinegeek_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const findEpisode = async () => {
          try {
              if (season && episode) {
                  // Busca específica: inclui S01 E01 na query para pegar direto o episódio certo
                  const s = String(season).padStart(2, '0');
                  const e = String(episode).padStart(2, '0');
                  const specificSearch = `${seriesName} S${s} E${e}`;
                  
                  const res = await fetch(`/api/sync/queue?search=${encodeURIComponent(specificSearch)}&limit=10`, { headers });
                  const data = await res.json();
                  
                  if (data?.items?.length > 0) {
                      const found = data.items.find(i => i.status === 'completed' && i.telegram_message_id);
                      if (found) { setTelegramMessageId(found.telegram_message_id); return; }
                  }
                  
                  // Fallback: busca pelo nome da série e filtra localmente
                  const res2 = await fetch(`/api/sync/queue?search=${encodeURIComponent(seriesName)}&limit=500`, { headers });
                  const data2 = await res2.json();
                  
                  if (data2?.items?.length > 0) {
                      const patterns = [
                          `S${s}E${e}`, `S${s} E${e}`,
                          `S${season}E${episode}`, `S${season} E${episode}`,
                          `Episódio ${episode}`, `EP${e}`, `EP ${e}`, `E${e}`,
                      ];
                      
                      const releaseYear = seriesDetail?.first_air_date ? seriesDetail.first_air_date.split('-')[0] : null;
                      let bestMatch = null;
                      
                      for (const i of data2.items) {
                          if (i.status !== 'completed' || !i.telegram_message_id) continue;
                          
                          const hasPattern = patterns.some(p => i.title.toUpperCase().includes(p.toUpperCase()));
                          if (!hasPattern) continue;
                          
                          // Se o título no Telegram tiver o ano, é o match perfeito
                          if (releaseYear && i.title.includes(releaseYear)) {
                              bestMatch = i;
                              break;
                          }
                          
                          if (!bestMatch) bestMatch = i; // Fallback para o primeiro encontrado
                      }
                      
                      if (bestMatch) { setTelegramMessageId(bestMatch.telegram_message_id); return; }
                  }
              } else {
                  // Filme: busca simples pelo nome
                  const res = await fetch(`/api/sync/queue?search=${encodeURIComponent(seriesName)}&limit=50`, { headers });
                  const data = await res.json();
                  
                  if (data?.items?.length > 0) {
                      const releaseYear = seriesDetail?.release_date ? seriesDetail.release_date.split('-')[0] : null;
                      let bestMatch = null;
                      
                      for (const i of data.items) {
                          if (i.status !== 'completed' || !i.telegram_message_id) continue;
                          
                          // Se o título do telegram contém o ano exato de lançamento, é prioridade total
                          if (releaseYear && i.title.includes(releaseYear)) {
                              bestMatch = i;
                              break;
                          }
                          
                          // Como fallback, pegamos o primeiro que aparecer
                          if (!bestMatch) bestMatch = i;
                      }
                      
                      if (bestMatch) { setTelegramMessageId(bestMatch.telegram_message_id); return; }
                  }
              }
              setTelegramMessageId(null);
          } catch {
              setTelegramMessageId(null);
          } finally {
              setIsCheckingTelegram(false);
          }
      };
      
      setIsCheckingTelegram(true);
      findEpisode();
  }, [id, season, episode, state.title, canalId, user, seriesDetail]);

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
      const trackId = canalId ? canalId : id;

      let targetTitle = canalId ? resolvedChannel?.name : (seriesDetail?.name || state?.title || (title !== 'Carregando...' ? title : null));
      let targetPoster = canalId ? resolvedChannel?.logo_url : (seriesDetail?.poster_path || state?.poster_path || null);

      if ((!targetTitle || targetTitle === 'Carregando...') && id && !canalId) {
          try {
              const tmdbType = season ? 'tv' : 'movie';
              const tmdbRes = await fetch(`${BASE_URL}/${tmdbType}/${id}?api_key=${API_KEY}&language=pt-BR`);
              if (tmdbRes.ok) {
                  const tmdbData = await tmdbRes.json();
                  targetTitle = tmdbData.name || tmdbData.title || targetTitle;
                  if (!targetPoster) targetPoster = tmdbData.poster_path;
              }
          } catch(e) {}
      }

      if (!targetTitle || targetTitle === 'Carregando...') {
          targetTitle = canalId ? `Canal ${canalId}` : (season ? `Série #${id}` : `Filme #${id}`);
      }

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

  // Timer de 80%: registra o episódio como concluído (assistido)
  useEffect(() => {
    if (!id || !season || !episode || canalId) return;

    let durationMin = 40; // Fallback padrão
    const currentEpObj = episodes.find(e => e.episode_number === parseInt(episode));
    if (currentEpObj && currentEpObj.runtime) {
        durationMin = currentEpObj.runtime;
    } else if (seriesDetail && seriesDetail.episode_run_time && seriesDetail.episode_run_time.length > 0) {
        durationMin = seriesDetail.episode_run_time[0];
    }

    const eightyPercentMs = Math.round(durationMin * 60 * 1000 * 0.8);

    const checkTimer = setTimeout(async () => {
        const token = localStorage.getItem('cinegeek_token');
        const uuidVal = localStorage.getItem('cinegeek_uuid');
        const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            await fetch('/api/recents/watched-episodes', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    content_id: String(id),
                    season: parseInt(season),
                    episode: parseInt(episode)
                })
            });
        } catch (e) { /* silencioso */ }
    }, eightyPercentMs);

    return () => clearTimeout(checkTimer);
  }, [id, season, episode, canalId, episodes, seriesDetail]);

  // Buscar se o episódio já está marcado como assistido
  useEffect(() => {
    if (!id || !season || !episode || canalId) {
        setIsWatched(false);
        return;
    }

    const token = localStorage.getItem('cinegeek_token');
    const uuidVal = localStorage.getItem('cinegeek_uuid');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (uuidVal) headers['x-device-uuid'] = uuidVal;

    fetch(`/api/recents/watched-episodes/${id}`, { headers })
        .then(r => r.json())
        .then(data => {
            const found = data.some(we => we.season === parseInt(season) && we.episode === parseInt(episode));
            setIsWatched(found);
        })
        .catch(() => {});
  }, [id, season, episode, canalId]);

  const handleToggleWatched = async () => {
      const token = localStorage.getItem('cinegeek_token');
      const uuidVal = localStorage.getItem('cinegeek_uuid');
      const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
          if (isWatched) {
              const resp = await fetch(`/api/recents/watched-episodes/${id}/${season}/${episode}`, {
                  method: 'DELETE',
                  headers
              });
              if (resp.ok) setIsWatched(false);
          } else {
              const resp = await fetch('/api/recents/watched-episodes', {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({
                      content_id: String(id),
                      season: parseInt(season),
                      episode: parseInt(episode)
                  })
              });
              if (resp.ok) setIsWatched(true);
          }
      } catch (err) {
          console.error(err);
      }
  };

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
            {isCheckingTelegram ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#00ff88', flexDirection: 'column' }}>
                    <Loader size={48} className="spin-anim" style={{ marginBottom: '1rem' }} />
                    <span style={{ fontWeight: 'bold' }}>Carregando CineGeek VIP...</span>
                </div>
            ) : telegramMessageId ? (
                <CustomVideoPlayer 
                    messageId={telegramMessageId}
                    contentId={id}
                    season={season}
                    episode={episode}
                    onNextEpisode={season && episode ? handleNext : null}
                />
            ) : (
                <iframe src={playerUrl} allowFullScreen title="Zoroflix Player"></iframe>
            )}
          </div>

          {showList && (
              <div className="player-ep-sidebar">
                  {seriesDetail && seriesDetail.seasons && seriesDetail.seasons.length > 0 ? (
                      <div className="season-select-wrapper" style={{ margin: '0.2rem 0 1rem 0', width: '100%' }}>
                          <select 
                            value={activeSidebarSeason || season} 
                            onChange={(e) => {
                                setActiveSidebarSeason(parseInt(e.target.value));
                            }}
                            style={{
                                width: '100%',
                                background: '#1c1c24',
                                color: '#00ff88',
                                border: '1px solid #333',
                                borderRadius: '8px',
                                padding: '0.6rem',
                                fontSize: '0.95rem',
                                fontWeight: '700',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                          >
                              {seriesDetail.seasons
                                  .filter(s => s.episode_count > 0)
                                  .map(s => (
                                      <option key={s.id} value={s.season_number} style={{ background: '#13131a', color: '#fff' }}>
                                          {s.name || `Temporada ${s.season_number}`} ({s.episode_count} eps)
                                      </option>
                                  ))
                              }
                          </select>
                      </div>
                  ) : (
                      <h4>Temporada {activeSidebarSeason || season}</h4>
                  )}
                  <div className="player-sidebar-list">
                      {episodes.map(ep => (
                          <div 
                            key={ep.id} 
                            className={`sidebar-ep-item ${parseInt(season) === parseInt(activeSidebarSeason || season) && parseInt(episode) === ep.episode_number ? 'active' : ''}`}
                            onClick={() => {
                                navigate(`/serie/${rawId}/${activeSidebarSeason || season}/${ep.episode_number}/player`, { state: { id, title: `${state.title?.split(' - ')[0]} - ${ep.name}`, poster_path: state.poster_path } });
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
        <div className="player-info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
            <div className="player-title-container">
                <h1 className="player-title">{title}</h1>
                {!canalId && season && episode && (
                    <h2 className="player-subtitle" style={{ color: '#d1d1d6', fontSize: '1.2rem', marginTop: '0.5rem', fontWeight: '500' }}>
                        Temporada {season} • Episódio {episode}
                    </h2>
                )}
            </div>
            {!canalId && (
                <div className="player-nav-group" style={{ width: '100%', justifyContent: 'flex-start', flexWrap: 'wrap', gap: '0.8rem', marginTop: '0.5rem' }}>
                    {season && (
                        <>
                            <button className="nav-btn-modern" onClick={handlePrev} disabled={parseInt(episode) <= 1}><ChevronLeft size={20}/> Anterior</button>
                            <button className="nav-btn-modern" onClick={() => setShowList(!showList)}><List size={20}/> Episódios</button>
                            <button className="nav-btn-modern" onClick={handleNext}>Próximo <ChevronRight size={20}/></button>
                            <button 
                              className={`nav-btn-modern toggle-watched-status-btn ${isWatched ? 'watched-active' : ''}`} 
                              onClick={handleToggleWatched}
                              style={{
                                 borderColor: isWatched ? '#00ff88' : 'rgba(255, 255, 255, 0.1)',
                                 color: isWatched ? '#00ff88' : '#fff'
                              }}
                            >
                              <Check size={20} style={{ color: isWatched ? '#00ff88' : '#fff' }} />
                              {isWatched ? 'Desmarcar como Assistido' : 'Marcar como Assistido'}
                            </button>
                        </>
                    )}
                    {user?.role === 'admin' && (
                        <button className="nav-btn-modern" disabled={dlState.isVisible && !dlState.isError && !dlState.isSuccess} onClick={async () => {
                            if (!id) return;
                            const token = localStorage.getItem('cinegeek_token');
                            const uuidVal = localStorage.getItem('cinegeek_uuid');
                            const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
                            if (token) headers['Authorization'] = `Bearer ${token}`;

                            setDlState({ isVisible: true, status: 'Conectando aos indexadores...', isError: false, isSuccess: false });
                            
                            try {
                                const steps = [
                                    "Buscando melhor qualidade disponível...",
                                    "Validando magnet links...",
                                    "Preparando envio para o servidor..."
                                ];
                                let stepIdx = 0;
                                const interval = setInterval(() => {
                                    if (stepIdx < steps.length) {
                                        setDlState(prev => ({ ...prev, status: steps[stepIdx] }));
                                        stepIdx++;
                                    }
                                }, 3000);

                                const resp = await fetch('/api/downloads/request', {
                                    method: 'POST',
                                    headers,
                                    body: JSON.stringify({
                                        title: title.split(' - ')[0].split(':')[0].trim(),
                                        type: location.pathname.includes('/filme/') ? 'movie' : 'tv',
                                        year: seriesDetail?.first_air_date?.split('-')[0] || null,
                                        season: season ? parseInt(season) : null,
                                        episode: episode ? parseInt(episode) : null,
                                        poster_path: state.poster_path
                                    })
                                });
                                
                                clearInterval(interval);

                                if (resp.ok) {
                                    setDlState({ isVisible: true, status: 'Download iniciado no servidor com sucesso!', isError: false, isSuccess: true });
                                } else {
                                    const err = await resp.json();
                                    setDlState({ isVisible: true, status: err.error || 'Erro ao buscar torrent.', isError: true, isSuccess: false });
                                }
                            } catch (e) {
                                setDlState({ isVisible: true, status: 'Falha de rede ao tentar iniciar o download.', isError: true, isSuccess: false });
                            }
                        }} style={{ background: dlState.isVisible && !dlState.isError && !dlState.isSuccess ? '#333' : 'var(--primary, #00ff88)', color: dlState.isVisible && !dlState.isError && !dlState.isSuccess ? '#888' : '#000', borderColor: dlState.isVisible && !dlState.isError && !dlState.isSuccess ? '#333' : 'var(--primary, #00ff88)' }}>
                            {dlState.isVisible && !dlState.isError && !dlState.isSuccess ? <Loader size={20} className="spin-anim" /> : <Download size={20} />} 
                            {dlState.isVisible && !dlState.isError && !dlState.isSuccess ? 'Buscando...' : 'Baixar'}
                        </button>
                    )}
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

        {/* Modal de Status de Download */}
        {dlState.isVisible && (
            <div style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.85)',
                backdropFilter: 'blur(10px)',
                zIndex: 9999,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <div style={{
                    background: '#13131a',
                    border: '1px solid #1a2f24',
                    borderRadius: '20px',
                    padding: '2rem',
                    width: '90%',
                    maxWidth: '400px',
                    textAlign: 'center',
                    boxShadow: '0 20px 50px rgba(0,255,136,0.1)',
                    position: 'relative'
                }}>
                    {!dlState.isSuccess && !dlState.isError && (
                        <div style={{ margin: '0 auto 1.5rem auto', width: '50px', height: '50px', borderRadius: '50%', border: '3px solid rgba(0,255,136,0.1)', borderTopColor: '#00ff88', animation: 'spin 1s linear infinite' }} />
                    )}
                    {dlState.isSuccess && (
                        <div style={{ margin: '0 auto 1.5rem auto', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(0,255,136,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={30} color="#00ff88" />
                        </div>
                    )}
                    {dlState.isError && (
                        <div style={{ margin: '0 auto 1.5rem auto', width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(255,59,48,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CloseIcon size={30} color="#ff3b30" />
                        </div>
                    )}
                    
                    <h3 style={{ margin: '0 0 1rem 0', color: '#fff', fontSize: '1.2rem' }}>
                        {dlState.isSuccess ? 'Download Iniciado!' : dlState.isError ? 'Erro no Download' : 'Buscando Torrent...'}
                    </h3>
                    
                    <p style={{ color: '#888', margin: '0 0 1.5rem 0', fontSize: '0.9rem', lineHeight: '1.5' }}>
                        {dlState.status}
                    </p>

                    {dlState.isSuccess && (
                        <button onClick={() => navigate('/downloads')} style={{
                            background: '#00ff88', color: '#000', border: 'none', borderRadius: '10px', padding: '0.8rem 1.5rem', fontWeight: 'bold', cursor: 'pointer', width: '100%'
                        }}>
                            Ver Meus Downloads
                        </button>
                    )}
                    {dlState.isError && (
                        <button onClick={() => setDlState({ isVisible: false, status: '', isError: false, isSuccess: false })} style={{
                            background: '#ff3b30', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.8rem 1.5rem', fontWeight: 'bold', cursor: 'pointer', width: '100%'
                        }}>
                            Fechar
                        </button>
                    )}
                </div>
                <style>{`
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    .spin-anim { animation: spin 1s linear infinite; }
                `}</style>
            </div>
        )}
      </div>
    );
  }
