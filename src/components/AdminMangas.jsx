import React, { useState, useEffect } from 'react';
import { 
    BookOpen, Plus, Image as ImageIcon, Trash2, Edit2, UploadCloud,
    Play, Pause, RefreshCw, Zap, Globe, Layers, Settings2, CheckCircle2, AlertTriangle, ArrowRight
} from 'lucide-react';

import AdminMangaChapters from './AdminMangaChapters';

export default function AdminMangas({ token }) {
    const [mangas, setMangas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedManga, setSelectedManga] = useState(null);
    
    const [showAddModal, setShowAddModal] = useState(false);
    
    // MangaDex Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);

    // Estatísticas Globais do MangaDex em Tempo Real
    const [globalStats, setGlobalStats] = useState({
        totalObrasMundo: null,
        totalObrasPtBr: null,
        totalObrasEn: null,
        totalObrasEsLa: null,
        totalCapitulosMundo: null,
        totalCapitulosPtBr: null
    });
    const [loadingStats, setLoadingStats] = useState(false);

    // Auto-Importer / Fila States
    const [workerStatus, setWorkerStatus] = useState({
        isRunning: false,
        isProcessing: false,
        currentJob: null,
        stats: { totalPending: 0, totalCompleted: 0, totalError: 0 },
        autoImporter: {
            isEnabled: false,
            isIngesting: false,
            primaryLanguage: 'pt-br',
            orderBy: 'followedCount',
            delaySeconds: 3,
            currentOffset: 0,
            autoEnqueueChapters: 1,
            maxChaptersPerManga: 0,
            statusText: 'Parado',
            importedCount: 0
        }
    });

    // Form de Configuração da Ingestão Automática
    const [autoConfig, setAutoConfig] = useState({
        primaryLanguage: 'pt-br',
        orderBy: 'followedCount',
        delaySeconds: 3,
        autoEnqueueChapters: true,
        maxChaptersPerManga: 0
    });
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);

    const fetchMangas = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/mangas?includeEmpty=true', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.mangas) setMangas(data.mangas);
        } catch (e) {
            console.error('Erro ao buscar mangás:', e);
        }
        setLoading(false);
    };

    const fetchGlobalStats = async () => {
        setLoadingStats(true);
        try {
            const res = await fetch('/api/mangas/mangadex/global-stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data) setGlobalStats(data);
        } catch (e) {
            console.error('Erro ao buscar stats globais:', e);
        }
        setLoadingStats(false);
    };

    const fetchWorkerStatus = async () => {
        try {
            const res = await fetch('/api/mangas/queue/status', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data) {
                setWorkerStatus(data);
                if (data.autoImporter) {
                    setAutoConfig(prev => ({
                        primaryLanguage: data.autoImporter.primaryLanguage || 'pt-br',
                        orderBy: data.autoImporter.orderBy || 'followedCount',
                        delaySeconds: data.autoImporter.delaySeconds || 3,
                        autoEnqueueChapters: !!data.autoImporter.autoEnqueueChapters,
                        maxChaptersPerManga: data.autoImporter.maxChaptersPerManga || 0
                    }));
                }
            }
        } catch (e) {}
    };

    useEffect(() => {
        fetchMangas();
        fetchGlobalStats();
        fetchWorkerStatus();

        const interval = setInterval(() => {
            fetchWorkerStatus();
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Ações do Auto-Importer
    const handleToggleAutoImporter = async () => {
        const isCurrentlyActive = workerStatus.autoImporter?.isEnabled;
        const endpoint = isCurrentlyActive ? '/api/mangas/auto-importer/pause' : '/api/mangas/auto-importer/start';
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                fetchWorkerStatus();
                fetchMangas();
            } else {
                window.alert(data.error || 'Erro ao alterar estado do auto-ingestor.');
            }
        } catch (e) {
            window.alert('Falha na comunicação.');
        }
    };

    const handleSaveAutoConfig = async () => {
        setSavingConfig(true);
        try {
            const res = await fetch('/api/mangas/auto-importer/config', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(autoConfig)
            });
            const data = await res.json();
            if (res.ok) {
                setShowConfigModal(false);
                fetchWorkerStatus();
                window.alert('Configurações do auto-ingestor salvas com sucesso!');
            } else {
                window.alert(data.error || 'Erro ao salvar configurações.');
            }
        } catch (e) {
            window.alert('Falha na comunicação.');
        }
        setSavingConfig(false);
    };

    const handleResetOffset = async () => {
        if (!window.confirm('Deseja reiniciar a posição do robô de volta para a primeira obra mais popular (Offset 0)?')) return;
        try {
            const res = await fetch('/api/mangas/auto-importer/reset-offset', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchWorkerStatus();
                window.alert('Posição reiniciada para a primeira obra com sucesso!');
            }
        } catch (e) {}
    };

    const handleSearchMangaDex = async () => {
        if (!searchQuery) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/mangas/mangadex/search?q=${encodeURIComponent(searchQuery)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.results) {
                setSearchResults(data.results);
            }
        } catch (e) {
            console.error('Erro na pesquisa', e);
            window.alert('Erro ao buscar no MangaDex');
        }
        setSearching(false);
    };

    const handleSaveManga = async (mangaData) => {
        try {
            const res = await fetch('/api/mangas', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    title: mangaData.title,
                    original_title: mangaData.title,
                    synopsis: mangaData.synopsis,
                    cover_url: mangaData.cover_url,
                    type: mangaData.type,
                    anilist_id: mangaData.id // Saving MangaDex ID in anilist_id for now
                })
            });
            if (res.ok) {
                window.alert('Obra salva com sucesso!');
                setShowAddModal(false);
                fetchMangas();
            } else {
                window.alert('Erro ao salvar obra');
            }
        } catch (e) {
            window.alert('Falha na comunicação com o servidor');
        }
    };

    const handleDeleteManga = async (mangaId, mangaTitle) => {
        if (!window.confirm(`Tem certeza que deseja apagar a obra "${mangaTitle}" e todos os seus capítulos?`)) return;
        try {
            const res = await fetch(`/api/mangas/${mangaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                window.alert('Obra deletada com sucesso!');
                fetchMangas();
            } else {
                window.alert(data.error || 'Erro ao deletar obra');
            }
        } catch (e) {
            window.alert('Falha na comunicação com o servidor');
        }
    };

    if (selectedManga) {
        return (
            <AdminMangaChapters 
                manga={selectedManga} 
                token={token} 
                onBack={() => setSelectedManga(null)} 
            />
        );
    }

    return (
        <div style={{ padding: '2rem', color: '#fff', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* CABEÇALHO */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0, 230, 118, 0.2)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', margin: 0, fontSize: '1.6rem' }}>
                    <BookOpen size={30} color="var(--primary)" />
                    Central de Mangás & HQs
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                        onClick={() => setShowConfigModal(true)}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#fff',
                            padding: '0.65rem 1.2rem',
                            borderRadius: '10px',
                            fontWeight: '700',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        <Settings2 size={18} color="var(--primary)" /> Configurar Auto-Ingestão
                    </button>
                    <button 
                        onClick={() => setShowAddModal(true)}
                        style={{
                            background: 'linear-gradient(135deg, var(--primary), #00b35c)',
                            color: '#051912',
                            border: 'none',
                            padding: '0.65rem 1.3rem',
                            borderRadius: '10px',
                            fontWeight: '800',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(0, 230, 118, 0.3)'
                        }}
                    >
                        <Plus size={18} /> Adicionar Manualmente
                    </button>
                </div>
            </div>

            {/* SEÇÃO 1: ESTATÍSTICAS DA API MANGADEX EM TEMPO REAL */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(9, 42, 28, 0.4) 0%, rgba(5, 25, 18, 0.8) 100%)',
                border: '1px solid rgba(0, 230, 118, 0.2)',
                borderRadius: '16px',
                padding: '1.4rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Globe size={20} color="var(--primary)" />
                        <span style={{ fontWeight: '800', fontSize: '1rem' }}>Métricas da API MangaDex (Ao Vivo)</span>
                    </div>
                    <button 
                        onClick={fetchGlobalStats}
                        disabled={loadingStats}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        <RefreshCw size={14} className={loadingStats ? 'animate-spin' : ''} /> Atualizar Métricas
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Obras no Mundo</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff', marginTop: '0.2rem' }}>
                            {globalStats.totalObrasMundo ? globalStats.totalObrasMundo.toLocaleString('pt-BR') : '...'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Total geral cadastrado</div>
                    </div>

                    <div style={{ background: 'rgba(0, 230, 118, 0.06)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0, 230, 118, 0.25)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', textTransform: 'uppercase' }}>🇧🇷 Obras em PT-BR</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--primary)', marginTop: '0.2rem' }}>
                            {globalStats.totalObrasPtBr ? globalStats.totalObrasPtBr.toLocaleString('pt-BR') : '...'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Disponíveis em Português</div>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>🇺🇸 Obras em Inglês</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#60a5fa', marginTop: '0.2rem' }}>
                            {globalStats.totalObrasEn ? globalStats.totalObrasEn.toLocaleString('pt-BR') : '...'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Disponíveis em Inglês</div>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>🇲🇽 Obras em Espanhol</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#f59e0b', marginTop: '0.2rem' }}>
                            {globalStats.totalObrasEsLa ? globalStats.totalObrasEsLa.toLocaleString('pt-BR') : '...'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Disponíveis em Espanhol</div>
                    </div>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>Capítulos no Mundo</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#a78bfa', marginTop: '0.2rem' }}>
                            {globalStats.totalCapitulosMundo ? globalStats.totalCapitulosMundo.toLocaleString('pt-BR') : '...'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Global em todos idiomas</div>
                    </div>

                    <div style={{ background: 'rgba(0, 230, 118, 0.06)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0, 230, 118, 0.25)' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: '800', textTransform: 'uppercase' }}>🇧🇷 Capítulos PT-BR</div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '900', color: 'var(--primary)', marginTop: '0.2rem' }}>
                            {globalStats.totalCapitulosPtBr ? globalStats.totalCapitulosPtBr.toLocaleString('pt-BR') : '...'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Capítulos traduzidos PT-BR</div>
                    </div>
                </div>
            </div>

            {/* SEÇÃO 2: PAINEL DE CONTROLE DA AUTO-INGESTÃO E FILA */}
            <div style={{
                background: 'radial-gradient(ellipse at top left, rgba(0, 230, 118, 0.12) 0%, rgba(9, 42, 28, 0.6) 60%, rgba(5, 25, 18, 0.95) 100%)',
                border: '1px solid rgba(0, 230, 118, 0.3)',
                borderRadius: '16px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.2rem',
                boxShadow: '0 8px 30px rgba(0,0,0,0.4)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '10px',
                            background: workerStatus.autoImporter?.isEnabled ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: `1px solid ${workerStatus.autoImporter?.isEnabled ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`
                        }}>
                            <Zap size={22} color={workerStatus.autoImporter?.isEnabled ? 'var(--primary)' : '#888'} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Auto-Ingestão Contínua de Mangás</h3>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '20px',
                                    background: workerStatus.autoImporter?.isEnabled ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255,255,255,0.1)',
                                    color: workerStatus.autoImporter?.isEnabled ? 'var(--primary)' : 'var(--text-muted)',
                                    border: `1px solid ${workerStatus.autoImporter?.isEnabled ? 'var(--primary)' : 'rgba(255,255,255,0.15)'}`
                                }}>
                                    {workerStatus.autoImporter?.isEnabled ? '● EM OPERAÇÃO' : '○ PAUSADO'}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                Status: <strong>{workerStatus.autoImporter?.statusText || 'Inativo'}</strong>
                            </div>
                        </div>
                    </div>

                    {/* Botões de Ação do Auto-Ingestor */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={handleToggleAutoImporter}
                            style={{
                                background: workerStatus.autoImporter?.isEnabled ? 'rgba(239, 68, 68, 0.2)' : 'linear-gradient(135deg, var(--primary), #00b35c)',
                                border: `1px solid ${workerStatus.autoImporter?.isEnabled ? '#ef4444' : 'var(--primary)'}`,
                                color: workerStatus.autoImporter?.isEnabled ? '#ef4444' : '#051912',
                                padding: '0.65rem 1.4rem',
                                borderRadius: '10px',
                                fontWeight: '900',
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                boxShadow: workerStatus.autoImporter?.isEnabled ? 'none' : '0 4px 15px rgba(0, 230, 118, 0.4)'
                            }}
                        >
                            {workerStatus.autoImporter?.isEnabled ? <Pause size={18} /> : <Play size={18} />}
                            {workerStatus.autoImporter?.isEnabled ? 'Pausar Auto-Ingestão' : 'Iniciar Auto-Ingestão de Obras'}
                        </button>

                        <button
                            onClick={handleResetOffset}
                            title="Voltar ao início do catálogo (Offset 0)"
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: '#fff',
                                padding: '0.65rem 1rem',
                                borderRadius: '10px',
                                fontSize: '0.82rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                            }}
                        >
                            Reiniciar Posição (Offset: {workerStatus.autoImporter?.currentOffset || 0})
                        </button>
                    </div>
                </div>

                {/* Métricas do Auto-Ingestor e da Fila */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '12px' }}>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Idioma Priorizado</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--primary)', marginTop: '0.2rem' }}>
                            {workerStatus.autoImporter?.primaryLanguage === 'pt-br' ? '🇧🇷 Português (PT-BR)' : 
                             workerStatus.autoImporter?.primaryLanguage === 'en' ? '🇺🇸 Inglês (EN)' : 
                             workerStatus.autoImporter?.primaryLanguage === 'es-la' ? '🇲🇽 Espanhol (ES-LA)' : '🌐 Todos'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Critério de Busca</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#60a5fa', marginTop: '0.2rem' }}>
                            {workerStatus.autoImporter?.orderBy === 'followedCount' ? '⭐ Mais Seguidos / Populares' :
                             workerStatus.autoImporter?.orderBy === 'rating' ? '🔥 Melhor Avaliados' : '🕒 Atualizados Recentemente'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Capítulos na Fila</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#ffab00', marginTop: '0.2rem' }}>
                            {workerStatus.stats.totalPending} pendentes
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '800' }}>Capítulos Concluídos</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#00e676', marginTop: '0.2rem' }}>
                            {workerStatus.stats.totalCompleted} baixados
                        </div>
                    </div>
                </div>

                {/* Job Ativo do Worker de Download */}
                {workerStatus.currentJob && (
                    <div style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(0, 230, 118, 0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.88rem' }}>
                            <span>
                                ⚡ Baixando agora: <strong>{workerStatus.currentJob.manga_title}</strong> - Cap. <strong>{workerStatus.currentJob.chapter_number}</strong>
                            </span>
                            <span style={{ color: 'var(--primary)', fontWeight: '800' }}>
                                {workerStatus.currentJob.step} ({workerStatus.currentJob.progress}%)
                            </span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${workerStatus.currentJob.progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease', boxShadow: 'var(--glow)' }}></div>
                        </div>
                    </div>
                )}
            </div>

            {/* SEÇÃO 3: LISTAGEM DE OBRAS DO BANCO LOCAL */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>
                    Obras Cadastradas no Zoroflix ({mangas.length})
                </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.5rem' }}>
                {loading ? <p>Carregando obras...</p> : mangas.length === 0 ? <p>Nenhuma obra cadastrada ainda.</p> : null}
                
                {mangas.map(manga => (
                    <div key={manga.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ width: '100%', height: '280px', background: '#111', position: 'relative' }}>
                            {manga.cover_url ? (
                                <img src={manga.cover_url} alt={manga.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                                    <ImageIcon size={48} />
                                </div>
                            )}
                            <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                {manga.type.toUpperCase()}
                            </div>
                        </div>
                        <div style={{ padding: '1rem' }}>
                            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{manga.title}</h3>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                <button onClick={() => setSelectedManga(manga)} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
                                    Capítulos
                                </button>
                                <button 
                                    onClick={() => handleDeleteManga(manga.id, manga.title)}
                                    title="Deletar Obra"
                                    style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal de Pesquisa MangaDex */}
            {showAddModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '12px', width: '700px', maxWidth: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: '#ff3366' }}>Pesquisar no MangaDex</h3>
                            <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                            <input 
                                type="text" 
                                placeholder="Digite o nome do mangá..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearchMangaDex()}
                                style={{ flex: 1, padding: '0.8rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                            />
                            <button 
                                onClick={handleSearchMangaDex}
                                disabled={searching}
                                style={{ padding: '0 1.5rem', background: '#ff3366', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: searching ? 'not-allowed' : 'pointer' }}
                            >
                                {searching ? 'Buscando...' : 'Pesquisar'}
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                            {searchResults.map(result => (
                                <div key={result.id} style={{ background: '#222', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ height: '200px', background: '#111', marginBottom: '1rem', borderRadius: '4px', overflow: 'hidden' }}>
                                        {result.cover_url ? (
                                            <img src={result.cover_url} alt={result.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Sem Capa</div>
                                        )}
                                    </div>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', flex: 1 }}>{result.title}</h4>
                                    <button 
                                        onClick={() => handleSaveManga(result)}
                                        style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        Salvar no Banco
                                    </button>
                                </div>
                            ))}
                            {searchResults.length === 0 && !searching && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666', padding: '2rem' }}>
                                    Nenhum resultado encontrado.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL DE CONFIGURAÇÃO DA AUTO-INGESTÃO */}
            {showConfigModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(5px)' }}>
                    <div style={{ background: '#092a1c', border: '1px solid rgba(0, 230, 118, 0.4)', padding: '2rem', borderRadius: '16px', width: '560px', maxWidth: '92%', display: 'flex', flexDirection: 'column', gap: '1.4rem', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0, 230, 118, 0.2)', paddingBottom: '0.8rem' }}>
                            <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.2rem' }}>
                                <Settings2 size={22} /> Configurações da Auto-Ingestão
                            </h3>
                            <button onClick={() => setShowConfigModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.4rem' }}>&times;</button>
                        </div>

                        {/* Idioma Prioritário */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--primary)' }}>
                                Idioma Alvo para Ingestão de Obras:
                            </label>
                            <select 
                                value={autoConfig.primaryLanguage}
                                onChange={e => setAutoConfig({ ...autoConfig, primaryLanguage: e.target.value })}
                                style={{ background: '#051912', border: '1px solid rgba(0, 230, 118, 0.3)', color: '#fff', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                            >
                                <option value="pt-br">🇧🇷 Português (PT-BR) - Recomendado (13.156 obras)</option>
                                <option value="en">🇺🇸 Inglês (EN) - Catálogo Amplo (54.643 obras)</option>
                                <option value="es-la">🇲🇽 Espanhol Latino (ES-LA) (10.047 obras)</option>
                                <option value="es">🇪🇸 Espanhol Europeu</option>
                                <option value="ja">🇯🇵 Japonês (Raw)</option>
                                <option value="all">🌐 Todas as Obras (Independente de idioma)</option>
                            </select>
                        </div>

                        {/* Critério de Ordenação */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--primary)' }}>
                                Prioridade de Descoberta (Ordem na API):
                            </label>
                            <select 
                                value={autoConfig.orderBy}
                                onChange={e => setAutoConfig({ ...autoConfig, orderBy: e.target.value })}
                                style={{ background: '#051912', border: '1px solid rgba(0, 230, 118, 0.3)', color: '#fff', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                            >
                                <option value="followedCount">⭐ Mais Seguidos / Populares no Mundo (Recomendado)</option>
                                <option value="rating">🔥 Melhor Avaliados pelos Leitores</option>
                                <option value="latestUploadedChapter">🕒 Lançamentos e Atualizações Recentes</option>
                                <option value="title">🔤 Ordem Alfabética (A-Z)</option>
                            </select>
                        </div>

                        {/* Delay entre Obras */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--primary)' }}>
                                Delay de Segurança entre Obras (Segundos):
                            </label>
                            <input 
                                type="number" 
                                min="1" 
                                max="60"
                                value={autoConfig.delaySeconds}
                                onChange={e => setAutoConfig({ ...autoConfig, delaySeconds: parseInt(e.target.value) || 3 })}
                                style={{ background: '#051912', border: '1px solid rgba(0, 230, 118, 0.3)', color: '#fff', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Protege a API contra bloqueios de IP (recomendado: 3 a 5 segundos).
                            </span>
                        </div>

                        {/* Baixar Capítulos Automaticamente */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'rgba(0,0,0,0.3)', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <input 
                                type="checkbox"
                                id="autoEnqueueCh"
                                checked={autoConfig.autoEnqueueChapters}
                                onChange={e => setAutoConfig({ ...autoConfig, autoEnqueueChapters: e.target.checked })}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                            />
                            <label htmlFor="autoEnqueueCh" style={{ fontSize: '0.88rem', fontWeight: '700', cursor: 'pointer' }}>
                                Enfileirar e baixar capítulos automaticamente após cadastrar a obra
                            </label>
                        </div>

                        {/* Limite de Capítulos por Obra */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--primary)' }}>
                                Limite Máximo de Capítulos por Obra (0 = Baixar Todos):
                            </label>
                            <input 
                                type="number" 
                                min="0" 
                                max="1000"
                                value={autoConfig.maxChaptersPerManga}
                                onChange={e => setAutoConfig({ ...autoConfig, maxChaptersPerManga: parseInt(e.target.value) || 0 })}
                                style={{ background: '#051912', border: '1px solid rgba(0, 230, 118, 0.3)', color: '#fff', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Exemplo: coloque 5 para baixar apenas os 5 primeiros capítulos de cada obra, ou 0 para baixar tudo.
                            </span>
                        </div>

                        {/* Botões do Modal */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '1rem' }}>
                            <button
                                onClick={() => setShowConfigModal(false)}
                                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '0.65rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveAutoConfig}
                                disabled={savingConfig}
                                style={{ background: 'linear-gradient(135deg, var(--primary), #00b35c)', color: '#051912', border: 'none', padding: '0.65rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '900', boxShadow: '0 4px 15px rgba(0, 230, 118, 0.4)' }}
                            >
                                {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
