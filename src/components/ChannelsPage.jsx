import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const url = 'https://superflixapi.fit/lista?category=canais&format=json';
    // Usando corsproxy.io que é bem estável
    fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(resp => {
        if (resp && resp.data) {
          setChannels(resp.data);
          setLoading(false);
        } else {
          throw new Error("Failed");
        }
      })
      .catch(() => {
        // Fallback AllOrigins se falhar
        fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`)
          .then(r => r.json())
          .then(resp => {
            if (resp.contents) {
              const parsed = JSON.parse(resp.contents);
              if (parsed && parsed.data) setChannels(parsed.data);
            }
            setLoading(false);
          })
          .catch(() => setLoading(false));
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
