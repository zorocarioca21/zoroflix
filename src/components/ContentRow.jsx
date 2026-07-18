import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { RatingCircle } from './Badges';
import HoverVideoCard from './HoverVideoCard';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function ContentRow({ title, endpoint, type, onPlay, limit = 10, seeMoreLink }) {
  const [items, setItems] = useState([]);
  const rowRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE_URL}${endpoint}&api_key=${API_KEY}&language=pt-BR`)
      .then((res) => res.json())
      .then((data) => {
        if (data.results) {
          // Filtrar os que não tem imagem
          let validItems = data.results.filter(item => item.poster_path);
          if (limit) {
            validItems = validItems.slice(0, limit);
          }
          setItems(validItems);
        }
      })
      .catch((err) => console.error("Erro na busca da ROW", err));
  }, [endpoint, limit]);

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
          <Link to={seeMoreLink} className="see-more-btn" style={{ fontSize: '0.9rem', color: '#00e676', textDecoration: 'none', fontWeight: '600' }}>
            Ver mais &rarr;
          </Link>
        )}
      </div>
      
      <div className="row-wrapper">
        <button className="row-nav-btn left" onClick={() => handleScroll('left')}>
          &#10094;
        </button>
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

        <button className="row-nav-btn right" onClick={() => handleScroll('right')}>
          &#10095;
        </button>
      </div>
    </div>
  );
}
