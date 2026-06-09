import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function CatalogPage({ type, title, initialGenreId = '' }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState(initialGenreId);
  const [sortBy, setSortBy] = useState('popularity.desc');

  // Carrega gêneros ao iniciar
  useEffect(() => {
    const genreType = type === 'movie' ? 'movie' : 'tv';
    fetch(`${BASE_URL}/genre/${genreType}/list?api_key=${API_KEY}&language=pt-BR`)
      .then(r => r.json())
      .then(data => setGenres(data.genres || []));
  }, [type]);

  // Carrega itens quando filtros mudam
  useEffect(() => {
    setLoading(true);
    const mediaType = type === 'movie' ? 'movie' : 'tv';
    let url = `${BASE_URL}/discover/${mediaType}?api_key=${API_KEY}&language=pt-BR&sort_by=${sortBy}&page=${page}`;
    
    if (selectedGenre) {
      url += `&with_genres=${selectedGenre}`;
    }
    
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (page === 1) {
          setItems(data.results || []);
        } else {
          setItems(prev => [...prev, ...(data.results || [])]);
        }
        setLoading(false);
      });
  }, [type, selectedGenre, sortBy, page]);

  // Reset de página ao mudar filtro
  const handleFilterChange = (genreId) => {
    setSelectedGenre(genreId);
    setPage(1);
  };

  const handleSortChange = (sort) => {
    setSortBy(sort);
    setPage(1);
  };

  return (
    <div className="catalog-container" style={{ animation: 'fadeIn 0.5s ease' }}>
      <header className="catalog-header">
        <h1 className="row-title">{title}</h1>
        
        <div className="filters-bar">
          <div className="filter-group">
            <label>Gênero:</label>
            <select value={selectedGenre} onChange={(e) => handleFilterChange(e.target.value)}>
              <option value="">Todos</option>
              {genres.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Ordem:</label>
            <select value={sortBy} onChange={(e) => handleSortChange(e.target.value)}>
              <option value="popularity.desc">Mais Populares</option>
              <option value="vote_average.desc">Melhor Avaliados</option>
              <option value="first_air_date.desc">Lançamentos</option>
            </select>
          </div>
        </div>
      </header>

      <div className="search-grid">
        {items.map(item => (
          <div 
            key={item.id} 
            className="search-card" 
            onClick={() => navigate(`/${type === 'movie' ? 'filme' : 'serie'}/${item.id}`)}
          >
            <div className="search-card-img-wrapper">
              <img src={`${IMAGE_BASE_URL}${item.poster_path}`} alt={item.title || item.name} className="search-card-img" />
              <div className="search-card-overlay">
                <span className="row-play-icon">▶</span>
              </div>
            </div>
            <div className="search-card-info">
              <div className="search-card-title">{item.title || item.name}</div>
              <div className="search-card-type">
                TMDB {item.vote_average?.toFixed(1)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '3rem 0' }}>
          <button className="btn btn-primary" onClick={() => setPage(p => p + 1)}>
            CARREGAR MAIS
          </button>
        </div>
      )}

      {loading && <div className="details-loading">Carregando...</div>}
    </div>
  );
}
