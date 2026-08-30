import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, CheckCircle, RefreshCcw, Trash2 } from 'lucide-react';

export default function AdminMangaChapters({ manga, token, onBack }) {
    const [localChapters, setLocalChapters] = useState([]);
    const [mangadexChapters, setMangadexChapters] = useState([]);
    const [loadingLocal, setLoadingLocal] = useState(false);
    const [loadingDex, setLoadingDex] = useState(false);
    const [downloading, setDownloading] = useState(null); // id of chapter downloading

    // 1. Fetch Local Chapters (already on Telegram)
    const fetchLocalChapters = async () => {
        setLoadingLocal(true);
        try {
            const res = await fetch(`/api/mangas/${manga.id}/chapters`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.chapters) setLocalChapters(data.chapters);
        } catch (e) {
            console.error(e);
        }
        setLoadingLocal(false);
    };

    // 2. Fetch MangaDex Chapters
    const fetchMangaDexChapters = async () => {
        if (!manga.anilist_id) { // using anilist_id as mangadex id for now
            window.alert('Esta obra não possui ID do MangaDex vinculado.');
            return;
        }
        setLoadingDex(true);
        try {
            const res = await fetch(`/api/mangas/mangadex/${manga.anilist_id}/chapters`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.chapters) setMangadexChapters(data.chapters);
        } catch (e) {
            console.error(e);
            window.alert('Erro ao buscar capítulos no MangaDex.');
        }
        setLoadingDex(false);
    };

    useEffect(() => {
        fetchLocalChapters();
        fetchMangaDexChapters();
    }, [manga.id]);

    const handleDownload = async (chapter) => {
        setDownloading(chapter.id);
        try {
            const res = await fetch('/api/mangas/mangadex/download', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    manga_id: manga.id,
                    chapter_id: chapter.id,
                    chapter_number: chapter.chapter_number,
                    title: chapter.title
                })
            });
            const data = await res.json();
            if (res.ok) {
                window.alert('Capítulo baixado e enviado ao Telegram com sucesso!');
                fetchLocalChapters();
            } else {
                window.alert(data.error || 'Erro ao baixar capítulo.');
            }
        } catch (e) {
            console.error(e);
            window.alert('Falha na comunicação.');
        }
        setDownloading(null);
    };

    const isLocal = (chapter_number) => {
        return localChapters.some(lc => lc.chapter_number === chapter_number);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', padding: '2rem', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                <button onClick={onBack} style={{ background: 'transparent', border: '1px solid #444', color: '#fff', padding: '0.5rem', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}>
                    <ArrowLeft size={18} />
                </button>
                <h2 style={{ margin: 0, color: '#ff3366' }}>{manga.title} - Capítulos</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Lado Esquerdo: Local (Telegram) */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>Capítulos Baixados</h3>
                        <button onClick={fetchLocalChapters} disabled={loadingLocal} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>
                            <RefreshCcw size={16} />
                        </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
                        {loadingLocal ? <p>Carregando...</p> : localChapters.length === 0 ? <p style={{ color: '#888' }}>Nenhum capítulo local.</p> : null}
                        {localChapters.map(lc => (
                            <div key={lc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem', background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '6px' }}>
                                <div>
                                    <strong style={{ color: '#00ff88' }}>Cap. {lc.chapter_number}</strong>
                                    <div style={{ fontSize: '0.8rem', color: '#888' }}>{lc.pages_count} páginas • {(lc.file_size / 1024 / 1024).toFixed(1)} MB</div>
                                </div>
                                <CheckCircle size={18} color="#00ff88" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Lado Direito: MangaDex */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0 }}>MangaDex (PT-BR)</h3>
                        <button onClick={fetchMangaDexChapters} disabled={loadingDex} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>
                            <RefreshCcw size={16} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '500px', overflowY: 'auto' }}>
                        {loadingDex ? <p>Buscando no MangaDex...</p> : mangadexChapters.length === 0 ? <p style={{ color: '#888' }}>Nenhum capítulo em PT-BR encontrado.</p> : null}
                        {mangadexChapters.map(ch => {
                            const downloaded = isLocal(ch.chapter_number);
                            return (
                                <div key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', opacity: downloaded ? 0.5 : 1 }}>
                                    <div>
                                        <strong>Cap. {ch.chapter_number}</strong>
                                        <div style={{ fontSize: '0.8rem', color: '#aaa' }}>{ch.title} • {ch.pages} págs</div>
                                    </div>
                                    {!downloaded ? (
                                        <button 
                                            onClick={() => handleDownload(ch)}
                                            disabled={downloading !== null}
                                            style={{ background: '#ff3366', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: downloading !== null ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold' }}
                                        >
                                            {downloading === ch.id ? <RefreshCcw size={14} className="spin" /> : <Download size={14} />}
                                            {downloading === ch.id ? 'Baixando...' : 'Baixar'}
                                        </button>
                                    ) : (
                                        <span style={{ color: '#00ff88', fontSize: '0.85rem', fontWeight: 'bold' }}>Baixado</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
