import { useNavigate } from 'react-router-dom';
import AdBanner from './AdBanner';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w300';

export default function SearchPage({ results }) {
  const navigate = useNavigate();

  if (results.length === 0) {
    return (
      <div className="search-page-empty">
        <h2 style={{color: 'var(--text)', textAlign: 'center', marginTop: '6rem'}}>Nenhuma obra encontrada.</h2>
        <p style={{textAlign: 'center', color: 'var(--text-muted)'}}>Tente pesquisar com outros termos.</p>
      </div>
    );
  }

  const handleSelectItem = (item) => {
    const type = item.media_type || 'movie';
    if (type === 'movie') {
        navigate(`/filme/${item.id}`);
    } else {
        navigate(`/serie/${item.id}`);
    }
  };

  return (
    <div className="search-page-container">
      <h2 className="row-title" style={{marginBottom: '2rem'}}>Resultados da Pesquisa</h2>
      {/* Ad banner placeholder */}
      <AdBanner adId="search-top" />
      <div className="search-grid">
        {results.map((item) => (
          <div className="search-card" key={item.id} onClick={() => handleSelectItem(item)}>
            <div className="search-card-img-wrapper">
              <img 
                src={`${TMDB_IMAGE_BASE}${item.poster_path}`} 
                alt={item.title || item.name} 
                className="search-card-img"
                loading="lazy"
              />
              <div className="search-card-overlay">
                <span className="row-play-icon">ℹ️</span>
              </div>
            </div>
            <div className="search-card-info">
              <div className="search-card-title">{item.title || item.name}</div>
              <div className="search-card-type">{item.media_type === 'movie' ? '🎬 Filme' : '📺 Série'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
