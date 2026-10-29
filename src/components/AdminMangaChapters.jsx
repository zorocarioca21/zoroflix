import React, { useState, useEffect } from 'react';
import { 
    ArrowLeft, Download, CheckCircle, RefreshCcw, Trash2, 
    Play, Pause, Globe, Layers, AlertCircle, CheckSquare, Square
} from 'lucide-react';

export default function AdminMangaChapters({ manga, token, onBack }) {
    const [localChapters, setLocalChapters] = useState([]);
    const [mangadexChapters, setMangadexChapters] = useState([]);
    const [availableLanguages, setAvailableLanguages] = useState([]);
    const [loadingLocal, setLoadingLocal] = useState(false);
    const [loadingDex, setLoadingDex] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('pt-br');

    // Fila e Worker States
    const [queueStatus, setQueueStatus] = useState({
        isRunning: false,
        isProcessing: false,
        currentJob: null,
        stats: { totalPending: 0, totalCompleted: 0, totalError: 0 },
        items: []
    });

    // Seleção múltipla para download em lote
    const [selectedChapters, setSelectedChapters] = useState(new Set());
    const [actionLoading, setActionLoading] = useState(false);

    // 0. Fetch Available Languages for this manga from MangaDex
    const fetchMangaInfo = async () => {
        if (!manga.anilist_id) return;
        try {
            const res = await fetch(`/api/mangas/mangadex/${manga.anilist_id}/info`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.availableLanguages && Array.isArray(data.availableLanguages)) {
                setAvailableLanguages(data.availableLanguages);
                // Se pt-br não estiver disponível nas linguagens da obra, seleciona a primeira disponível
                if (data.availableLanguages.length > 0 && !data.availableLanguages.includes('pt-br')) {
                    if (data.availableLanguages.includes('en')) {
                        setSelectedLanguage('en');
                    } else {
                        setSelectedLanguage(data.availableLanguages[0]);
                    }
                }
            }
        } catch (e) {
            console.error('Erro ao buscar linguagens da obra:', e);
        }
    };

    // 1. Fetch Local Chapters
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

    // 2. Fetch MangaDex Chapters com filtro de idioma
    const fetchMangaDexChapters = async () => {
        if (!manga.anilist_id) {
            window.alert('Esta obra não possui ID do MangaDex vinculado.');
            return;
        }
        setLoadingDex(true);
        setSelectedChapters(new Set());
        try {
            const res = await fetch(`/api/mangas/mangadex/${manga.anilist_id}/chapters?lang=${selectedLanguage}&limit=500`, {
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

    // 3. Polling de status da fila a cada 3 segundos
    const fetchQueueStatus = async () => {
        try {
            const res = await fetch('/api/mangas/queue/status', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data) {
                setQueueStatus(data);
                // Se o trabalho atual foi concluído ou mudou, atualiza a lista local
                if (data.isProcessing || data.stats.totalCompleted > 0) {
                    // Mantém local atualizado
                }
            }
        } catch (e) {}
    };

    useEffect(() => {
        fetchMangaInfo();
    }, [manga.anilist_id]);

    useEffect(() => {
        fetchLocalChapters();
        fetchMangaDexChapters();
        fetchQueueStatus();

        const interval = setInterval(() => {
            fetchQueueStatus();
        }, 3000);
        return () => clearInterval(interval);
    }, [manga.id, selectedLanguage]);

    // Quando o worker conclui capítulos, recarrega capítulos locais
    useEffect(() => {
        if (queueStatus.stats.totalCompleted > 0) {
            fetchLocalChapters();
        }
    }, [queueStatus.stats.totalCompleted]);

    const isLocal = (chapter_number, scan_group) => {
        return localChapters.some(lc => 
            lc.chapter_number === chapter_number && 
            (!scan_group || lc.scan_group === scan_group || lc.scan_group === 'Padrão')
        );
    };

    const isEnqueued = (chapterDexId) => {
        return queueStatus.items?.some(item => item.chapter_dex_id === chapterDexId && (item.status === 'pending' || item.status === 'downloading'));
    };

    // Controles da Fila
    const handleToggleWorker = async () => {
        const endpoint = queueStatus.isRunning ? '/api/mangas/queue/pause' : '/api/mangas/queue/start';
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setQueueStatus(prev => ({ ...prev, isRunning: data.status.isRunning }));
            }
        } catch (e) {
            window.alert('Erro ao alterar status da fila.');
        }
    };

    // Enfileirar Todos os Capítulos Faltantes
    const handleEnqueueAllMissing = async () => {
        if (!window.confirm(`Deseja adicionar TODOS os capítulos faltantes em ${selectedLanguage.toUpperCase()} na fila de download automático?`)) return;
        setActionLoading(true);
        try {
            const res = await fetch('/api/mangas/queue/add-all', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    manga_id: manga.id,
                    language: selectedLanguage
                })
            });
            const data = await res.json();
            if (res.ok) {
                window.alert(`Sucesso! ${data.added} capítulos novos adicionados à fila de download.`);
                fetchQueueStatus();
            } else {
                window.alert(data.error || 'Erro ao enfileirar capítulos.');
            }
        } catch (e) {
            window.alert('Falha na comunicação com o servidor.');
        }
        setActionLoading(false);
    };

    // Enfileirar Selecionados
    const handleEnqueueSelected = async () => {
        if (selectedChapters.size === 0) return;
        setActionLoading(true);
        const chaptersToAdd = mangadexChapters.filter(ch => selectedChapters.has(ch.id));
        try {
            const res = await fetch('/api/mangas/queue/add', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    manga_id: manga.id,
                    chapters: chaptersToAdd,
                    language: selectedLanguage
                })
            });
            const data = await res.json();
            if (res.ok) {
                window.alert(`${data.addedCount} capítulos adicionados à fila!`);
                setSelectedChapters(new Set());
                fetchQueueStatus();
            } else {
                window.alert(data.error || 'Erro ao enfileirar.');
            }
        } catch (e) {
            window.alert('Falha na comunicação.');
        }
        setActionLoading(false);
    };

    // Toggle selecionar capítulo
    const handleToggleSelect = (chId) => {
        setSelectedChapters(prev => {
            const next = new Set(prev);
            if (next.has(chId)) next.delete(chId);
            else next.add(chId);
            return next;
        });
    };

    const handleSelectAllMissingInView = () => {
        const missing = mangadexChapters.filter(ch => !isLocal(ch.chapter_number) && !isEnqueued(ch.id));
        if (selectedChapters.size === missing.length) {
            setSelectedChapters(new Set());
        } else {
            setSelectedChapters(new Set(missing.map(m => m.id)));
        }
    };

    const handleDeleteChapter = async (chapterId, capNum) => {
        if (!window.confirm(`Tem certeza que deseja apagar o Capítulo ${capNum}?`)) return;
        try {
            const res = await fetch(`/api/mangas/chapters/${chapterId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchLocalChapters();
            } else {
                window.alert('Erro ao apagar capítulo');
            }
        } catch (e) {
            window.alert('Falha na comunicação');
        }
    };

    const LANGUAGE_NAMES = {
        'pt-br': { flag: '🇧🇷', name: 'Português' },
        'en': { flag: '🇺🇸', name: 'Inglês' },
        'es-la': { flag: '🇲🇽', name: 'Espanhol Latino' },
        'es': { flag: '🇪🇸', name: 'Espanhol' },
        'ja': { flag: '🇯🇵', name: 'Japonês' },
        'ko': { flag: '🇰🇷', name: 'Coreano' },
        'zh': { flag: '🇨🇳', name: 'Chinês' },
        'fr': { flag: '🇫🇷', name: 'Francês' },
        'de': { flag: '🇩🇪', name: 'Alemão' },
        'it': { flag: '🇮🇹', name: 'Italiano' },
        'ru': { flag: '🇷🇺', name: 'Russo' },
        'id': { flag: '🇮🇩', name: 'Indonésio' },
        'tr': { flag: '🇹🇷', name: 'Turco' },
        'pl': { flag: '🇵🇱', name: 'Polonês' },
        'vi': { flag: '🇻🇳', name: 'Vietnamita' },
        'ar': { flag: '🇸🇦', name: 'Árabe' },
        'th': { flag: '🇹🇭', name: 'Tailandês' }
    };

    const languages = availableLanguages.length > 0 
        ? availableLanguages.map(code => ({
            id: code,
            label: `${LANGUAGE_NAMES[code]?.flag || '🌐'} ${LANGUAGE_NAMES[code]?.name || code.toUpperCase()}`
        }))
        : [
            { id: 'pt-br', label: '🇧🇷 Português' },
            { id: 'en', label: '🇺🇸 Inglês' },
            { id: 'es-la', label: '🇲🇽 Espanhol Latino' },
            { id: 'ja', label: '🇯🇵 Japonês' }
        ];

    const currentMangaItemsInQueue = queueStatus.items?.filter(i => i.manga_id === manga.id) || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.8rem', padding: '1rem', color: '#fff' }}>
            {/* Header de Navegação */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(0, 230, 118, 0.2)', paddingBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                        onClick={onBack} 
                        style={{
                            background: 'rgba(0, 230, 118, 0.1)',
                            border: '1px solid rgba(0, 230, 118, 0.3)',
                            color: 'var(--primary)',
                            padding: '0.5rem 0.8rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontWeight: 'bold'
                        }}
                    >
                        <ArrowLeft size={18} /> Voltar para Obras
                    </button>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: 'var(--text)' }}>
                            {manga.title}
                        </h2>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gerenciamento e Fila de Downloads Automáticos</span>
                    </div>
                </div>

                {/* Status do Worker e Botão Iniciar/Pausar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '0.4rem 0.9rem',
                        borderRadius: '20px',
                        fontSize: '0.85rem'
                    }}>
                        <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: queueStatus.isRunning ? '#00e676' : '#ffab00',
                            boxShadow: queueStatus.isRunning ? '0 0 10px #00e676' : 'none'
                        }}></div>
                        <span>Fila: <strong>{queueStatus.isRunning ? 'Ativa' : 'Pausada'}</strong></span>
                    </div>

                    <button
                        onClick={handleToggleWorker}
                        style={{
                            background: queueStatus.isRunning ? 'rgba(239, 68, 68, 0.2)' : 'var(--primary)',
                            color: queueStatus.isRunning ? '#ef4444' : '#051912',
                            border: queueStatus.isRunning ? '1px solid rgba(239, 68, 68, 0.4)' : 'none',
                            padding: '0.6rem 1.4rem',
                            borderRadius: '10px',
                            fontWeight: '900',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            boxShadow: queueStatus.isRunning ? 'none' : 'var(--glow)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        {queueStatus.isRunning ? <Pause size={17} /> : <Play size={17} />}
                        {queueStatus.isRunning ? 'Pausar Fila' : 'Iniciar Fila'}
                    </button>
                </div>
            </div>

            {/* CARD DE CONTROLE E PROGRESSO DA FILA EM TEMPO REAL */}
            <div style={{
                background: 'radial-gradient(ellipse at top left, rgba(0, 230, 118, 0.1) 0%, rgba(9, 42, 28, 0.5) 60%, rgba(5, 25, 18, 0.9) 100%)',
                border: '1px solid rgba(0, 230, 118, 0.25)',
                borderRadius: '16px',
                padding: '1.4rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Na Fila Geral</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#ffab00' }}>{queueStatus.stats.totalPending}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Desta Obra na Fila</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: 'var(--primary)' }}>{currentMangaItemsInQueue.length}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Concluídos</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#00e676' }}>{queueStatus.stats.totalCompleted}</div>
                        </div>
                        {queueStatus.stats.totalError > 0 && (
                            <div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Erros</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#ef4444' }}>{queueStatus.stats.totalError}</div>
                            </div>
                        )}
                    </div>

                    {/* Ações em Lote */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={handleEnqueueAllMissing}
                            disabled={actionLoading || loadingDex}
                            style={{
                                background: 'linear-gradient(135deg, #00e676, #00b35c)',
                                color: '#051912',
                                border: 'none',
                                padding: '0.65rem 1.2rem',
                                borderRadius: '10px',
                                fontWeight: '800',
                                fontSize: '0.85rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(0, 230, 118, 0.3)'
                            }}
                        >
                            <Download size={16} /> Baixar Todos os Faltantes ({selectedLanguage.toUpperCase()})
                        </button>

                        {selectedChapters.size > 0 && (
                            <button
                                onClick={handleEnqueueSelected}
                                disabled={actionLoading}
                                style={{
                                    background: 'rgba(0, 230, 118, 0.2)',
                                    border: '1px solid var(--primary)',
                                    color: 'var(--primary)',
                                    padding: '0.65rem 1.2rem',
                                    borderRadius: '10px',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    cursor: 'pointer'
                                }}
                            >
                                <CheckSquare size={16} /> Baixar Selecionados ({selectedChapters.size})
                            </button>
                        )}
                    </div>
                </div>

                {/* Job Ativo em Andamento */}
                {queueStatus.currentJob ? (
                    <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(0, 230, 118, 0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                            <span>
                                ⚡ Baixando agora: <strong>{queueStatus.currentJob.manga_title}</strong> - Cap. <strong>{queueStatus.currentJob.chapter_number}</strong>
                            </span>
                            <span style={{ color: 'var(--primary)', fontWeight: '800' }}>
                                {queueStatus.currentJob.step} ({queueStatus.currentJob.progress}%)
                            </span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${queueStatus.currentJob.progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease', boxShadow: 'var(--glow)' }}></div>
                        </div>
                    </div>
                ) : queueStatus.isRunning ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ color: 'var(--primary)' }}>●</span> Fila pronta e aguardando capítulos.
                    </div>
                ) : null}
            </div>

            {/* SELETOR DE IDIOMAS EM PÍLULAS */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <Globe size={18} color="var(--primary)" />
                    <span style={{ fontWeight: '800', fontSize: '0.9rem' }}>
                        Idiomas Disponíveis na Obra ({languages.length}):
                    </span>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', background: 'rgba(0,0,0,0.5)', padding: '4px', borderRadius: '25px', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '110px', overflowY: 'auto' }}>
                        {languages.map(lang => (
                            <button
                                key={lang.id}
                                onClick={() => setSelectedLanguage(lang.id)}
                                style={{
                                    background: selectedLanguage === lang.id ? 'var(--primary)' : 'transparent',
                                    color: selectedLanguage === lang.id ? '#051912' : 'var(--text-muted)',
                                    border: 'none',
                                    padding: '0.35rem 0.9rem',
                                    borderRadius: '20px',
                                    fontSize: '0.78rem',
                                    fontWeight: selectedLanguage === lang.id ? '800' : '600',
                                    cursor: 'pointer',
                                    boxShadow: selectedLanguage === lang.id ? 'var(--glow)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {lang.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.6rem' }}>
                    <button
                        onClick={handleSelectAllMissingInView}
                        disabled={loadingDex}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#fff',
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                        }}
                    >
                        <CheckSquare size={14} /> Selecionar Todos Faltantes
                    </button>
                </div>
            </div>

            {/* DUAS COLUNAS: CAPÍTULOS LOCAIS VS MANGADEX */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
                {/* LADO ESQUERDO: LOCAIS */}
                <div style={{ background: 'rgba(9, 42, 28, 0.4)', padding: '1.3rem', borderRadius: '16px', border: '1px solid rgba(0, 230, 118, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <CheckCircle size={18} color="var(--primary)" />
                            Capítulos Baixados ({localChapters.length})
                        </h3>
                        <button onClick={fetchLocalChapters} disabled={loadingLocal} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <RefreshCcw size={16} className={loadingLocal ? 'spin' : ''} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '550px', overflowY: 'auto' }}>
                        {loadingLocal ? <p style={{ color: 'var(--text-muted)' }}>Atualizando lista local...</p> : localChapters.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Nenhum capítulo baixado ainda.</p> : null}
                        {localChapters.map(lc => (
                            <div key={lc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'rgba(0, 230, 118, 0.06)', border: '1px solid rgba(0, 230, 118, 0.2)', borderRadius: '10px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <strong style={{ color: 'var(--primary)', fontSize: '0.95rem' }}>Capítulo {lc.chapter_number}</strong>
                                        {lc.scan_group && (
                                            <span style={{ fontSize: '0.68rem', background: 'rgba(0, 230, 118, 0.15)', color: 'var(--primary)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: '800' }}>
                                                {lc.scan_group}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{lc.pages_count} páginas • {(lc.file_size / 1024 / 1024).toFixed(1)} MB</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                    <span style={{ fontSize: '0.72rem', background: 'rgba(0, 230, 118, 0.15)', color: 'var(--primary)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: '800' }}>DISPONÍVEL</span>
                                    <button 
                                        onClick={() => handleDeleteChapter(lc.id, lc.chapter_number)}
                                        title="Apagar Capítulo"
                                        style={{ background: 'transparent', border: 'none', color: '#ff5252', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* LADO DIREITO: MANGADEX */}
                <div style={{ background: 'rgba(9, 42, 28, 0.4)', padding: '1.3rem', borderRadius: '16px', border: '1px solid rgba(0, 230, 118, 0.2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Layers size={18} color="var(--primary)" />
                            MangaDex ({mangadexChapters.length} encontrados)
                        </h3>
                        <button onClick={fetchMangaDexChapters} disabled={loadingDex} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <RefreshCcw size={16} className={loadingDex ? 'spin' : ''} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '550px', overflowY: 'auto' }}>
                        {loadingDex ? <p style={{ color: 'var(--text-muted)' }}>Buscando no MangaDex...</p> : mangadexChapters.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Nenhum capítulo em {selectedLanguage.toUpperCase()} encontrado.</p> : null}
                        {mangadexChapters.map(ch => {
                            const downloaded = isLocal(ch.chapter_number, ch.scan_group);
                            const inQueue = isEnqueued(ch.id);
                            const isSelected = selectedChapters.has(ch.id);

                            return (
                                <div 
                                    key={ch.id} 
                                    onClick={() => !downloaded && !inQueue && handleToggleSelect(ch.id)}
                                    style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center', 
                                        padding: '0.75rem 1rem', 
                                        background: isSelected ? 'rgba(0, 230, 118, 0.12)' : 'rgba(0, 0, 0, 0.35)', 
                                        border: isSelected ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: '10px', 
                                        opacity: downloaded ? 0.5 : 1,
                                        cursor: downloaded || inQueue ? 'default' : 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                        {!downloaded && !inQueue && (
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected} 
                                                onChange={() => handleToggleSelect(ch.id)}
                                                onClick={e => e.stopPropagation()}
                                                style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                                            />
                                        )}
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <strong style={{ fontSize: '0.95rem' }}>Capítulo {ch.chapter_number}</strong>
                                                {ch.scan_group && (
                                                    <span style={{ fontSize: '0.68rem', background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: '800' }}>
                                                        {ch.scan_group}
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ch.title} • {ch.pages} págs</div>
                                        </div>
                                    </div>

                                    <div>
                                        {downloaded ? (
                                            <span style={{ color: '#00e676', fontSize: '0.82rem', fontWeight: '800' }}>✓ Baixado</span>
                                        ) : inQueue ? (
                                            <span style={{ color: '#ffab00', fontSize: '0.82rem', fontWeight: '800' }}>⏳ Na Fila</span>
                                        ) : (
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    await fetch('/api/mangas/queue/add', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                        body: JSON.stringify({ manga_id: manga.id, chapters: [ch], language: selectedLanguage })
                                                    });
                                                    fetchQueueStatus();
                                                }}
                                                style={{
                                                    background: 'rgba(0, 230, 118, 0.15)',
                                                    border: '1px solid rgba(0, 230, 118, 0.4)',
                                                    color: 'var(--primary)',
                                                    padding: '0.35rem 0.8rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.78rem',
                                                    fontWeight: '800',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem'
                                                }}
                                            >
                                                <Download size={13} /> + Fila
                                            </button>
                                        )}
                                    </div>
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
