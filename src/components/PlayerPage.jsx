import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronRight, List, ArrowLeft } from 'lucide-react';
import CommentSection from './CommentSection';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function PlayerPage() {
  const { id: rawId, season, episode, canalId } = useParams();
  const id = rawId ? rawId.split('-')[0] : null;
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const state = location.state || {};

  const [episodes, setEpisodes] = useState([]);
  const [showList, setShowList] = useState(false);
  const [configs, setConfigs] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (state.title) {
        document.title = `${state.title} - CineGeek`;
    }
  }, [state.title]);

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

  let playerUrl = '';
  let title = state.title || 'Carregando...';

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
        navigate(`/serie/${id}/${season}/${nextEp}/player`, { state: { title: `${state.title?.split(' - ')[0]} - ${exists.name}` } });
    }
  };

  const handlePrev = () => {
    const prevEp = parseInt(episode) - 1;
    if (prevEp >= 1) {
        const exists = episodes.find(e => e.episode_number === prevEp);
        navigate(`/serie/${id}/${season}/${prevEp}/player`, { state: { title: `${state.title?.split(' - ')[0]} - ${exists?.name || `Episódio ${prevEp}`}` } });
    }
  };

  const handleGoBack = () => {
    if (canalId) navigate('/canais');
    else if (season) navigate(`/serie/${id}`);
    else navigate(`/filme/${id}`);
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
                                navigate(`/serie/${id}/${season}/${ep.episode_number}/player`, { state: { title: `${state.title?.split(' - ')[0]} - ${ep.name}` } });
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
    </div>
  );
}
