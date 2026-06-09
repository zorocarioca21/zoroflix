import { useState, useEffect, useRef } from 'react';
import AdBanner from './AdBanner';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/original';

export default function DetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isMovie = location.pathname.includes('/filme/');
  
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const episodesRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setSelectedSeason(null);
    setEpisodes([]);
    
    const endpoint = isMovie ? `/movie/${id}` : `/tv/${id}`;
    
    fetch(`${BASE_URL}${endpoint}?api_key=${API_KEY}&language=pt-BR`)
      .then(r => r.json())
      .then(data => {
        setDetails(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [id, isMovie]);

  const loadEpisodes = (seasonNumber) => {
    fetch(`${BASE_URL}/tv/${id}/season/${seasonNumber}?api_key=${API_KEY}&language=pt-BR`)
      .then(r => r.json())
      .then(data => {
        setSelectedSeason(seasonNumber);
        setEpisodes(data.episodes || []);
        setTimeout(() => {
          if (episodesRef.current) episodesRef.current.scrollIntoView({ behavior: 'smooth' })
        }, 100);
      });
  }

  if (loading) return <div className="details-loading">Buscando informações...</div>;
  if (!details) return <div className="details-loading">Erro ao carregar as informações.</div>;

  return (
    <div className="details-container">
      
      <div 
        className="details-hero"
        style={{ backgroundImage: `url(${BACKDROP_BASE_URL}${details.backdrop_path})` }}
      >
        <div className="details-overlay"></div>
        
        <div className="details-content">
          <div className="details-poster-wrap">
            <img 
              src={`${IMAGE_BASE_URL}${details.poster_path}`} 
              alt={details.title || details.name} 
              className="details-poster" 
            />
          </div>
          <div className="details-info">
            <h1 className="details-title">{details.title || details.name}</h1>
            <div className="details-meta">
              <span className="hero-rating">TMDB {details.vote_average?.toFixed(1)}</span>
              <span className="details-date">{details.release_date?.split('-')[0] || details.first_air_date?.split('-')[0]}</span>
              <span className="details-type">{isMovie ? 'Filme' : 'Série'}</span>
            </div>
            <p className="details-overview">{details.overview || "Nenhuma sinopse disponível em português para este título."}</p>
            
            {isMovie && (
              <>
                <button 
                  className="btn btn-primary btn-large details-play-btn"
                  onClick={() => navigate(`/filme/${id}/player`, { state: { title: details.title } })}
                >
                  ▶ ASSISTIR FILME
                </button>
                {/* Anúncio abaixo do botão nos filmes */}
                <AdBanner adId="details-movie-bottom" />
              </>
            )}
          </div>
        </div>
      </div>

      {!isMovie && details.seasons && (
        <div className="details-seasons">
          <h2 className="row-title">Temporadas Disponíveis</h2>
          <p className="seasons-warning">Clique numa temporada para revelar os episódios.</p>
          <div className="seasons-grid">
            {details.seasons.filter(s => s.name !== "Especiais" && s.name !== "Specials").map(season => (
              <div 
                key={season.id} 
                className={`season-card ${selectedSeason === season.season_number ? 'active' : ''}`}
                onClick={() => loadEpisodes(season.season_number)}
                style={{cursor: 'pointer', border: selectedSeason === season.season_number ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.05)'}}
              >
                {season.poster_path ? (
                  <img src={`${IMAGE_BASE_URL}${season.poster_path}`} className="season-img" alt={season.name} />
                ) : (
                  <div className="season-noimg">Sem Imagem</div>
                )}
                <div className="season-info">
                  <h3 className="season-name">{season.name}</h3>
                  <span className="season-eps">{season.episode_count} Episódios</span>
                </div>
              </div>
            ))}
          </div>

          {selectedSeason !== null && (
            <div className="episodes-section" ref={episodesRef} style={{marginTop: '3rem'}}>
              <h2 className="row-title">Episódios da Temporada {selectedSeason}</h2>
              <div className="episodes-list" style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem'}}>
                {episodes.map(ep => (
                  <div 
                    key={ep.id} 
                    className="episode-row" 
                    onClick={() => navigate(`/serie/${id}/${selectedSeason}/${ep.episode_number}/player`, { state: { title: `${details.name} - ${ep.name}` } })}
                    style={{display: 'flex', gap: '1.5rem', background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '1rem', cursor: 'pointer', alignItems: 'center'}}
                  >
                    <div style={{fontWeight: '900', fontSize: '1.5rem', color: 'var(--primary)', width: '40px'}}>{ep.episode_number}</div>
                    <div style={{flexGrow: 1}}>
                      <h4 style={{fontSize: '1.1rem', margin: '0 0 0.5rem 0'}}>{ep.name}</h4>
                      <p style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>{ep.overview || "Sem descrição disponível."}</p>
                    </div>
                    <button className="btn btn-primary" style={{padding: '0.5rem 1rem', fontSize:'0.8rem'}}>▶ LIGAR</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Anúncio ao final de todas as temporadas nas séries */}
          <AdBanner adId="details-series-bottom" />
        </div>
      )}
    </div>
  );
}
