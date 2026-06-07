import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, Link, useLocation } from 'react-router-dom'
import HeroSlider from './components/HeroSlider'
import ContentRow from './components/ContentRow'
import SearchPage from './components/SearchPage'
import DetailsPage from './components/DetailsPage'
import PlayerPage from './components/PlayerPage'
import ChannelsPage from './components/ChannelsPage'
import CalendarPage from './components/CalendarPage'

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
export const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w200';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)

  const handleTyping = async (query) => {
    setSearchQuery(query);
    if (!query) {
      setSearchResults([]);
      return;
    }
    
    try {
      const resp = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`);
      const data = await resp.json();
      const filtered = data.results?.filter(item => 
        (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
      ).slice(0, 5) || [];
      setSearchResults(filtered);
    } catch (e) {
      console.log(e);
    }
  }

  const handleFullSearch = async () => {
    if (!searchQuery) return;
    
    setIsSearching(true)
    navigate('/search');
    try {
      const fetchOriginal = fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(searchQuery)}`).then(r => r.json());
      
      let fetchTranslated = Promise.resolve({ results: [] });
      try {
        const translateResp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(searchQuery)}&langpair=pt|en`);
        const translateData = await translateResp.json();
        const translatedQuery = translateData.responseData?.translatedText;
        
        if (translatedQuery && translatedQuery.toLowerCase() !== searchQuery.toLowerCase()) {
          fetchTranslated = fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(translatedQuery)}`).then(r => r.json());
        }
      } catch (e) {
        console.log("Falha na tradução", e);
      }

      const [dataOrig, dataTrans] = await Promise.all([fetchOriginal, fetchTranslated]);

      const allResults = [...(dataOrig.results || []), ...(dataTrans.results || [])];
      const uniqueResults = [];
      const map = new Map();
      
      for (const item of allResults) {
        if (!map.has(item.id)) {
          map.set(item.id, true);
          uniqueResults.push(item);
        }
      }
      
      const filtered = uniqueResults.filter(item => 
        (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path
      );
      
      setSearchResults(filtered)
    } catch (err) {
      console.error("Erro na busca geral", err)
    } finally {
      setIsSearching(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleFullSearch();
    }
  }

  const handleSelectItem = (item) => {
    setSearchResults([]);
    setSearchQuery('');
    if (item.media_type === 'movie') {
        navigate(`/filme/${item.id}`);
    } else {
        navigate(`/serie/${item.id}`);
    }
  }

  return (
    <div className="app-container">
      {!location.pathname.includes('/player') && (
        <header className="main-header">
          <Link to="/" className="logo" onClick={() => { setSearchQuery(''); setSearchResults([]); }}>
            Zoro<span>flix</span>
          </Link>
          
          <div className="header-right">
            <div className="nav-buttons">
              <Link to="/lancamentos" className="btn-nav btn-lancamentos">
                📅 Lançamentos
              </Link>

              <Link to="/canais" className="btn-nav btn-live-nav">
                <div className="live-dot"></div>
                AO VIVO
              </Link>
            </div>

            <div className="header-search">
              <input 
                type="text" 
                className="navbar-search-input" 
                placeholder="Pesquisar..."
                value={searchQuery}
                onChange={(e) => handleTyping(e.target.value)}
                onKeyDown={handleKeyPress}
              />
              <button className="navbar-search-btn" onClick={handleFullSearch}>
                {isSearching ? '...' : 'Buscar'}
              </button>

              {searchResults.length > 0 && searchQuery && (
                <div className="search-dropdown">
                  {searchResults.map((item) => (
                    <div className="dropdown-item" key={item.id} onClick={() => handleSelectItem(item)}>
                      <img 
                        src={`${IMAGE_BASE_URL}${item.poster_path}`} 
                        alt={item.title || item.name} 
                        className="dropdown-poster"
                        loading="lazy"
                      />
                      <div className="dropdown-info">
                        <div className="dropdown-title">{item.title || item.name}</div>
                        <div className="dropdown-type">{item.media_type === 'movie' ? '🎬 Filme' : '📺 Série'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      <Routes>
        <Route path="/" element={<Home onOpenDetails={handleSelectItem} />} />
        <Route path="/search" element={<SearchPage results={searchResults} />} />
        <Route path="/canais" element={<ChannelsPage />} />
        <Route path="/lancamentos" element={<CalendarPage />} />
        <Route path="/filme/:id" element={<DetailsPage />} />
        <Route path="/serie/:id" element={<DetailsPage />} />
        <Route path="/filme/:id/player" element={<PlayerPage />} />
        <Route path="/serie/:id/player" element={<PlayerPage />} />
        <Route path="/serie/:id/:season/:episode/player" element={<PlayerPage />} />
        <Route path="/canal/:canalId" element={<PlayerPage />} />
      </Routes>
    </div>
  )
}

function Home({ onOpenDetails }) {
    return (
        <>
          <HeroSlider onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
          <div className="rows-section" style={{ marginTop: '3rem' }}>
            <ContentRow title="Filmes Lançamentos" endpoint="/movie/now_playing?page=1" type="movie" onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
            <ContentRow title="Séries em Alta" endpoint="/tv/popular?page=1" type="tv" onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
            <ContentRow title="Animes e Animações" endpoint="/discover/tv?with_genres=16&page=1" type="tv" onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
            <ContentRow title="Grandes Sucessos (Filmes)" endpoint="/movie/top_rated?page=1" type="movie" onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
          </div>
        </>
    );
}

export default App
