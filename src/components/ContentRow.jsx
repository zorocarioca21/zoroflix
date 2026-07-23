import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RatingCircle } from './Badges';
import HoverVideoCard from './HoverVideoCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function ContentRow({ title, endpoint, type, onPlay, limit = 10, seeMoreLink }) {
  const [items, setItems] = useState([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const rowRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE_URL}${endpoint}&api_key=${API_KEY}&language=pt-BR`)
      .then((res) => res.json())
      .then((data) => {
        if (data.results) {
          let validItems = data.results.filter(item => item.poster_path);
          if (limit) {
            validItems = validItems.slice(0, limit);
          }
          setItems(validItems);
        }
      })
      .catch((err) => console.error("Erro na busca da ROW", err));
  }, [endpoint, limit]);

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
              key={item.id}
              id={item.id}
              type={type}
              title={item.title || item.name}
              poster={`${IMAGE_BASE_URL}${item.poster_path}`}
              onClick={() => onPlay(item.id, type, item.title || item.name)}
              badges={<RatingCircle rating={item.vote_average} />}
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
