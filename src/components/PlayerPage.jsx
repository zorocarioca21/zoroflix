import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

export default function PlayerPage() {
  const { id, season, episode, canalId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state || {};

  // Injetar anúncio pop-under apenas nesta página
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://pl29672000.effectivecpmnetwork.com/d7/32/c1/d732c1442b56faa1946720b33505fca5.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Remove o script ao sair, embora pop-unders bindem no document
      // mas ajuda a manter o DOM limpo.
      document.body.removeChild(script);
    };
  }, []);

  let playerUrl = '';
  let title = state.title || 'Carregando...';

  // Se for canal
  if (canalId) {
    playerUrl = (state.embed_url || `https://superflixapi.fit/canal/${canalId}`) + '#noEpList';
  } else {
    // Se for filme ou serie
    const isMovie = location.pathname.includes('/filme/');
    const apiType = isMovie ? 'filme' : 'serie';

    if (season && episode) {
      playerUrl = `https://superflixapi.fit/${apiType}/${id}/${season}/${episode}#noEpList`;
    } else {
      playerUrl = `https://superflixapi.fit/${apiType}/${id}#noEpList`;
    }
  }

  const handleBack = () => {
    // Se tivermos informações de onde viemos, podemos voltar pra lá
    // Se for série, voltar pros detalhes da série
    if (canalId) {
        navigate('/canais');
    } else if (location.pathname.includes('/filme/')) {
        navigate(`/filme/${id}`);
    } else {
        navigate(`/serie/${id}`);
    }
  };

  return (
    <div className="player-page-container">
      <div className="player-page-header">
        <button className="btn-back-player" onClick={handleBack}>
          &#8592; VOLTAR PARA INFO
        </button>
        <span className="player-title-label">Assistindo: {title}</span>
      </div>
      <div className="fullscreen-player-wrapper">
        <iframe 
          src={playerUrl} 
          allowFullScreen 
          title="Zoroflix Player"
        ></iframe>
      </div>
    </div>
  );
}
