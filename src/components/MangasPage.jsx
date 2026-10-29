import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Search, Layers, Compass, Flame } from 'lucide-react';

export default function MangasPage() {
    const [mangas, setMangas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('all'); // all, manga, manhwa, hq
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        document.title = 'Leitura - Mangás, Manhwas, HQs & Livros - CineGeek';
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
        <div className="catalog-container" style={{ paddingBottom: '4rem' }}>
            {/* Header Hero Integrado no Design System CineGeek */}
            <div style={{
                position: 'relative',
                borderRadius: '20px',
                padding: '2.5rem 2rem',
                marginBottom: '2.5rem',
                background: 'radial-gradient(ellipse at top left, rgba(0, 230, 118, 0.15) 0%, rgba(9, 42, 28, 0.6) 60%, rgba(5, 25, 18, 0.95) 100%)',
                border: '1px solid rgba(0, 230, 118, 0.25)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(12px)',
                overflow: 'hidden'
            }}>
                {/* Elemento de iluminação decorativo CineGeek */}
                <div style={{
                    position: 'absolute',
                    top: '-60px',
                    right: '-60px',
                    width: '260px',
                    height: '260px',
                    background: 'radial-gradient(circle, rgba(0, 230, 118, 0.2) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                    pointerEvents: 'none'
                }}></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', marginBottom: '1.5rem', position: 'relative', zIndex: 1 }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #00e676, #00b35c)',
                        padding: '1rem',
                        borderRadius: '16px',
                        display: 'flex',
                        color: '#051912',
                        boxShadow: '0 0 25px rgba(0, 230, 118, 0.45)',
                        flexShrink: 0
                    }}>
                        <BookOpen size={32} strokeWidth={2.5} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
                            <span style={{
                                background: 'rgba(0, 230, 118, 0.15)',
                                color: 'var(--primary)',
                                border: '1px solid rgba(0, 230, 118, 0.3)',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '20px',
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                letterSpacing: '1px',
                                textTransform: 'uppercase',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem'
                            }}>
                                <Flame size={12} /> CINEGEEK LEITOR
                            </span>
                        </div>
                        <h1 style={{
                            margin: 0,
                            fontSize: '2.4rem',
                            fontWeight: '900',
                            letterSpacing: '-0.5px',
                            color: 'var(--text)',
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                        }}>
                            Mangás, Manhwas, HQs & Livros
                        </h1>
                        <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                            Explore o catálogo completo de leitura com carregamento ultra rápido no CineGeek.
                        </p>
                    </div>
                </div>

                {/* Filtros em Pílulas e Campo de Busca */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    flexWrap: 'wrap',
                    paddingTop: '1.2rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    position: 'relative',
                    zIndex: 1
                }}>
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        background: 'rgba(0, 0, 0, 0.45)',
                        padding: '0.35rem',
                        borderRadius: '30px',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}>
                        {[
                            { id: 'all', label: 'Todos' },
                            { id: 'manga', label: 'Mangás' },
                            { id: 'webtoon', label: 'Manhwas' },
                            { id: 'hq', label: 'HQs & Comics' }
                        ].map(tab => {
                            const active = filterType === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setFilterType(tab.id)}
                                    style={{
                                        background: active ? 'var(--primary)' : 'transparent',
                                        color: active ? '#051912' : 'var(--text-muted)',
                                        border: 'none',
                                        padding: '0.5rem 1.25rem',
                                        borderRadius: '25px',
                                        cursor: 'pointer',
                                        fontWeight: active ? '800' : '600',
                                        fontSize: '0.85rem',
                                        boxShadow: active ? 'var(--glow)' : 'none',
                                        transition: 'all 0.25s ease'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ position: 'relative', minWidth: '280px', flex: '1', maxWidth: '380px' }}>
                        <Search size={17} color="var(--primary)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', opacity: 0.8 }} />
                        <input
                            type="text"
                            placeholder="Buscar obra pelo título..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="local-search-input"
                            style={{
                                width: '100%',
                                paddingLeft: '2.8rem'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Grid de Obras */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '6rem 0', color: 'var(--text-muted)' }}>
                    <div className="spinner" style={{
                        width: '45px',
                        height: '45px',
                        border: '3px solid rgba(255,255,255,0.1)',
                        borderTopColor: 'var(--primary)',
                        borderRadius: '50%',
                        margin: '0 auto 1.2rem auto',
                        animation: 'spin 0.9s linear infinite'
                    }}></div>
                    <div style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--text)' }}>Carregando catálogo de mangás...</div>
                </div>
            ) : filteredMangas.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    padding: '5rem 2rem',
                    background: 'rgba(9, 42, 28, 0.3)',
                    borderRadius: '20px',
                    border: '1px dashed rgba(0, 230, 118, 0.2)',
                    maxWidth: '560px',
                    margin: '2rem auto'
                }}>
                    <div style={{
                        width: '70px',
                        height: '70px',
                        borderRadius: '50%',
                        background: 'rgba(0, 230, 118, 0.1)',
                        border: '1px solid rgba(0, 230, 118, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem auto'
                    }}>
                        <Compass size={36} color="var(--primary)" />
                    </div>
                    <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text)', fontSize: '1.3rem', fontWeight: '800' }}>
                        Nenhuma obra encontrada
                    </h3>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: '1.5' }}>
                        {searchQuery ? `Não encontramos obras correspondentes a "${searchQuery}".` : 'Novas obras serão adicionadas em breve!'}
                    </p>
                </div>
            ) : (
                <div className="catalog-grid" style={{
                    gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                    gap: '24px'
                }}>
                    {filteredMangas.map(manga => (
                        <Link
                            to={`/manga/${manga.id}`}
                            key={manga.id}
                            style={{
                                textDecoration: 'none',
                                color: 'inherit',
                                background: 'rgba(9, 42, 28, 0.55)',
                                borderRadius: '16px',
                                overflow: 'hidden',
                                border: '1px solid rgba(0, 230, 118, 0.18)',
                                display: 'flex',
                                flexDirection: 'column',
                                transition: 'all 0.3s cubic-bezier(0.2, 0, 0.2, 1)',
                                cursor: 'pointer',
                                position: 'relative',
                                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                                e.currentTarget.style.borderColor = 'var(--primary)';
                                e.currentTarget.style.boxShadow = '0 16px 30px rgba(0, 230, 118, 0.25), 0 0 15px rgba(0, 230, 118, 0.2)';
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                e.currentTarget.style.borderColor = 'rgba(0, 230, 118, 0.18)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
                            }}
                        >
                            {/* Poster / Capa com Proporção Cinematográfica 2:3 */}
                            <div style={{
                                width: '100%',
                                aspectRatio: '2 / 3',
                                position: 'relative',
                                overflow: 'hidden',
                                background: '#051912'
                            }}>
                                {manga.cover_url ? (
                                    <img
                                        src={manga.cover_url}
                                        alt={manga.title}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            transition: 'transform 0.4s ease'
                                        }}
                                        loading="lazy"
                                    />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                                        <BookOpen size={40} />
                                    </div>
                                )}

                                {/* Gradiente inferior para legibilidade suave */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: '50%',
                                    background: 'linear-gradient(to top, rgba(5, 25, 18, 0.95) 0%, transparent 100%)',
                                    pointerEvents: 'none'
                                }}></div>

                                {/* Badge de Categoria/Tipo */}
                                <div style={{
                                    position: 'absolute',
                                    top: '10px',
                                    right: '10px',
                                    background: 'rgba(5, 25, 18, 0.85)',
                                    backdropFilter: 'blur(6px)',
                                    color: 'var(--primary)',
                                    padding: '0.25rem 0.6rem',
                                    borderRadius: '8px',
                                    fontSize: '0.68rem',
                                    fontWeight: '900',
                                    letterSpacing: '0.5px',
                                    border: '1px solid rgba(0, 230, 118, 0.35)',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
                                }}>
                                    {(manga.type || 'manga').toUpperCase()}
                                </div>

                                {/* Badge de Contagem de Capítulos */}
                                {manga.chapters_count !== undefined && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '10px',
                                        left: '10px',
                                        background: 'rgba(5, 25, 18, 0.9)',
                                        backdropFilter: 'blur(6px)',
                                        color: '#fff',
                                        padding: '0.25rem 0.6rem',
                                        borderRadius: '8px',
                                        fontSize: '0.72rem',
                                        fontWeight: '800',
                                        border: '1px solid rgba(0, 230, 118, 0.3)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.35rem',
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
                                    }}>
                                        <Layers size={13} color="var(--primary)" />
                                        <span>{manga.chapters_count} {manga.chapters_count === 1 ? 'Capítulo' : 'Capítulos'}</span>
                                    </div>
                                )}
                            </div>

                            {/* Informações da Obra */}
                            <div style={{
                                padding: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                background: 'linear-gradient(180deg, rgba(9, 42, 28, 0.6) 0%, rgba(5, 25, 18, 0.95) 100%)'
                            }}>
                                <h3 style={{
                                    margin: '0 0 0.4rem 0',
                                    fontSize: '0.98rem',
                                    fontWeight: '800',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    color: 'var(--text)',
                                    letterSpacing: '-0.2px'
                                }} title={manga.title}>
                                    {manga.title}
                                </h3>

                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginTop: 'auto',
                                    paddingTop: '0.65rem',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                                    fontSize: '0.78rem'
                                }}>
                                    <span style={{ color: 'var(--text-muted)' }}>
                                        {manga.status === 'completed' ? 'Concluído' : 'Em Lançamento'}
                                    </span>
                                    <span style={{
                                        color: 'var(--primary)',
                                        fontWeight: '800',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px'
                                    }}>
                                        Ler &rarr;
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
