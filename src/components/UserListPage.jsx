import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSlug } from '../utils/slug';
import { X } from 'lucide-react';

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function UserListPage({ type = 'favorites' }) {
    const { uuid } = useAuth();
    const navigate = useNavigate();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const title = type === 'favorites' ? 'Meus Favoritos' : 'Assistidos Recentemente';
    const endpoint = type === 'favorites' ? '/api/favorites' : '/api/recents';

    useEffect(() => {
        if (!uuid) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const token = localStorage.getItem('cinegeek_token');
        const headers = { 'x-device-uuid': uuid || localStorage.getItem('cinegeek_uuid') };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        fetch(endpoint, { headers })
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                setItems(data);
                setLoading(false);
            })
            .catch(() => {
                setItems([]);
                setLoading(false);
            });
    }, [uuid, endpoint]);

    const handleDelete = async (e, contentId) => {
        e.stopPropagation();
        const token = localStorage.getItem('cinegeek_token');
        const headers = { 'x-device-uuid': uuid || localStorage.getItem('cinegeek_uuid') };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch(`${endpoint}/${contentId}`, {
                method: 'DELETE',
                headers
            });
            if (res.ok) {
                setItems(prev => prev.filter(item => item.content_id !== contentId));
            }
        } catch (err) {
            console.error('Erro ao deletar item:', err);
        }
    };

    const handleItemClick = (item) => {
        if (type === 'history' || type === 'recents') {
            if (item.media_type === 'canal') {
                navigate(`/canal/${item.content_id}`, { state: { title: item.title, poster_path: item.poster_path } });
            } else if (item.media_type === 'tv' && item.season && item.episode) {
                const cleanTitle = item.title.split(' - ')[0];
                const slug = getSlug(cleanTitle);
                navigate(`/serie/${slug}/${item.season}/${item.episode}/player`, {
                    state: { id: item.content_id, title: item.title, poster_path: item.poster_path }
                });
            } else if (item.media_type === 'movie') {
                const slug = getSlug(item.title);
                navigate(`/filme/${slug}/player`, { state: { id: item.content_id, title: item.title, poster_path: item.poster_path } });
            } else {
                navigate(`/${item.media_type === 'movie' ? 'filme' : 'serie'}/${getSlug(item.title)}`, { state: { id: item.content_id } });
            }
        } else {
            navigate(`/${item.media_type === 'movie' ? 'filme' : 'serie'}/${getSlug(item.title)}`, { state: { id: item.content_id } });
        }
    };

    return (
        <div className="catalog-container">
            <header className="catalog-header" style={{ marginBottom: '2rem' }}>
                <h1 className="row-title">{title}</h1>
            </header>

            {loading ? (
                <div className="details-loading">Carregando...</div>
            ) : items.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#ccc', marginTop: '2rem' }}>Nenhum item encontrado.</div>
            ) : (
                <div className="catalog-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '1rem',
                    padding: '0 1rem'
                }}>
                    {items.map(item => (
                        <div key={item.content_id} className="row-poster-card" onClick={() => handleItemClick(item)} style={{ position: 'relative', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#1a1a2e', aspectRatio: '2/3', display: 'flex', flexDirection: 'column' }}>
                            <button 
                                onClick={(e) => handleDelete(e, item.content_id)}
                                style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#ff3d00', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, boxShadow: '0 2px 4px rgba(0,0,0,0.4)', transition: 'all 0.2s ease' }}
                                title="Remover"
                            >
                                <X size={14} strokeWidth={2.5} />
                            </button>
                            {item.poster_path
                                ? (item.poster_path.startsWith('http') || item.poster_path === '/cinegeek-icon.png'
                                    ? <img src={item.poster_path} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '1rem', background: '#1a1a2e' }} />
                                    : <img src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  )
                                : <div style={{ background: '#1a1a2e', width: '100%', height: '100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', color:'#aaa', padding:'0.5rem', textAlign:'center' }}>{item.title}</div>
                            }
                            {item.season && item.episode && (
                                <span style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.8)', color: '#00e676', fontSize: '0.65rem', fontWeight: '700', borderRadius: '4px', padding: '2px 5px', letterSpacing: '0.05em' }}>
                                    S{String(item.season).padStart(2,'0')}E{String(item.episode).padStart(2,'0')}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
