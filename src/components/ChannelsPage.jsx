import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithProxy } from '../utils/api';
import SportsFixtures from './SportsFixtures';

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [filteredChannels, setFilteredChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const navigate = useNavigate();

  const categories = ['Todos', 'Canais Abertos', 'Esportes', 'Filmes e Séries', 'Documentários', 'Infantil', '24 horas', 'Adulto'];

  useEffect(() => {
    document.title = "TV Ao Vivo - CineGeek";
  }, []);

  useEffect(() => {
    const url = 'https://superflixapi.fit/lista?category=canais&format=json';
    
    fetchWithProxy(url)
      .then(data => {
        if (data && data.data) {
          setChannels(data.data);
          setFilteredChannels(data.data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar canais:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let result = channels;
    
    if (selectedCategory !== 'Todos') {
      result = result.filter(ch => ch.category?.toLowerCase() === selectedCategory.toLowerCase());
    }
    
    if (searchTerm) {
      result = result.filter(ch => ch.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    setFilteredChannels(result);
  }, [searchTerm, selectedCategory, channels]);

  if (loading) return <div className="details-loading">Buscando canais...</div>;

  return (
    <div className="search-page-container">
      <div className="catalog-header">
        <h2 className="row-title">TV Ao Vivo</h2>
        
        <SportsFixtures />

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

      <div className="category-pills-container">
        {categories.map(cat => (
          <button 
            key={cat} 
            className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
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
                onError={(e) => { e.target.src = '/cinegeek-icon.png'; e.target.style.opacity = 0.5; }}
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
