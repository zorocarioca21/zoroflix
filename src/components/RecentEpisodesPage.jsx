import React, { useState, useEffect } from 'react';
import { useNavigate, useNavigationType } from 'react-router-dom';
import HoverVideoCard from './HoverVideoCard';
import { getSlug } from '../utils/slug';

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function RecentEpisodesPage() {
  const navigate = useNavigate();
  const navType = useNavigationType();
  const isPop = navType === 'POP';

  const [items, setItems] = useState(() => {
    if (!isPop) return [];
    const cached = sessionStorage.getItem('recent-episodes-items');
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(isPop ? !sessionStorage.getItem('recent-episodes-items') : true);
  const [visibleCount, setVisibleCount] = useState(() => {
    if (!isPop) return 20;
    return parseInt(sessionStorage.getItem('recent-episodes-visible')) || 20;
  });
  
  const isFirstMount = React.useRef(true);

  useEffect(() => {
    if (isFirstMount.current && items.length > 0) {
      isFirstMount.current = false;
      // Recupera o scroll no mount
      const savedScroll = sessionStorage.getItem('recent-episodes-scroll');
      if (savedScroll) {
        setTimeout(() => window.scrollTo(0, parseInt(savedScroll)), 100);
      }
      return;
    }
    isFirstMount.current = false;
    
    setLoading(true);
    fetch('https://superflixapi.pro/calendario.php')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const todayStr = new Date().toISOString().split('T')[0];
          let validEpisodes = data.filter(item => item.poster && item.air_date <= todayStr);
          // Ordenar por data de lançamento (mais recentes primeiro)
          validEpisodes.sort((a, b) => new Date(b.air_date) - new Date(a.air_date));

          // Remover duplicatas baseadas no id + temporada + episodio para garantir que cada lançamento seja único
          const uniqueItems = [];
          const seen = new Set();
          for (const item of validEpisodes) {
            const key = `${item.tmdb_id}-${item.season}-${item.number}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueItems.push(item);
            }
          }

          setItems(uniqueItems);
          sessionStorage.setItem('recent-episodes-items', JSON.stringify(uniqueItems));
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro na busca de Episódios Recentes", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    sessionStorage.setItem('recent-episodes-visible', visibleCount);
  }, [visibleCount]);

  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem('recent-episodes-scroll', window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="catalog-container">
      <header className="catalog-header">
        <h1 className="row-title">Episódios Recentes</h1>
      </header>

      <div className="catalog-grid">
        {items.slice(0, visibleCount).map((item) => (
          <HoverVideoCard
            key={`${item.tmdb_id}-${item.season}-${item.number}`}
            id={item.tmdb_id}
            type="tv"
            title={item.title}
            poster={`${IMAGE_BASE_URL}${item.poster}`}
            onClick={() => navigate(`/serie/${getSlug(item.title)}/${item.season}/${item.number}/player`, { state: { id: item.tmdb_id, title: item.title, poster_path: item.poster } })}
            badges={
              <>
                <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px', zIndex: 10 }}>
                  <span style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>
                    {item.air_date ? item.air_date.split('-').reverse().join('/') : ''}
                  </span>
                </div>
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px', zIndex: 10 }}>
                  <span style={{ background: '#ff3b30', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                    T{item.season}E{item.number}
                  </span>
                </div>
              </>
            }
          />
        ))}
      </div>

      {!loading && visibleCount < items.length && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '3rem 0' }}>
          <button className="btn btn-primary" onClick={() => setVisibleCount(v => v + 10)}>
            CARREGAR MAIS
          </button>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '3rem 0', color: 'var(--text-muted)' }}>
          Carregando episódios...
        </div>
      )}
    </div>
  );
}
