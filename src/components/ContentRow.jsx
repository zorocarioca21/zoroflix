import { useState, useEffect, useRef } from 'react';
import { RatingCircle } from './Badges';
import HoverVideoCard from './HoverVideoCard';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function ContentRow({ title, endpoint, type, onPlay }) {
  const [items, setItems] = useState([]);
  const rowRef = useRef(null);

  useEffect(() => {
    fetch(`${BASE_URL}${endpoint}&api_key=${API_KEY}&language=pt-BR`)
      .then((res) => res.json())
      .then((data) => {
        if (data.results) {
          // Filtrar os que não tem imagem
          setItems(data.results.filter(item => item.poster_path));
        }
      })
      .catch((err) => console.error("Erro na busca da ROW", err));
  }, [endpoint]);

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
      <h2 className="row-title">{title}</h2>
      
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
              onClick={() => onPlay(item.id, type)}
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
