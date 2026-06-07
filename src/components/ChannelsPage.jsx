import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithProxy } from '../utils/api';

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const url = 'https://superflixapi.fit/lista?category=canais&format=json';
    
    fetchWithProxy(url)
      .then(data => {
        if (data && data.data) {
          setChannels(data.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar canais:", err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="details-loading">Buscando canais...</div>;

  return (
    <div className="search-page-container">
      <h2 className="row-title" style={{marginBottom: '2rem'}}>TV Ao Vivo - Canais Disponíveis</h2>
      <div className="search-grid">
        {channels.map((ch) => (
          <div 
            className="search-card" 
            key={ch.id} 
            onClick={() => navigate(`/canal/${ch.id}`, { state: { embed_url: ch.embed_url, title: ch.name } })}
            style={{background: '#fff'}}
          >
            <div className="search-card-img-wrapper" style={{aspectRatio: '16/9'}}>
              <img 
                src={ch.logo_url} 
                alt={ch.name} 
                className="search-card-img"
                style={{objectFit: 'contain', padding: '1rem'}}
                loading="lazy"
              />
              <div className="search-card-overlay">
                <span className="row-play-icon">▶</span>
              </div>
            </div>
            <div className="search-card-info" style={{background: 'var(--bg-card)'}}>
              <div className="search-card-title">{ch.name}</div>
              <div className="search-card-type">{ch.category || 'TV'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
