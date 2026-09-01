import React, { useState, useEffect } from 'react';
import { useNavigate, useNavigationType } from 'react-router-dom';
import { fetchWithProxy } from '../utils/api';
import SportsFixtures from './SportsFixtures';
import { Tv } from 'lucide-react';

function ChannelCard({ ch, onClick }) {
  const [imgError, setImgError] = useState(!ch.logo_url);

  return (
    <div className="search-card channel-card-item" onClick={onClick}>
      <div className="search-card-img-wrapper channel-img-box">
        {!imgError ? (
          <img 
            src={ch.logo_url} 
            alt={ch.name} 
            className="search-card-img channel-logo-img"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="channel-placeholder-box">
            <Tv size={36} className="channel-tv-icon" />
            <span className="channel-placeholder-name">{ch.name}</span>
          </div>
        )}
        <div className="search-card-overlay">
          <span className="row-play-icon">â–¶</span>
        </div>
      </div>
      <div className="search-card-info">
        <div className="search-card-title">{ch.name}</div>
        <div className="search-card-type">{ch.category || 'TV'}</div>
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const storageKey = 'channels-page';
  const navigate = useNavigate();
  const navType = useNavigationType();
  const isPop = navType === 'POP';

  const [channels, setChannels] = useState(() => {
    if (!isPop) return [];
    const cached = sessionStorage.getItem(`${storageKey}-items`);
    return cached ? JSON.parse(cached) : [];
  });
  const [filteredChannels, setFilteredChannels] = useState(() => {
    if (!isPop) return [];
    const cached = sessionStorage.getItem(`${storageKey}-items`);
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(isPop ? !sessionStorage.getItem(`${storageKey}-items`) : true);
  const [searchTerm, setSearchTerm] = useState(() => isPop ? (sessionStorage.getItem(`${storageKey}-search`) || '') : '');
  const [selectedCategory, setSelectedCategory] = useState(() => isPop ? (sessionStorage.getItem(`${storageKey}-category`) || 'Todos') : 'Todos');
  const isFirstMount = React.useRef(true);

  // Salva o estado dos filtros
  useEffect(() => {
    sessionStorage.setItem(`${storageKey}-search`, searchTerm);
    sessionStorage.setItem(`${storageKey}-category`, selectedCategory);
  }, [searchTerm, selectedCategory]);

  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`${storageKey}-scroll`, window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const categories = ['Todos', 'Canais Abertos', 'Esportes', 'Filmes e SÃ©ries', 'DocumentÃ¡rios', 'Infantil', '24 horas', 'Adulto'];

  useEffect(() => {
    document.title = "TV Ao Vivo - CineGeek";
  }, []);

  useEffect(() => {
    if (isFirstMount.current && channels.length > 0) {
      isFirstMount.current = false;
      const savedScroll = sessionStorage.getItem(`${storageKey}-scroll`);
      if (savedScroll) {
        setTimeout(() => window.scrollTo(0, parseInt(savedScroll)), 100);
      }
      return;
    }
    isFirstMount.current = false;

    setLoading(true);
    const url = 'https://superflixapi.beer/lista?category=canais&format=json';
    
    fetchWithProxy(url)
      .then(data => {
        if (data && data.data) {
          setChannels(data.data);
          sessionStorage.setItem(`${storageKey}-items`, JSON.stringify(data.data));
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
          <ChannelCard 
            key={ch.id} 
            ch={ch} 
            onClick={() => navigate(`/canal/${ch.id}`, { state: { embed_url: ch.embed_url, title: ch.name } })} 
          />
        ))}
      </div>
    </div>
  );
}
