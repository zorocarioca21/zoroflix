import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Sparkles, Filter, Search, Layers } from 'lucide-react';

export default function MangasPage() {
    const [mangas, setMangas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all'); // all, manga, manhwa, hq
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        document.title = 'Mangás e HQs - CineGeek';
        window.scrollTo(0, 0);

        const fetchMangas = async () => {
            try {
                const res = await fetch('/api/mangas');
                const data = await res.json();
                if (data.mangas) {
                    setMangas(data.mangas);
                }
            } catch (err) {
                console.error('Erro ao buscar catálogo de mangás:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchMangas();
    }, []);

    const filteredMangas = mangas.filter(m => {
        const matchesType = filterType === 'all' || m.type === filterType;
        const matchesSearch = !searchQuery || m.title.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    });

    return (
        <div style={{ minHeight: '100vh', background: '#0a0e14', color: '#fff', padding: '100px 5% 4rem 5%' }}>
            {/* Header Hero da Seção */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.15) 0%, rgba(13, 20, 30, 0.8) 100%)',
                border: '1px solid rgba(255, 51, 102, 0.2)',
                borderRadius: '18px',
                padding: '2.5rem 2rem',
                marginBottom: '2.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{ background: '#ff3366', padding: '0.6rem', borderRadius: '12px', display: 'flex', color: '#fff' }}>
                        <BookOpen size={28} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.5px' }}>
                            Mangás, Manhwas & HQs
                        </h1>
                        <p style={{ margin: '0.3rem 0 0 0', color: '#94a3b8', fontSize: '0.95rem' }}>
                            Explore e leia suas obras favoritas com a melhor experiência de leitura no CineGeek.
                        </p>
                    </div>
                </div>

                {/* Filtros e Barra de Pesquisa */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.4)', padding: '0.35rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <button 
                            onClick={() => setFilterType('all')}
                            style={{
                                background: filterType === 'all' ? '#ff3366' : 'transparent',
                                color: filterType === 'all' ? '#fff' : '#94a3b8',
                                border: 'none', padding: '0.45rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s'
                            }}
                        >
                            Todos
                        </button>
                        <button 
                            onClick={() => setFilterType('manga')}
                            style={{
                                background: filterType === 'manga' ? '#ff3366' : 'transparent',
                                color: filterType === 'manga' ? '#fff' : '#94a3b8',
                                border: 'none', padding: '0.45rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s'
                            }}
                        >
                            Mangás
                        </button>
                        <button 
                            onClick={() => setFilterType('webtoon')}
                            style={{
                                background: filterType === 'webtoon' ? '#ff3366' : 'transparent',
                                color: filterType === 'webtoon' ? '#fff' : '#94a3b8',
                                border: 'none', padding: '0.45rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s'
                            }}
                        >
                            Manhwas
                        </button>
                        <button 
                            onClick={() => setFilterType('hq')}
                            style={{
                                background: filterType === 'hq' ? '#ff3366' : 'transparent',
                                color: filterType === 'hq' ? '#fff' : '#94a3b8',
                                border: 'none', padding: '0.45rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', transition: 'all 0.2s'
                            }}
                        >
                            HQs & Comics
                        </button>
                    </div>

                    <div style={{ position: 'relative', minWidth: '260px' }}>
                        <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar título..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                background: 'rgba(0,0,0,0.5)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#fff',
                                padding: '0.55rem 1rem 0.55rem 2.4rem',
                                borderRadius: '10px',
                                outline: 'none',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Grid de Obras */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '5rem 0', color: '#64748b' }}>
                    <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#ff3366', borderRadius: '50%', margin: '0 auto 1rem auto', animation: 'spin 1s linear infinite' }}></div>
                    Carregando biblioteca de obras...
                </div>
            ) : filteredMangas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '5rem 0', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <BookOpen size={48} color="#475569" style={{ marginBottom: '1rem' }} />
                    <h3 style={{ margin: '0 0 0.5rem 0', color: '#cbd5e1' }}>Nenhuma obra encontrada</h3>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                        {searchQuery ? 'Tente buscar com outro termo.' : 'Novas obras serão adicionadas em breve!'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: '1.75rem' }}>
                    {filteredMangas.map(manga => (
                        <Link 
                            to={`/manga/${manga.id}`} 
                            key={manga.id}
                            style={{
                                textDecoration: 'none',
                                color: 'inherit',
                                background: 'rgba(21, 29, 38, 0.7)',
                                borderRadius: '14px',
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.06)',
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'all 0.25s ease',
                                cursor: 'pointer'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-6px)';
                                e.currentTarget.style.borderColor = 'rgba(255, 51, 102, 0.5)';
                                e.currentTarget.style.boxShadow = '0 12px 25px rgba(255, 51, 102, 0.15)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <div style={{ width: '100%', height: '260px', position: 'relative', overflow: 'hidden', background: '#111' }}>
                                {manga.cover_url ? (
                                    <img 
                                        src={manga.cover_url} 
                                        alt={manga.title} 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        loading="lazy"
                                    />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                                        <BookOpen size={36} />
                                    </div>
                                )}
                                <div style={{
                                    position: 'absolute',
                                    top: '10px',
                                    right: '10px',
                                    background: 'rgba(0,0,0,0.75)',
                                    backdropFilter: 'blur(4px)',
                                    color: '#ff3366',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '6px',
                                    fontSize: '0.7rem',
                                    fontWeight: '800',
                                    letterSpacing: '0.5px',
                                    border: '1px solid rgba(255, 51, 102, 0.3)'
                                }}>
                                    {(manga.type || 'manga').toUpperCase()}
                                </div>
                            </div>
                            <div style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <h3 style={{
                                    margin: '0 0 0.35rem 0',
                                    fontSize: '0.95rem',
                                    fontWeight: '700',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    color: '#f8fafc'
                                }}>
                                    {manga.title}
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.04)', fontSize: '0.75rem', color: '#64748b' }}>
                                    <span>{manga.status === 'completed' ? 'Concluído' : 'Em Lançamento'}</span>
                                    <span style={{ color: '#00ff88', fontWeight: 'bold' }}>Ler agora &rarr;</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
