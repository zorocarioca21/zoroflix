import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Layers, Flame, Sparkles } from 'lucide-react';

export default function MangaDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [manga, setManga] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchDetails = async () => {
        try {
            const resManga = await fetch(`/api/mangas/${id}`);
            const dataManga = await resManga.json();
            if (dataManga.manga) {
                setManga(dataManga.manga);
                document.title = `${dataManga.manga.title} - Mangá CineGeek`;
            }

            const resCh = await fetch(`/api/mangas/${id}/chapters`);
            const dataCh = await resCh.json();
            if (dataCh.chapters) {
                setChapters(dataCh.chapters);

                // Pré-carregamento imediato do 1º capítulo para abertura instantânea ao clicar em "Começar a Ler"
                if (dataCh.chapters.length > 0) {
                    const firstChId = dataCh.chapters[0].id;
                    setTimeout(() => {
                        fetch(`/api/mangas/chapters/${firstChId}/pages`).catch(() => {});
                    }, 500);
                }
            }
        } catch (err) {
            console.error('Erro ao buscar detalhes da obra:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        window.scrollTo(0, 0);
        fetchDetails();
    }, [id]);

    // Agrupamento inteligente por número de capítulo
    // Se um capítulo tiver 2 ou mais scans, exibe 1 card único no índice
    const groupedChapters = [];
    const chapterMap = new Map();

    for (const ch of chapters) {
        const numKey = ch.chapter_number;
        if (!chapterMap.has(numKey)) {
            const groupItem = {
                chapter_number: ch.chapter_number,
                primaryChapter: ch,
                versions: [ch]
            };
            chapterMap.set(numKey, groupItem);
            groupedChapters.push(groupItem);
        } else {
            chapterMap.get(numKey).versions.push(ch);
        }
    }

    if (loading) {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="spinner" style={{
                        width: '45px',
                        height: '45px',
                        border: '3px solid rgba(255,255,255,0.1)',
                        borderTopColor: 'var(--primary)',
                        borderRadius: '50%',
                        margin: '0 auto 1.2rem auto',
                        animation: 'spin 0.9s linear infinite'
                    }}></div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Carregando detalhes da obra...</div>
                </div>
            </div>
        );
    }

    if (!manga) {
        return (
            <div className="catalog-container" style={{ padding: '80px 20px', textAlign: 'center' }}>
                <h2 style={{ color: 'var(--text)', marginBottom: '1rem' }}>Obra não encontrada</h2>
                <Link to="/mangas" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 'bold' }}>
                    &larr; Voltar para o Catálogo de Mangás
                </Link>
            </div>
        );
    }

    return (
        <div className="catalog-container" style={{ paddingBottom: '5rem' }}>
            {/* Botão Voltar */}
            <button 
                onClick={() => navigate('/mangas')} 
                style={{
                    background: 'rgba(0, 0, 0, 0.45)',
                    border: '1px solid rgba(0, 230, 118, 0.25)',
                    color: 'var(--text-muted)',
                    padding: '0.55rem 1.2rem',
                    borderRadius: '25px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '2rem',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.borderColor = 'var(--primary)';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 230, 118, 0.2)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.borderColor = 'rgba(0, 230, 118, 0.25)';
                    e.currentTarget.style.boxShadow = 'none';
                }}
            >
                <ArrowLeft size={16} /> Voltar para o Catálogo
            </button>

            {/* Banner e Informações Principais */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '2.5rem',
                background: 'radial-gradient(ellipse at top left, rgba(0, 230, 118, 0.12) 0%, rgba(9, 42, 28, 0.6) 60%, rgba(5, 25, 18, 0.95) 100%)',
                border: '1px solid rgba(0, 230, 118, 0.25)',
                borderRadius: '24px',
                padding: '2.2rem',
                marginBottom: '3rem',
                boxShadow: '0 12px 35px rgba(0, 0, 0, 0.45)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Poster da Obra */}
                <div style={{
                    borderRadius: '16px',
                    overflow: 'hidden',
                    maxWidth: '300px',
                    aspectRatio: '2 / 3',
                    background: '#051912',
                    boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
                    border: '1px solid rgba(0, 230, 118, 0.3)',
                    justifySelf: 'center'
                }}>
                    <img src={manga.cover_url} alt={manga.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                {/* Detalhes Textuais */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{
                                background: 'rgba(0, 230, 118, 0.15)',
                                color: 'var(--primary)',
                                border: '1px solid rgba(0, 230, 118, 0.35)',
                                fontSize: '0.72rem',
                                fontWeight: '900',
                                padding: '0.3rem 0.75rem',
                                borderRadius: '20px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px'
                            }}>
                                {(manga.type || 'manga').toUpperCase()}
                            </span>
                            <span style={{
                                background: 'rgba(0, 0, 0, 0.4)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                color: 'var(--text)',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                padding: '0.3rem 0.75rem',
                                borderRadius: '20px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                            }}>
                                <Layers size={13} color="var(--primary)" />
                                {chapters.length} {chapters.length === 1 ? 'Capítulo disponível' : 'Capítulos disponíveis'}
                            </span>
                        </div>
                    </div>

                    <h1 style={{
                        margin: '0 0 0.8rem 0',
                        fontSize: '2.4rem',
                        fontWeight: '900',
                        letterSpacing: '-0.5px',
                        color: 'var(--text)',
                        textShadow: '0 2px 8px rgba(0,0,0,0.4)'
                    }}>
                        {manga.title}
                    </h1>
                    
                    {manga.author && (
                        <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.92rem' }}>
                            Autor: <strong style={{ color: 'var(--text)' }}>{manga.author}</strong>
                        </p>
                    )}

                    <div style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '16px',
                        padding: '1.25rem',
                        color: 'var(--text-muted)',
                        fontSize: '0.94rem',
                        lineHeight: '1.65',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        marginBottom: '1.8rem'
                    }}>
                        {manga.synopsis || 'Sem sinopse disponível para esta obra.'}
                    </div>

                    {chapters.length > 0 && (
                        <div>
                            <Link 
                                to={`/manga/${manga.id}/capitulo/${chapters[0].id}`}
                                className="btn btn-primary"
                                style={{
                                    padding: '0.85rem 2rem',
                                    fontSize: '0.95rem',
                                    gap: '0.6rem'
                                }}
                            >
                                <BookOpen size={18} /> Começar a Ler (Cap. {chapters[0].chapter_number})
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {/* Lista de Capítulos */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h2 className="row-title" style={{ margin: 0, paddingLeft: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        Capítulos Disponíveis
                    </h2>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Ordem cronológica</span>
                </div>

                {groupedChapters.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '3.5rem',
                        background: 'rgba(9, 42, 28, 0.3)',
                        borderRadius: '16px',
                        border: '1px dashed rgba(0, 230, 118, 0.2)',
                        color: 'var(--text-muted)'
                    }}>
                        Nenhum capítulo foi adicionado ainda para esta obra.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.1rem' }}>
                        {groupedChapters.map(item => {
                            const ch = item.primaryChapter;
                            const hasMultiple = item.versions.length > 1;

                            return (
                                <div 
                                    key={ch.id}
                                    style={{
                                        background: 'rgba(9, 42, 28, 0.45)',
                                        border: '1px solid rgba(0, 230, 118, 0.18)',
                                        borderRadius: '14px',
                                        padding: '1.1rem 1.3rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        transition: 'all 0.25s cubic-bezier(0.2, 0, 0.2, 1)',
                                        gap: '1rem',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.transform = 'translateY(-3px)';
                                        e.currentTarget.style.borderColor = 'var(--primary)';
                                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 230, 118, 0.2)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.borderColor = 'rgba(0, 230, 118, 0.18)';
                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                                    }}
                                >
                                    <Link
                                        to={`/manga/${manga.id}/capitulo/${ch.id}`}
                                        onMouseEnter={() => {
                                            fetch(`/api/mangas/chapters/${ch.id}/pages`).catch(() => {});
                                        }}
                                        style={{
                                            textDecoration: 'none',
                                            color: 'inherit',
                                            flex: 1,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                                                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text)', fontWeight: '800' }}>
                                                    Capítulo {item.chapter_number}
                                                </h4>
                                                {hasMultiple ? (
                                                    <span style={{
                                                        fontSize: '0.68rem',
                                                        background: 'rgba(0, 230, 118, 0.2)',
                                                        color: 'var(--primary)',
                                                        padding: '0.15rem 0.5rem',
                                                        borderRadius: '6px',
                                                        fontWeight: '800',
                                                        border: '1px solid rgba(0, 230, 118, 0.35)'
                                                    }}>
                                                        {item.versions.length} scans disponíveis
                                                    </span>
                                                ) : ch.scan_group && ch.scan_group !== 'Padrão' ? (
                                                    <span style={{ fontSize: '0.68rem', background: 'rgba(0, 230, 118, 0.15)', color: 'var(--primary)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: '800' }}>
                                                        {ch.scan_group}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {ch.pages_count} {ch.pages_count === 1 ? 'página' : 'páginas'}
                                                {ch.title && ch.title !== `Capítulo ${item.chapter_number}` ? ` • ${ch.title}` : ''}
                                            </div>
                                        </div>
                                        <span style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: '800' }}>
                                            Ler &rarr;
                                        </span>
                                    </Link>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
