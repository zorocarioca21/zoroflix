import { useState, useEffect } from 'react'
import { Home as HomeIcon, Film, MonitorPlay, Sword, Heart, Sparkles, Radio, Calendar, Search, LogOut, User as UserIcon, LogIn, Tv, X, Download, ShieldCheck } from 'lucide-react'
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
import UserListPage from './components/UserListPage'

// Auth & User Components
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthModal from './components/AuthModal';
import UserProfile from './components/UserProfile';
import AdminPanel from './components/AdminPanel';
import WhatsappPopup from './components/WhatsappPopup';
import TvGuideModal from './components/TvGuideModal';
import { getSlug } from './utils/slug';

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
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = () => {
    const isIos = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };

    if (isIos()) {
      setShowIOSPrompt(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      });
    } else {
        // Fallback for Android if prompt isn't ready or it's a normal PC browser
        alert("Para instalar, procure a opção 'Instalar Aplicativo' no menu do seu navegador.");
    }
  };

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
    const title = item.title || item.name;
    const slug = getSlug(title);
    if (item.media_type === 'movie') {
        navigate(`/filme/${slug}`, { state: { id: item.id } });
    } else {
        navigate(`/serie/${slug}`, { state: { id: item.id } });
    }
  }

  return (
    <div className="app-container">
      {showIOSPrompt && (
        <div className="ios-prompt-overlay" onClick={() => setShowIOSPrompt(false)}>
          <div className="ios-prompt-modal" onClick={e => e.stopPropagation()}>
            <button className="ios-prompt-close" onClick={() => setShowIOSPrompt(false)}><X size={20} /></button>
            <h3>Instalar no iPhone</h3>
            <p>1. Toque no ícone de <strong>Compartilhar</strong> (o quadrado com uma seta para cima) na barra inferior do Safari.</p>
            <p>2. Role a lista de ações e selecione <strong>Adicionar à Tela de Início ➕</strong>.</p>
            <p>3. Pronto! O CineGeek será instalado como um aplicativo.</p>
          </div>
        </div>
      )}
      <header className="main-header">
        <div className="logo-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
          <Link to="/" className="logo-brand" onClick={() => { setSearchQuery(''); setSearchResults([]); }}>
            <span className="logo-text-cine">CINE</span>
            <img src="/cinegeek-icon.png" alt="CineGeek Icon" className="logo-icon-img" />
            <span className="logo-text-geek">GEEK</span>
          </Link>
          {location.pathname === '/' && (
            <button className="install-app-btn-header" onClick={handleInstallClick} style={{ padding: '0.3rem 0.8rem', fontSize: '0.75rem', gap: '0.3rem' }}>
              <Download size={14} /> Baixar App
            </button>
          )}
        </div>
        
        <nav className="nav-pill">
          <Link to="/" className="nav-item"><span className="nav-icon"><HomeIcon size={20} /></span><span className="nav-label">Home</span></Link>
          <Link to="/filmes" className="nav-item"><span className="nav-icon"><Film size={20} /></span><span className="nav-label">Filmes</span></Link>
          <Link to="/series" className="nav-item"><span className="nav-icon"><MonitorPlay size={20} /></span><span className="nav-label">Séries</span></Link>
          <Link to="/animes" className="nav-item"><span className="nav-icon"><Sword size={20} /></span><span className="nav-label">Animes</span></Link>
          <Link to="/doramas" className="nav-item"><span className="nav-icon"><Sparkles size={20} /></span><span className="nav-label">Doramas</span></Link>
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
                  src={user.avatar && !user.avatar.includes('zorobot.shop') ? user.avatar : '/default-avatar.svg'} 
                  alt="Perfil" 
                  className="user-avatar" 
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  onError={(e) => { e.target.onerror = null; e.target.src = '/default-avatar.svg'; }}
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
                    {user.role === 'admin' && (
                        <Link to="/paineladm" className="user-drop-item" onClick={() => setIsUserMenuOpen(false)} style={{ color: 'var(--primary)' }}>
                          <ShieldCheck size={16} /> Painel ADM
                        </Link>
                    )}
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

      <Routes>
        <Route path="/" element={<Home onOpenDetails={handleSelectItem} />} />
        <Route path="/search" element={<SearchPage results={searchResults} />} />
        <Route path="/canais" element={<ChannelsPage />} />
        <Route path="/lancamentos" element={<CalendarPage />} />
        <Route path="/filmes" element={<CatalogPage type="movie" title="Filmes" />} />
        <Route path="/series" element={<CatalogPage type="tv" title="Séries" />} />
        <Route path="/animes" element={<CatalogPage type="tv" title="Animes" initialGenreId="16" />} />
        <Route path="/doramas" element={<CatalogPage type="tv" title="Doramas" initialGenreId="18" initialLanguage="ko" />} />
        <Route path="/historico" element={<UserListPage type="history" />} />
        <Route path="/favoritos" element={<UserListPage type="favorites" />} />
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

    const handleDeleteRecent = async (e, contentId) => {
        e.stopPropagation(); // Evita navegar ao clicar no botão
        const token = localStorage.getItem('cinegeek_token');
        const headers = { 'x-device-uuid': uuid || localStorage.getItem('cinegeek_uuid') };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch(`/api/recents/${contentId}`, {
                method: 'DELETE',
                headers
            });
            if (res.ok) {
                setRecents(prev => prev.filter(item => item.content_id !== contentId));
            }
        } catch (err) {
            console.error('Erro ao deletar item do histórico:', err);
        }
    };

    const handleDeleteFavorite = async (e, contentId) => {
        e.stopPropagation(); // Evita navegar ao clicar no botão
        const token = localStorage.getItem('cinegeek_token');
        const headers = { 'x-device-uuid': uuid || localStorage.getItem('cinegeek_uuid') };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch(`/api/favorites/${contentId}`, {
                method: 'DELETE',
                headers
            });
            if (res.ok) {
                setFavorites(prev => prev.filter(item => item.content_id !== contentId));
            }
        } catch (err) {
            console.error('Erro ao deletar item dos favoritos:', err);
        }
    };

    const handleRecentClick = (item) => {
        if (item.media_type === 'canal') {
            navigate(`/canal/${item.content_id}`, {
                state: { title: item.title, poster_path: item.poster_path }
            });
        } else if (item.media_type === 'tv' && item.season && item.episode) {
            const cleanTitle = item.title.split(' - ')[0];
            const slug = getSlug(cleanTitle);
            navigate(`/serie/${slug}/${item.season}/${item.episode}/player`, {
                state: { id: item.content_id, title: item.title, poster_path: item.poster_path }
            });
        } else if (item.media_type === 'movie') {
            const slug = getSlug(item.title);
            navigate(`/filme/${slug}/player`, {
                state: { id: item.content_id, title: item.title, poster_path: item.poster_path }
            });
        } else {
            // Fallback: abre detalhes
            onOpenDetails({ id: item.content_id, title: item.title, media_type: item.media_type });
        }
    };

    return (
        <>
          <HeroSlider onPlay={(id, type, title) => onOpenDetails({id, media_type: type, title})} />
          <div className="rows-section" style={{ marginTop: '3rem' }}>
            {recents.length > 0 && (
                <div className="content-row-container">
                    <div className="row-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h2 className="row-title" style={{ margin: 0 }}>Assistidos Recentemente</h2>
                        <Link to="/historico" className="see-more-btn">
                            Ver mais &rarr;
                        </Link>
                    </div>
                    <div className="row-wrapper">
                        <div className="row-posters">
                            {recents.slice(0, 10).map(item => (
                                <div key={item.content_id} className="row-poster-card" onClick={() => handleRecentClick(item)} style={{ position: 'relative' }}>
                                    {/* Botão de Excluir */}
                                    <button 
                                        onClick={(e) => handleDeleteRecent(e, item.content_id)}
                                        style={{
                                            position: 'absolute',
                                            top: '6px',
                                            right: '6px',
                                            background: 'rgba(0,0,0,0.6)',
                                            border: 'none',
                                            color: '#ff3d00',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            zIndex: 10,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                                            transition: 'all 0.2s ease'
                                        }}
                                        className="delete-recent-btn"
                                        title="Remover do Histórico"
                                    >
                                        <X size={14} strokeWidth={2.5} />
                                    </button>

                                    {item.poster_path
                                        ? (item.poster_path.startsWith('http') || item.poster_path === '/cinegeek-icon.png'
                                            ? <img src={item.poster_path} alt={item.title} className="row-poster-img" style={{ objectFit: 'contain', padding: '1rem', background: '#1a1a2e' }} />
                                            : <img src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} alt={item.title} className="row-poster-img" />
                                          )
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
                    <div className="row-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h2 className="row-title" style={{ margin: 0 }}>Meus Favoritos</h2>
                        <Link to="/favoritos" className="see-more-btn">
                            Ver mais &rarr;
                        </Link>
                    </div>
                    <div className="row-wrapper">
                        <div className="row-posters">
                            {favorites.slice(0, 10).map(item => (
                                <div key={item.content_id} className="row-poster-card" onClick={() => onOpenDetails({id: item.content_id, title: item.title, media_type: item.media_type})} style={{ position: 'relative' }}>
                                    {/* Botão de Excluir Favorito */}
                                    <button 
                                        onClick={(e) => handleDeleteFavorite(e, item.content_id)}
                                        style={{
                                            position: 'absolute',
                                            top: '6px',
                                            right: '6px',
                                            background: 'rgba(0,0,0,0.6)',
                                            border: 'none',
                                            color: '#ff3d00',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            zIndex: 10,
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                                            transition: 'all 0.2s ease'
                                        }}
                                        className="delete-recent-btn"
                                        title="Remover dos Favoritos"
                                    >
                                        <X size={14} strokeWidth={2.5} />
                                    </button>

                                    <img src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} alt={item.title} className="row-poster-img" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            <ContentRow title="Filmes Lançamentos" endpoint="/movie/now_playing?page=1" type="movie" onPlay={(id, type, title) => onOpenDetails({id, media_type: type, title})} limit={10} seeMoreLink="/lancamentos" />
            <ContentRow title="Séries em Alta" endpoint="/tv/popular?page=1" type="tv" onPlay={(id, type, title) => onOpenDetails({id, media_type: type, title})} limit={10} seeMoreLink="/series" />
            <ContentRow title="Animes e Animações" endpoint="/discover/tv?with_genres=16&page=1" type="tv" onPlay={(id, type, title) => onOpenDetails({id, media_type: type, title})} limit={10} seeMoreLink="/animes" />
            <ContentRow title="Grandes Sucessos (Filmes)" endpoint="/movie/top_rated?page=1" type="movie" onPlay={(id, type, title) => onOpenDetails({id, media_type: type, title})} limit={10} seeMoreLink="/filmes" />
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
