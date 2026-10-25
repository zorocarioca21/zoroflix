import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Layers, CheckCircle, Clock, Sparkles, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function MangaDetailsPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
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

    const handleDeleteChapter = async (chapterId, capNum) => {
        if (!window.confirm(`Tem certeza que deseja apagar o Capítulo ${capNum}? Ele será removido do site e do canal do Telegram.`)) return;
        try {
            const token = localStorage.getItem('cinegeek_token');
            const res = await fetch(`/api/mangas/chapters/${chapterId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchDetails();
            } else {
                window.alert('Erro ao apagar capítulo');
            }
        } catch (e) {
            window.alert('Falha na comunicação');
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0e14', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#ff3366', borderRadius: '50%', margin: '0 auto 1rem auto', animation: 'spin 1s linear infinite' }}></div>
                    Carregando detalhes...
                </div>
            </div>
        );
    }

    if (!manga) {
        return (
            <div style={{ minHeight: '100vh', background: '#0a0e14', color: '#fff', padding: '120px 5%', textAlign: 'center' }}>
                <h2>Obra não encontrada</h2>
                <Link to="/mangas" style={{ color: '#ff3366', textDecoration: 'none', fontWeight: 'bold' }}>&larr; Voltar para Mangás</Link>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#0a0e14', color: '#fff', padding: '90px 5% 5rem 5%' }}>
            {/* Botão Voltar */}
            <button 
                onClick={() => navigate('/mangas')} 
                style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#cbd5e1',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '2rem',
                    fontSize: '0.85rem'
                }}
            >
                <ArrowLeft size={16} /> Voltar para o Catálogo
            </button>

            {/* Banner e Informações Principais */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '260px 1fr',
                gap: '2.5rem',
                background: 'rgba(21, 29, 38, 0.7)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px',
                padding: '2rem',
                marginBottom: '3rem'
            }}>
                <div style={{ borderRadius: '12px', overflow: 'hidden', height: '370px', background: '#111', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                    <img src={manga.cover_url} alt={manga.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                        <span style={{
                            background: '#ff3366',
                            color: '#fff',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '6px',
                            textTransform: 'uppercase'
                        }}>
                            {manga.type || 'Manga'}
                        </span>
                        <span style={{ color: '#00ff88', fontSize: '0.85rem', fontWeight: 'bold' }}>
                            {chapters.length} {chapters.length === 1 ? 'Capítulo disponível' : 'Capítulos disponíveis'}
                        </span>
                    </div>

                    <h1 style={{ margin: '0 0 0.8rem 0', fontSize: '2.2rem', fontWeight: '800' }}>{manga.title}</h1>
                    
                    {manga.author && (
                        <p style={{ margin: '0 0 1rem 0', color: '#94a3b8', fontSize: '0.9rem' }}>
                            Autor: <strong style={{ color: '#f1f5f9' }}>{manga.author}</strong>
                        </p>
                    )}

                    <div style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '12px',
                        padding: '1.2rem',
                        color: '#94a3b8',
                        fontSize: '0.92rem',
                        lineHeight: '1.6',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        marginBottom: '1.5rem'
                    }}>
                        {manga.synopsis || 'Sem sinopse disponível para esta obra.'}
                    </div>

                    {chapters.length > 0 && (
                        <div style={{ marginTop: 'auto' }}>
                            <Link 
                                to={`/manga/${manga.id}/capitulo/${chapters[0].id}`}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    background: '#ff3366',
                                    color: '#fff',
                                    textDecoration: 'none',
                                    padding: '0.8rem 1.8rem',
                                    borderRadius: '10px',
                                    fontWeight: '800',
                                    fontSize: '0.95rem',
                                    boxShadow: '0 4px 15px rgba(255,51,102,0.3)'
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
                    <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Layers size={22} color="#ff3366" />
                        Capítulos Disponíveis
                    </h2>
                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Ordem de leitura</span>
                </div>

                {chapters.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', color: '#64748b' }}>
                        Nenhum capítulo foi adicionado ainda para esta obra.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                        {chapters.map(ch => (
                            <div 
                                key={ch.id}
                                style={{
                                    background: 'rgba(21, 29, 38, 0.6)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: '12px',
                                    padding: '1rem 1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    transition: 'all 0.2s ease',
                                    gap: '1rem'
                                }}
                            >
                                <Link
                                    to={`/manga/${manga.id}/capitulo/${ch.id}`}
                                    onMouseEnter={e => {
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
                                        <h4 style={{ margin: '0 0 0.3rem 0', fontSize: '1rem', color: '#f8fafc' }}>
                                            Capítulo {ch.chapter_number}
                                        </h4>
                                        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                            {ch.pages_count} páginas • {(ch.file_size / 1024 / 1024).toFixed(1)} MB
                                        </div>
                                    </div>
                                    <span style={{ color: '#00ff88', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                        Ler &rarr;
                                    </span>
                                </Link>

                                {user?.role === 'admin' && (
                                    <button 
                                        onClick={() => handleDeleteChapter(ch.id, ch.chapter_number)}
                                        title="Apagar Capítulo (Banco e Telegram)"
                                        style={{
                                            background: 'rgba(255, 51, 102, 0.1)',
                                            border: '1px solid rgba(255, 51, 102, 0.3)',
                                            color: '#ff3366',
                                            padding: '0.5rem',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
