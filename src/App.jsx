import { useState, useEffect } from 'react'
import { Home as HomeIcon, Film, MonitorPlay, Sword, Heart, Radio, Calendar, Search, LogOut, User as UserIcon, LogIn, Tv } from 'lucide-react'
import { Routes, Route, useNavigate, Link, useLocation } from 'react-router-dom'

// Layout/Page Components
import HeroSlider from './components/HeroSlider'
import ContentRow from './components/ContentRow'
import SearchPage from './components/SearchPage'
import DetailsPage from './components/DetailsPage'
import PlayerPage from './components/PlayerPage'
import ChannelsPage from './components/ChannelsPage'
import CalendarPage from './components/CalendarPage'
import AntiAdBlock from './components/AntiAdBlock'
import CatalogPage from './components/CatalogPage'
import ApiDocsPage from './components/ApiDocsPage'

// Auth & User Components
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthModal from './components/AuthModal';
import UserProfile from './components/UserProfile';
import AdminPanel from './components/AdminPanel';
import WhatsappPopup from './components/WhatsappPopup';
import TvGuideModal from './components/TvGuideModal';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
export const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w200';

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, logout } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isTvGuideOpen, setIsTvGuideOpen] = useState(false);
  const [globalConfigs, setGlobalConfigs] = useState({});
  const [configsReady, setConfigsReady] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config/all')
      .then(r => r.json())
      .then(data => {
        setGlobalConfigs(data);
        setConfigsReady(true);
      });
  }, []);

  useEffect(() => {
    if (loading || !configsReady) return;
    if (!globalConfigs.ads_enabled || !globalConfigs.ads_socialbar) return;
    if (user?.role && user.role !== 'free') return; // Hide social bar for VIPs
    
    const scriptId = 'adsterra-social-bar';
    if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = "https://pl29672002.effectivecpmnetwork.com/8d/85/2f/8d852f7cb5b1fbe6a38a6e9cd915610d.js";
        script.async = true;
        document.body.appendChild(script);
    }
  }, [user, loading, globalConfigs, configsReady]);

  // Active Heartbeat System - Notifica o backend sobre a página atual a cada 15 segundos
  useEffect(() => {
    const sendHeartbeat = () => {
      const token = localStorage.getItem('cinegeek_token');
      fetch('/api/admin/heartbeat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        credentials: 'same-origin', // ESSENCIAL: Garante que os cookies sejam enviados!
        body: JSON.stringify({
          page: location.pathname,
          title: document.title
        })
      }).catch(err => console.log('Heartbeat failed:', err));
    };

    // Envia o primeiro logo que entra na rota
    sendHeartbeat();

    // Mantém o envio a cada 5s
    const interval = setInterval(sendHeartbeat, 5000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleTyping = async (query) => {
    setSearchQuery(query);
    if (!query) {
      setSearchResults([]);
      if (location.pathname === '/search') navigate('/');
      return;
    }
    try {
      const resp = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`);
      const data = await resp.json();
      setSearchResults(data.results?.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path).slice(0, 5) || []);
    } catch (e) { console.log(e); }
  }

  const handleFullSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    navigate('/search');
    try {
      const fetchOriginal = fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(searchQuery)}`).then(r => r.json());
      const [dataOrig] = await Promise.all([fetchOriginal]);
      setSearchResults(dataOrig.results?.filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && item.poster_path) || []);
    } catch (err) { console.error(err) } finally { setIsSearching(false) }
  }

  const handleKeyPress = (e) => { if (e.key === 'Enter') handleFullSearch(); }
  const handleSelectItem = (item) => {
    setSearchResults([]);
    setSearchQuery('');
    if (item.media_type === 'movie') navigate(`/filme/${item.id}`);
    else navigate(`/serie/${item.id}`);
  }

  return (
    <div className="app-container">
      {!location.pathname.includes('/player') && (
        <header className="main-header">
          <Link to="/" className="logo-brand" onClick={() => { setSearchQuery(''); setSearchResults([]); }}>
            <span className="logo-text-cine">CINE</span>
            <img src="/cinegeek-icon.png" alt="CineGeek Icon" className="logo-icon-img" />
            <span className="logo-text-geek">GEEK</span>
          </Link>
          
          <nav className="nav-pill">
            <Link to="/" className="nav-item"><span className="nav-icon"><HomeIcon size={20} /></span><span className="nav-label">Home</span></Link>
            <Link to="/filmes" className="nav-item"><span className="nav-icon"><Film size={20} /></span><span className="nav-label">Filmes</span></Link>
            <Link to="/series" className="nav-item"><span className="nav-icon"><MonitorPlay size={20} /></span><span className="nav-label">Séries</span></Link>
            <Link to="/animes" className="nav-item"><span className="nav-icon"><Sword size={20} /></span><span className="nav-label">Animes</span></Link>
            <Link to="/doramas" className="nav-item"><span className="nav-icon"><Heart size={20} /></span><span className="nav-label">Doramas</span></Link>
            <Link to="/canais" className="nav-item"><span className="nav-icon"><Radio size={20} /></span><span className="nav-label">Canais</span></Link>
            <button className="nav-item nav-item-btn" onClick={() => setIsTvGuideOpen(true)}><span className="nav-icon"><Tv size={20} /></span><span className="nav-label">Guia</span></button>
          </nav>

          <div className="header-right">
            <div className="header-search">
              <input type="text" className="navbar-search-input" placeholder="Pesquisar..." value={searchQuery} onChange={(e) => handleTyping(e.target.value)} onKeyDown={handleKeyPress}/>
              <button className="navbar-search-btn" onClick={handleFullSearch}>{isSearching ? '...' : <Search size={18} />}</button>
              {searchResults.length > 0 && searchQuery && (
                <div className="search-dropdown">
                  {searchResults.map((item) => (
                    <div className="dropdown-item" key={item.id} onClick={() => handleSelectItem(item)}>
                      <img src={`${IMAGE_BASE_URL}${item.poster_path}`} alt="" className="dropdown-poster" />
                      <div className="dropdown-info">
                        <div className="dropdown-title">{item.title || item.name}</div>
                        <div className="dropdown-type">{item.media_type === 'movie' ? '🎬 Filme' : '📺 Série'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="user-nav">
              {user ? (
                <div className="user-profile-wrap">
                  <img 
                    src={user.avatar} 
                    alt="Perfil" 
                    className="user-avatar" 
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    onError={(e) => { e.target.src = 'https://api.zorobot.shop/avatars/default.png?v=1' }}
                  />
                  {isUserMenuOpen && (
                    <div className="user-dropdown">
                      <div className="user-info-head">
                        <p className="user-nick">{user.nick}</p>
                        <p className="user-tag">{user.role?.toUpperCase() || 'FREE'}</p>
                      </div>
                      <Link to="/perfil" className="user-drop-item" onClick={() => setIsUserMenuOpen(false)}>
                        <UserIcon size={16} /> Meu Perfil
                      </Link>
                      <button className="user-drop-item logout" onClick={() => { logout(); setIsUserMenuOpen(false); }}>
                        <LogOut size={16} /> Sair
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button className="login-btn-header-circle" onClick={() => setIsAuthOpen(true)}>
                  <UserIcon size={24} />
                </button>
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
        <Route path="/filmes" element={<CatalogPage type="movie" title="Filmes" />} />
        <Route path="/series" element={<CatalogPage type="tv" title="Séries" />} />
        <Route path="/animes" element={<CatalogPage type="tv" title="Animes" initialGenreId="16" />} />
        <Route path="/doramas" element={<CatalogPage type="tv" title="Doramas" initialGenreId="18" initialLanguage="ko" />} />
        <Route path="/filme/:id" element={<DetailsPage />} />
        <Route path="/serie/:id" element={<DetailsPage />} />
        <Route path="/filme/:id/player" element={<PlayerPage />} />
        <Route path="/serie/:id/player" element={<PlayerPage />} />
        <Route path="/serie/:id/:season/:episode/player" element={<PlayerPage />} />
        <Route path="/canal/:canalId" element={<PlayerPage />} />
        <Route path="/perfil" element={<UserProfile />} />
        <Route path="/paineladm" element={<AdminPanel />} />
        <Route path="/api-docs" element={<ApiDocsPage />} />
      </Routes>
      {configsReady && globalConfigs.anti_adblock && <AntiAdBlock />}
      <WhatsappPopup />
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <TvGuideModal isOpen={isTvGuideOpen} onClose={() => setIsTvGuideOpen(false)} />
    </div>
  )
}

function Home({ onOpenDetails }) {
    const { uuid } = useAuth();
    const navigate = useNavigate();
    const [favorites, setFavorites] = useState([]);
    const [recents, setRecents] = useState([]);

    const fetchWithAuth = async (url) => {
        const token = localStorage.getItem('cinegeek_token');
        const headers = { 'x-device-uuid': uuid || localStorage.getItem('cinegeek_uuid') };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, { headers });
        if (res.ok) return res.json();
        return [];
    };

    useEffect(() => {
        if (!uuid) return;
        fetchWithAuth('/api/favorites').then(data => setFavorites(data)).catch(() => {});
        fetchWithAuth('/api/recents').then(data => setRecents(data)).catch(() => {});
    }, [uuid]);

    const handleRecentClick = (item) => {
        if (item.media_type === 'canal') {
            navigate('/canais');
        } else {
            onOpenDetails({ id: item.content_id, media_type: item.media_type });
        }
    };

    return (
        <>
          <HeroSlider onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
          <div className="rows-section" style={{ marginTop: '3rem' }}>
            {recents.length > 0 && (
                <div className="content-row-container">
                    <h2 className="row-title">Assistidos Recentemente</h2>
                    <div className="row-wrapper">
                        <div className="row-posters">
                            {recents.map(item => (
                                <div key={item.content_id} className="row-poster-card" onClick={() => handleRecentClick(item)} style={{ position: 'relative' }}>
                                    {item.poster_path
                                        ? <img src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} alt={item.title} className="row-poster-img" />
                                        : <div className="row-poster-img" style={{ background: '#1a1a2e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', color:'#aaa', padding:'0.5rem', textAlign:'center' }}>{item.title}</div>
                                    }
                                    {item.season && item.episode && (
                                        <span style={{
                                            position: 'absolute', bottom: '6px', left: '6px',
                                            background: 'rgba(0,0,0,0.8)', color: '#00e676',
                                            fontSize: '0.65rem', fontWeight: '700', borderRadius: '4px',
                                            padding: '2px 5px', letterSpacing: '0.05em'
                                        }}>
                                            S{String(item.season).padStart(2,'0')}E{String(item.episode).padStart(2,'0')}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {favorites.length > 0 && (
                <div className="content-row-container">
                    <h2 className="row-title">Meus Favoritos</h2>
                    <div className="row-wrapper">
                        <div className="row-posters">
                            {favorites.map(item => (
                                <div key={item.content_id} className="row-poster-card" onClick={() => onOpenDetails({id: item.content_id, media_type: item.media_type})}>
                                    <img src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} alt={item.title} className="row-poster-img" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            <ContentRow title="Filmes Lançamentos" endpoint="/movie/now_playing?page=1" type="movie" onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
            <ContentRow title="Séries em Alta" endpoint="/tv/popular?page=1" type="tv" onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
            <ContentRow title="Animes e Animações" endpoint="/discover/tv?with_genres=16&page=1" type="tv" onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
            <ContentRow title="Grandes Sucessos (Filmes)" endpoint="/movie/top_rated?page=1" type="movie" onPlay={(id, type) => onOpenDetails({id, media_type: type})} />
          </div>
        </>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}
