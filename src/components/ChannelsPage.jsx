import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useNavigationType } from 'react-router-dom';
import { fetchWithProxy } from '../utils/api';
import SportsFixtures from './SportsFixtures';
import { Tv } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function ChannelCard({ ch, onClick }) {
  const [imgError, setImgError] = useState(!ch.logo_url);

  const badgeUpper = (ch.vip_badge || ch.category || '').toUpperCase();
  const isVip2 = badgeUpper.includes('VIP 2') || badgeUpper.includes('VIP2');
  const isVip3 = badgeUpper.includes('VIP 3') || badgeUpper.includes('VIP3');
  const badgeText = ch.vip_badge || (ch.isVip ? 'VIP' : null);
  
  let badgeBg = 'linear-gradient(45deg, #ffd700, #ff8c00)';
  if (isVip2) {
    badgeBg = 'linear-gradient(45deg, #00ff88, #00d2ff)';
  } else if (isVip3) {
    badgeBg = 'linear-gradient(45deg, #a855f7, #ec4899)';
  }

  return (
    <div className="search-card channel-card-item" onClick={onClick} style={{ position: 'relative' }}>
      {ch.isVip ? (
        <div style={{ position: 'absolute', top: 5, right: 5, background: badgeBg, color: '#000', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', zIndex: 10, boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }}>
          {badgeText}
        </div>
      ) : (
        <div style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(239, 68, 68, 0.9)', color: '#fff', padding: '3px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', zIndex: 10, boxShadow: '0 2px 5px rgba(0,0,0,0.5)', letterSpacing: '0.5px', border: '1px solid rgba(255,255,255,0.2)' }} title="Canal com anúncios externos">
          ANÚNCIOS
        </div>
      )}
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
          <span className="row-play-icon">▶</span>
        </div>
      </div>
      <div className="search-card-info">
        <div className="search-card-title">{ch.name}</div>
        <div className="search-card-type">{ch.sub_category || ch.category || 'TV'}</div>
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const storageKey = 'channels-page';
  const navigate = useNavigate();
  const navType = useNavigationType();
  const isPop = navType === 'POP';
  const { user } = useAuth();

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
  const [showVipPopup, setShowVipPopup] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);
  const [dynamicVipBadges, setDynamicVipBadges] = useState(() => {
    if (!isPop) return [];
    const cached = sessionStorage.getItem(`${storageKey}-badges`);
    return cached ? JSON.parse(cached) : [];
  });
  const isFirstMount = React.useRef(true);
  const observerRef = React.useRef(null);

  // Salva o estado dos filtros e badges
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

  const otherCategories = ['Canais Abertos', 'Esportes', 'Filmes e Séries', 'Documentários', 'Infantil', '24 horas', 'Adulto'];
  
  // Categorias de VIP dinâmicas baseadas nas listas cadastradas no Painel (ex: VIP 2, VIP 3)
  const normalizedVipBadges = dynamicVipBadges && dynamicVipBadges.length > 0
    ? dynamicVipBadges
    : ['VIP 2', 'VIP 3'];

  // Lista unificada de categorias com os selos das listas (VIPs geral, VIP 2, VIP 3...)
  const categories = [
    'Todos',
    'VIPs',
    ...normalizedVipBadges,
    ...otherCategories
  ];

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
    const superflixUrl = 'https://superflixapi.beer/lista?category=canais&format=json';
    const iptvAllUrl = '/api/iptv/all';
    
    Promise.allSettled([
      fetchWithProxy(superflixUrl).then(data => data && data.data ? data.data : []),
      fetch(iptvAllUrl).then(r => r.json()).catch(() => ({ channels: [], badges: [] }))
    ]).then(results => {
      const superflixData = results[0].status === 'fulfilled' ? results[0].value : [];
      const iptvDbData = results[1].status === 'fulfilled' ? results[1].value : { channels: [], badges: [] };

      const formattedDbVip = (iptvDbData.channels || []).map((v) => ({
        ...v,
        isVip: true
      }));

      if (iptvDbData.badges && iptvDbData.badges.length > 0) {
        setDynamicVipBadges(iptvDbData.badges);
        sessionStorage.setItem(`${storageKey}-badges`, JSON.stringify(iptvDbData.badges));
      }

      // Prioridade: canais cadastrados no banco pelo Painel ADM, depois canais públicos Superflix
      const combined = [...formattedDbVip, ...superflixData];
      setChannels(combined);
      sessionStorage.setItem(`${storageKey}-items`, JSON.stringify(combined));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let result = channels;
    
    if (selectedCategory !== 'Todos') {
      if (selectedCategory === 'VIPs') {
        result = result.filter(ch => ch.isVip);
      } else {
        result = result.filter(ch => 
          ch.category?.toLowerCase() === selectedCategory.toLowerCase() ||
          ch.vip_badge?.toLowerCase() === selectedCategory.toLowerCase() ||
          ch.sub_category?.toLowerCase() === selectedCategory.toLowerCase()
        );
      }
    } else {
      result = result.filter(ch => !ch.isVip); // Ocultar VIPs na aba 'Todos'
    }
    
    if (searchTerm) {
      result = result.filter(ch => ch.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    
    setFilteredChannels(result);
    setDisplayCount(20); // Resetar display count ao filtrar
  }, [searchTerm, selectedCategory, channels]);

  // Intersection Observer para Infinity Scroll
  useEffect(() => {
    if (loading) return;
    
    const handleObserver = (entries) => {
      const target = entries[0];
      if (target.isIntersecting && displayCount < filteredChannels.length) {
        setDisplayCount(prev => prev + 20);
      }
    };

    observerRef.current = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: "200px",
      threshold: 0.1
    });

    const trigger = document.getElementById('infinite-scroll-trigger');
    if (trigger) observerRef.current.observe(trigger);

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [loading, displayCount, filteredChannels.length]);

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
        {filteredChannels.slice(0, displayCount).map((ch) => (
          <ChannelCard 
            key={ch.id} 
            ch={ch} 
            onClick={() => {
              const uRole = user?.role?.toLowerCase() || '';
              if (ch.isVip && (!user || (uRole !== 'admin' && uRole !== 'vip'))) {
                setShowVipPopup(true);
              } else {
                navigate(`/canal/${ch.id}`, { state: { embed_url: ch.embed_url, title: ch.name, isVip: ch.isVip } });
              }
            }} 
          />
        ))}
      </div>
      
      {displayCount < filteredChannels.length && (
        <div id="infinite-scroll-trigger" style={{ height: '20px', width: '100%', margin: '20px 0' }}></div>
      )}

      {showVipPopup && (
        <div className="vip-popup-overlay" onClick={() => setShowVipPopup(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="vip-popup-content" onClick={e => e.stopPropagation()} style={{ background: '#111', padding: '30px', borderRadius: '15px', maxWidth: '400px', textAlign: 'center', border: '1px solid #333' }}>
            <Tv size={50} color="#ffd700" style={{ marginBottom: '20px' }} />
            <h2 style={{ color: '#ffd700', marginBottom: '15px' }}>Conteúdo Exclusivo VIP</h2>
            <p style={{ color: '#ccc', lineHeight: '1.5', marginBottom: '20px' }}>
              Este canal é restrito para usuários VIP. Assine um plano VIP para ter acesso a mais de 2.000 canais ao vivo, transmissão super rápida e uma experiência 100% livre de anúncios!
            </p>
            <button onClick={() => setShowVipPopup(false)} style={{ background: '#ffd700', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
