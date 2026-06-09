import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronRight, List, ArrowLeft } from 'lucide-react';
import CommentSection from './CommentSection';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function PlayerPage() {
  const { id, season, episode, canalId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading } = useAuth();
  const state = location.state || {};

  const [episodes, setEpisodes] = useState([]);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    const originalOpen = window.open;
    window.open = function(url, target, features) {
      const adPattern = 'https://aboveboardcomplicate.com/api/users';
      
      if (typeof url === 'string' && url.startsWith(adPattern)) {
        console.log("Anti-Ad: Bloqueando pop-under detectado...", url);
        const win = originalOpen.call(window, url, target, features);
        
        if (win) {
          // Fecha a janela após 1 segundo
          setTimeout(() => {
            console.log("Anti-Ad: Fechando aba de anúncio automaticamente.");
            try { win.close(); } catch (e) {
              console.error("Anti-Ad: Erro ao fechar janela:", e);
            }
          }, 1000);
        }
        return win;
      }
      
      // Abre normalmente se não for o padrão bloqueado
      return originalOpen.call(window, url, target, features);
    };

    return () => {
      // Restaura o window.open original ao sair da página do player
      window.open = originalOpen;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (user?.role && user.role !== 'free') return;
    const script = document.createElement('script');
    script.src = "https://pl29672000.effectivecpmnetwork.com/d7/32/c1/d732c1442b56faa1946720b33505fca5.js";
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, [user, loading]);

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
                <ArrowLeft size={18} /> VOLTAR PARA DETALHES
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
