import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithProxy } from '../utils/api';

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
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

  const filteredChannels = channels.filter(ch => 
    ch.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="details-loading">Buscando canais...</div>;

  return (
    <div className="search-page-container">
      <div className="catalog-header">
        <h2 className="row-title">TV Ao Vivo</h2>
        <div className="filters-bar">
          <div className="filter-group">
            <input 
              type="text" 
              className="local-search-input" 
              placeholder="Pesquisar canal..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="search-grid">
        {filteredChannels.map((ch) => (
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
