import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function CalendarPage() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const url = 'https://superflixapi.fit/calendario.php';
    fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setReleases(data);
        }
        setLoading(false);
      })
      .catch(e => {
        console.error("Erro calendário:", e);
        fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
          .then(r => r.json())
          .then(resp => {
            if (resp.contents) {
              const parsed = JSON.parse(resp.contents);
              if (Array.isArray(parsed)) setReleases(parsed);
            }
            setLoading(false);
          })
          .catch(() => setLoading(false));
      });
  }, []);

  if (loading) return <div className="details-loading">Buscando lançamentos...</div>;

  return (
    <div className="search-page-container">
      <h2 className="row-title" style={{marginBottom: '2rem'}}>Agenda de Lançamentos Recentes</h2>
      <div className="search-grid">
        {releases.map((item, idx) => (
          <div 
            className="search-card" 
            key={idx} 
            onClick={() => {
              navigate(`/serie/${item.tmdb_id}/${item.season}/${item.number}/player`, { 
                state: { title: `${item.title} - ${item.episode}` } 
              });
            }}
          >
            <div className="search-card-img-wrapper" style={{aspectRatio: '16/9'}}>
              <img 
                src={`https://image.tmdb.org/t/p/w500${item.backdrop || item.poster}`} 
                alt={item.title} 
                className="search-card-img"
                loading="lazy"
                onError={(e) => { e.target.src = 'https://via.placeholder.com/500x281/051912/fbbf24?text=ZoroFlix' }}
              />
              <div className="search-card-overlay">
                <span className="row-play-icon">▶</span>
              </div>
            </div>
            <div className="search-card-info" style={{background: 'var(--bg-card)'}}>
              <div className="search-card-title">{item.title}</div>
              <div style={{fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.5rem'}}>
                T{item.season}:E{item.number} - {item.episode}
              </div>
              <div className="search-card-type">{item.status || 'Lançamento!'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
