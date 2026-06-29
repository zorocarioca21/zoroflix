import { useState, useEffect } from 'react';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';

export default function HeroSlider({ onPlay }) {
  const [movies, setMovies] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    fetch(`${BASE_URL}/trending/movie/day?api_key=${API_KEY}&language=pt-BR`)
      .then((res) => res.json())
      .then((data) => {
        if (data.results) {
          // Pegamos os top 10
          setMovies(data.results.slice(0, 5));
        }
      })
      .catch((err) => console.error("Erro ao buscar TMDB", err));
  }, []);

  useEffect(() => {
    if (movies.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % movies.length);
    }, 6000); // Troca a cada 6 segundos
    return () => clearInterval(interval);
  }, [movies]);

  if (movies.length === 0) return <div className="hero-slider-skeleton">Carregando Destaques...</div>;

  const currentMovie = movies[currentIndex];

  return (
    <div className="hero-slider">
      <div 
        className="hero-backdrop" 
        style={{ backgroundImage: `url(${IMAGE_BASE_URL}${currentMovie.backdrop_path})` }}
      />
      <div className="hero-overlay" />
      
      <div className="hero-content">
        <div className="hero-badge">EM ALTA</div>
        <h1 className="hero-title">{currentMovie.title}</h1>
        
        <div className="hero-meta">
          <span className="hero-rating">TMDB {currentMovie.vote_average.toFixed(1)}</span>
          <span className="hero-date">{currentMovie.release_date?.split('-')[0]}</span>
          <span className="hero-type">FILME</span>
        </div>

        <p className="hero-overview">
          {currentMovie.overview.length > 200 
            ? currentMovie.overview.substring(0, 200) + '...' 
            : currentMovie.overview}
        </p>

        <div className="hero-actions">
          <button 
            className="btn btn-primary" 
            onClick={() => onPlay(currentMovie.id, 'movie', currentMovie.title)}
          >
            ▶ Assistir
          </button>
        </div>
      </div>

      <div className="hero-dots">
        {movies.map((_, idx) => (
          <div 
            key={idx} 
            className={`hero-dot ${idx === currentIndex ? 'active' : ''}`}
            onClick={() => setCurrentIndex(idx)}
          />
        ))}
      </div>
    </div>
  );
}
