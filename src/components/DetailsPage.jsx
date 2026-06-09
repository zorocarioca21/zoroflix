import { useState, useEffect, useRef } from 'react';
import AdBanner from './AdBanner';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { RatingCircle, AgeBadge } from './Badges';
import { Users, Calendar, Clock, Activity, DollarSign, TrendingUp } from 'lucide-react';

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
  const [cast, setCast] = useState([]);
  const [brCertification, setBrCertification] = useState('');
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
    const append = isMovie ? 'credits,release_dates' : 'credits,content_ratings';
    
    fetch(`${BASE_URL}${endpoint}?api_key=${API_KEY}&language=pt-BR&append_to_response=${append}`)
      .then(r => r.json())
      .then(data => {
        setDetails(data);
        setCast(data.credits?.cast?.slice(0, 6) || []);
        
        // Determinar classificação etária BR
        let cert = '';
        if (isMovie) {
          const br = data.release_dates?.results?.find(r => r.iso_3166_1 === 'BR');
          cert = br?.release_dates?.[0]?.certification;
        } else {
          const br = data.content_ratings?.results?.find(r => r.iso_3166_1 === 'BR');
          cert = br?.rating;
        }
        setBrCertification(cert || '');
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

  const year = (details.release_date || details.first_air_date)?.split('-')[0];

  return (
    <div className="details-container">
      
      <div 
        className="details-hero"
        style={{ backgroundImage: `url(${BACKDROP_BASE_URL}${details.backdrop_path})` }}
      >
        <div className="details-overlay"></div>
        
        <div className="details-content">
          <div className="details-poster-wrap">
            <AgeBadge rating={brCertification} />
            <img 
              src={`${IMAGE_BASE_URL}${details.poster_path}`} 
              alt={details.title || details.name} 
              className="details-poster" 
            />
          </div>
          <div className="details-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '15px' }}>
              <RatingCircle rating={details.vote_average} />
              <h1 className="details-title">{details.title || details.name}</h1>
            </div>
            
            <div className="details-meta">
              <span><Calendar size={16} /> {year}</span>
              {details.runtime && <span><Clock size={16} /> {details.runtime} min</span>}
              <span><Activity size={16} /> {details.status}</span>
            </div>

            <p className="details-overview">{details.overview || "Nenhuma sinopse disponível em português para este título."}</p>
            
            {/* Elenco Horizontal na Info */}
            {cast.length > 0 && (
              <div className="details-cast-preview">
                <h3 className="section-small-title"><Users size={16} /> Elenco Principal</h3>
                <div className="cast-scroll">
                  {cast.map(actor => (
                    <div key={actor.id} className="cast-mini-card">
                      <img 
                        src={actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : 'https://via.placeholder.com/185x278?text=N/A'} 
                        alt={actor.name} 
                      />
                      <span>{actor.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="details-extra-row">
              {details.budget > 0 && <span><DollarSign size={14} /> Orçamento: ${details.budget.toLocaleString()}</span>}
              {details.revenue > 0 && <span><TrendingUp size={14} /> Receita: ${details.revenue.toLocaleString()}</span>}
            </div>
            
            {isMovie && (
              <div style={{ marginTop: '2rem' }}>
                <button 
                  className="btn btn-primary btn-large details-play-btn"
                  onClick={() => navigate(`/filme/${id}/player`, { state: { title: details.title } })}
                >
                  ▶ ASSISTIR FILME
                </button>
                <AdBanner adId="details-movie-bottom" />
              </div>
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
