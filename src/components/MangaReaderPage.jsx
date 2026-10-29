import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Layers, Maximize, Minimize, Settings, Home } from 'lucide-react';

export default function MangaReaderPage() {
    const { mangaId, chapterId } = useParams();
    const navigate = useNavigate();

    const [chapterData, setChapterData] = useState(null);
    const [allChapters, setAllChapters] = useState([]);
    const [mangaTitle, setMangaTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [readMode, setReadMode] = useState('cascade'); // 'cascade' (webtoon) ou 'single' (pagina por pagina)
    const [currentPageIndex, setCurrentPageIndex] = useState(0);

    // Carrega capítulos da obra e dados das páginas
    useEffect(() => {
        window.scrollTo(0, 0);
        setLoading(true);

        const fetchChapter = async () => {
            try {
                // Pega info do mangá
                const resManga = await fetch(`/api/mangas/${mangaId}`);
                const dataManga = await resManga.json();
                if (dataManga.manga) {
                    setMangaTitle(dataManga.manga.title);
                }

                // Pega lista de todos os capítulos para navegação anterior/próximo
                const resList = await fetch(`/api/mangas/${mangaId}/chapters`);
                const dataList = await resList.json();
                if (dataList.chapters) {
                    setAllChapters(dataList.chapters);
                }

                // Pega páginas do capítulo atual
                const resPages = await fetch(`/api/mangas/chapters/${chapterId}/pages`);
                const dataPages = await resPages.json();
                if (dataPages.pages) {
                    setChapterData(dataPages);
                    document.title = `Cap. ${dataPages.chapter_number} - ${dataManga.manga?.title || 'Mangá'} - CineGeek`;

                    // Prefetch inteligente dos próximos 3 capítulos em segundo plano de forma escalonada
                    if (dataList?.chapters) {
                        const currentIdx = dataList.chapters.findIndex(c => String(c.id) === String(chapterId));
                        if (currentIdx >= 0) {
                            const nextChapters = dataList.chapters.slice(currentIdx + 1, currentIdx + 4);
                            nextChapters.forEach((ch, i) => {
                                setTimeout(() => {
                                    fetch(`/api/mangas/chapters/${ch.id}/pages`).catch(() => {});
                                }, (i + 1) * 2500); // Dispara em 2.5s, 5s e 7.5s suavemente
                            });
                        }
                    }
                }
            } catch (err) {
                console.error('Erro ao carregar leitor de mangá:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchChapter();
    }, [mangaId, chapterId]);

    // Navegação por teclado no modo single
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (readMode === 'single' && chapterData?.pages) {
                if (e.key === 'ArrowRight' || e.key === 'd') {
                    handleNextPage();
                } else if (e.key === 'ArrowLeft' || e.key === 'a') {
                    handlePrevPage();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [readMode, currentPageIndex, chapterData]);

    const currentIndexInList = allChapters.findIndex(c => String(c.id) === String(chapterId));
    const prevChapter = currentIndexInList > 0 ? allChapters[currentIndexInList - 1] : null;
    const nextChapter = currentIndexInList >= 0 && currentIndexInList < allChapters.length - 1 ? allChapters[currentIndexInList + 1] : null;

    const handleNextPage = () => {
        if (!chapterData?.pages) return;
        if (currentPageIndex < chapterData.pages.length - 1) {
            setCurrentPageIndex(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (nextChapter) {
            navigate(`/manga/${mangaId}/capitulo/${nextChapter.id}`);
            setCurrentPageIndex(0);
        }
    };

    const handlePrevPage = () => {
        if (currentPageIndex > 0) {
            setCurrentPageIndex(prev => prev - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (prevChapter) {
            navigate(`/manga/${mangaId}/capitulo/${prevChapter.id}`);
            setCurrentPageIndex(0);
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#05070a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '45px', height: '45px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#ff3366', borderRadius: '50%', margin: '0 auto 1.5rem auto', animation: 'spin 1s linear infinite' }}></div>
                    <h3 style={{ margin: 0, color: '#f1f5f9' }}>Baixando e extraindo páginas do Telegram...</h3>
                    <p style={{ margin: '0.5rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>Isso leva apenas alguns instantes.</p>
                </div>
            </div>
        );
    }

    if (!chapterData || !chapterData.pages || chapterData.pages.length === 0) {
        return (
            <div style={{ minHeight: '100vh', background: '#05070a', color: '#fff', padding: '120px 5%', textAlign: 'center' }}>
                <h2 style={{ color: '#f8fafc', marginBottom: '0.8rem' }}>Preparando as páginas do capítulo...</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto 1.5rem auto' }}>
                    O arquivo ainda está sendo sincronizado do canal de armazenamento. Clique no botão abaixo para tentar abrir novamente.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="btn btn-primary"
                        style={{ padding: '0.7rem 1.6rem', fontSize: '0.9rem' }}
                    >
                        Tentar Novamente
                    </button>
                    <Link to={`/manga/${mangaId}`} style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none', padding: '0.7rem 1.6rem', borderRadius: '1rem', fontWeight: 'bold' }}>
                        Voltar para a obra
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#051912', color: '#fff', display: 'flex', flexDirection: 'column' }}>
            {/* Barra de Ferramentas Superior Fixa */}
            <header style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: '60px',
                background: 'rgba(5, 25, 18, 0.95)',
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(0, 230, 118, 0.25)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 1.5rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                        onClick={() => navigate(`/manga/${mangaId}`)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: '600' }}
                    >
                        <ArrowLeft size={18} /> Obra
                    </button>
                    <div style={{ borderLeft: '1px solid rgba(255,255,255,0.12)', paddingLeft: '1rem' }}>
                        <span style={{ fontWeight: '800', color: 'var(--text)', fontSize: '0.95rem' }}>{mangaTitle}</span>
                        <span style={{ color: 'var(--primary)', fontWeight: 'bold', marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                            Capítulo {chapterData.chapter_number}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    {/* Seletor de Modo de Leitura */}
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(0, 230, 118, 0.2)', borderRadius: '25px', padding: '3px' }}>
                        <button 
                            onClick={() => setReadMode('cascade')}
                            style={{
                                background: readMode === 'cascade' ? 'var(--primary)' : 'transparent',
                                color: readMode === 'cascade' ? '#051912' : 'var(--text-muted)',
                                border: 'none', padding: '0.35rem 0.9rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '800'
                            }}
                        >
                            Cascata (Webtoon)
                        </button>
                        <button 
                            onClick={() => setReadMode('single')}
                            style={{
                                background: readMode === 'single' ? 'var(--primary)' : 'transparent',
                                color: readMode === 'single' ? '#051912' : 'var(--text-muted)',
                                border: 'none', padding: '0.35rem 0.9rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '800'
                            }}
                        >
                            Página a Página
                        </button>
                    </div>

                    {/* Seletor de Capítulos */}
                    <select 
                        value={chapterId}
                        onChange={e => navigate(`/manga/${mangaId}/capitulo/${e.target.value}`)}
                        style={{
                            background: 'rgba(9, 42, 28, 0.8)',
                            border: '1px solid rgba(0, 230, 118, 0.3)',
                            color: '#fff',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '12px',
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        {allChapters.map(c => (
                            <option key={c.id} value={c.id}>
                                Cap. {c.chapter_number}
                            </option>
                        ))}
                    </select>
                </div>
            </header>

            {/* Conteúdo Principal do Leitor */}
            <main style={{ marginTop: '70px', paddingBottom: '5rem', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {readMode === 'cascade' ? (
                    // MODO CASCATA (SCROLL VERTICAL CONTÍNUO)
                    <div style={{ maxWidth: '820px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {chapterData.pages.map((pageUrl, idx) => (
                            <img 
                                key={idx}
                                src={pageUrl} 
                                alt={`Página ${idx + 1}`} 
                                style={{ width: '100%', display: 'block', height: 'auto', background: '#051912' }}
                                loading="lazy"
                            />
                        ))}
                    </div>
                ) : (
                    // MODO PÁGINA A PÁGINA (LEITURA TRADICIONAL)
                    <div style={{ maxWidth: '900px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', cursor: 'pointer' }} onClick={handleNextPage}>
                            <img 
                                src={chapterData.pages[currentPageIndex]} 
                                alt={`Página ${currentPageIndex + 1}`} 
                                style={{ maxWidth: '100%', maxHeight: '88vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 12px 35px rgba(0,0,0,0.85)' }}
                            />
                        </div>

                        {/* Controles de Navegação da Página */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '1.5rem' }}>
                            <button 
                                onClick={handlePrevPage}
                                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}
                            >
                                <ChevronLeft size={18} /> Anterior
                            </button>
                            <span style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 'bold' }}>
                                {currentPageIndex + 1} / {chapterData.pages.length}
                            </span>
                            <button 
                                onClick={handleNextPage}
                                className="btn btn-primary"
                                style={{ padding: '0.6rem 1.4rem', fontSize: '0.85rem', gap: '0.4rem' }}
                            >
                                Próxima <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Rodapé de Navegação Entre Capítulos */}
                <div style={{ marginTop: '3rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {prevChapter ? (
                        <button 
                            onClick={() => navigate(`/manga/${mangaId}/capitulo/${prevChapter.id}`)}
                            style={{ background: 'rgba(9, 42, 28, 0.6)', border: '1px solid rgba(0, 230, 118, 0.25)', color: '#fff', padding: '0.75rem 1.6rem', borderRadius: '25px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
                        >
                            <ChevronLeft size={18} /> Capítulo Anterior (Cap. {prevChapter.chapter_number})
                        </button>
                    ) : (
                        <div style={{ color: '#475569', fontSize: '0.85rem' }}>Primeiro capítulo</div>
                    )}

                    {nextChapter ? (
                        <button 
                            onClick={() => navigate(`/manga/${mangaId}/capitulo/${nextChapter.id}`)}
                            className="btn btn-primary"
                            style={{ padding: '0.75rem 1.8rem', gap: '0.5rem' }}
                        >
                            Próximo Capítulo (Cap. {nextChapter.chapter_number}) <ChevronRight size={18} />
                        </button>
                    ) : (
                        <div style={{ color: '#475569', fontSize: '0.85rem' }}>Último capítulo disponível</div>
                    )}
                </div>
            </main>
        </div>
    );
}
