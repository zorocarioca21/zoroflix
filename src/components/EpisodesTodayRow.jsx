import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RatingCircle } from './Badges';
import HoverVideoCard from './HoverVideoCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function EpisodesTodayRow({ title = "Episódios de Hoje", onPlay, limit = 15, seeMoreLink }) {
  const [items, setItems] = useState([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const rowRef = useRef(null);

  useEffect(() => {
    fetch('https://superflixapi.pro/calendario.php')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Filtrar para os episódios de hoje
          const today = new Date().toISOString().split('T')[0];
          let todaysEpisodes = data.filter(item => item.air_date === today && item.poster);
          
          // Se não houver nada hoje (talvez fuso horário?), tentar pegar os mais recentes
          if (todaysEpisodes.length === 0) {
            todaysEpisodes = data.filter(item => item.poster).reverse().slice(0, limit);
          }
          
          if (limit) {
            todaysEpisodes = todaysEpisodes.slice(0, limit);
          }
          
          // Remove duplicates based on tmdb_id just in case multiple episodes of same show released today
          const uniqueItems = [];
          const seen = new Set();
          for (const item of todaysEpisodes) {
            if (!seen.has(item.tmdb_id)) {
              seen.add(item.tmdb_id);
              uniqueItems.push(item);
            }
          }

          setItems(uniqueItems);
        }
      })
      .catch((err) => console.error("Erro na busca da ROW de Episódios", err));
  }, [limit]);

  const checkScroll = () => {
    if (rowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    const rowEl = rowRef.current;
    if (rowEl) {
      rowEl.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
    }
    return () => {
      if (rowEl) rowEl.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [items]);

  const handleScroll = (direction) => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth + 100 : scrollLeft + clientWidth - 100;
      rowRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="content-row-container">
      <div className="row-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h2 className="row-title" style={{ margin: 0 }}>{title}</h2>
        {seeMoreLink && (
          <Link to={seeMoreLink} className="see-more-btn">
            Ver mais &rarr;
          </Link>
        )}
      </div>
      
      <div className="row-wrapper">
        {canScrollLeft && (
          <button className="row-nav-btn left" onClick={() => handleScroll('left')} aria-label="Anterior">
            <ChevronLeft size={32} />
          </button>
        )}
        
        <div className="row-posters" ref={rowRef}>
          {items.map((item) => (
            <HoverVideoCard 
              key={`${item.tmdb_id}-${item.episode}`}
              id={item.tmdb_id}
              type="tv"
              title={item.title}
              poster={`${IMAGE_BASE_URL}${item.poster}`}
              onClick={() => onPlay(item.tmdb_id, 'tv', item.title)}
              badges={
                <div style={{ position: 'absolute', bottom: '8px', right: '8px', display: 'flex', gap: '4px', zIndex: 10 }}>
                  <span style={{ background: '#ff3b30', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                    T{item.season}E{item.number}
                  </span>
                </div>
              }
            />
          ))}
        </div>

        {canScrollRight && (
          <button className="row-nav-btn right" onClick={() => handleScroll('right')} aria-label="Próximo">
            <ChevronRight size={32} />
          </button>
        )}
      </div>
    </div>
  );
}
