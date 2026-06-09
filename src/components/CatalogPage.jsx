import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

import { RatingCircle } from './Badges';
import HoverVideoCard from './HoverVideoCard';

export default function CatalogPage({ type, title, initialGenreId = '', initialLanguage = '' }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [genres, setGenres] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState(initialGenreId);
  const [sortBy, setSortBy] = useState('popularity.desc');
  const [query, setQuery] = useState('');

  // Carrega gêneros ao iniciar
  useEffect(() => {
    const genreType = type === 'movie' ? 'movie' : 'tv';
    fetch(`${BASE_URL}/genre/${genreType}/list?api_key=${API_KEY}&language=pt-BR`)
      .then(r => r.json())
      .then(data => {
        // Filtra gêneros populares/relevantes para os pills
        const relevantGenres = data.genres?.filter(g => 
          ['Ação', 'Comédia', 'Terror', 'Drama', 'Animação', 'Aventura', 'Documentário', 'Ficção científica'].includes(g.name)
        ) || [];
        setGenres(data.genres || []);
      });
  }, [type]);

  // Carrega itens quando filtros ou busca mudam
  useEffect(() => {
    setLoading(true);
    const mediaType = type === 'movie' ? 'movie' : 'tv';
    let url;

    if (query) {
      url = `${BASE_URL}/search/${mediaType}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}&page=${page}`;
    } else {
      url = `${BASE_URL}/discover/${mediaType}?api_key=${API_KEY}&language=pt-BR&sort_by=${sortBy}&page=${page}`;
      if (selectedGenre) url += `&with_genres=${selectedGenre}`;
      if (initialLanguage) url += `&with_original_language=${initialLanguage}`;
    }
    
    fetch(url)
      .then(r => r.json())
      .then(data => {
        let results = data.results || [];
        
        // FILTRAGEM ESTRITA DE CONTEXTO
        // Se estivermos em uma página específica (Animes, Doramas), filtramos a busca
        if (query) {
          if (initialGenreId) {
            results = results.filter(item => item.genre_ids?.includes(parseInt(initialGenreId)));
          }
          if (initialLanguage) {
            results = results.filter(item => item.original_language === initialLanguage);
          }
          // Se o usuário selecionou UM GÊNERO extra no seletor/pills durante a busca
          if (selectedGenre && selectedGenre !== initialGenreId) {
            results = results.filter(item => item.genre_ids?.includes(parseInt(selectedGenre)));
          }
        }

        if (page === 1) {
          setItems(results);
        } else {
          setItems(prev => [...prev, ...results]);
        }
        setLoading(false);
      });
  }, [type, selectedGenre, sortBy, page, query, initialLanguage, initialGenreId]);

  const handleFilterChange = (genreId) => {
    setSelectedGenre(genreId);
    setPage(1);
  };

  const handleSearchChange = (val) => {
    setQuery(val);
    setPage(1);
  };

  return (
    <div className="catalog-container">
      <header className="catalog-header">
        <h1 className="row-title">{title}</h1>
        
        <div className="filters-bar">
          <div className="filter-group search-local-group">
            <input 
              type="text" 
              className="local-search-input" 
              placeholder={`Pesquisar em ${title}...`}
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label>Gênero:</label>
            <select value={selectedGenre} onChange={(e) => handleFilterChange(e.target.value)}>
              <option value={initialGenreId}>Todos</option>
              {genres.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* CATEGORY PILLS */}
      <div className="category-pills-container">
        <button 
          className={`category-pill ${selectedGenre === initialGenreId ? 'active' : ''}`}
          onClick={() => handleFilterChange(initialGenreId)}
        >
          Todos
        </button>
        {genres.slice(0, 10).map(g => (
          <button 
            key={g.id} 
            className={`category-pill ${selectedGenre == g.id ? 'active' : ''}`}
            onClick={() => handleFilterChange(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>

      <div className="catalog-grid">
        {items.map(item => (
          <HoverVideoCard 
            key={item.id}
            id={item.id}
            type={type}
            title={item.title || item.name}
            poster={`${IMAGE_BASE_URL}${item.poster_path}`}
            onClick={() => navigate(`/${type === 'movie' ? 'filme' : 'serie'}/${item.id}`)}
            badges={<RatingCircle rating={item.vote_average} />}
          />
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
