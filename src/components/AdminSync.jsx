import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Play, Pause, Trash2, Edit, HardDriveDownload, Send, Search, ArrowDownUp, SkipForward, Download, RefreshCcw, Eraser, ChevronsUp, X, Radio, AlertTriangle, CheckCircle2, Info, XCircle, Clock, Star, CheckCircle, Database, Rocket, Sparkles, Check, Server, ListFilter, Activity, Film, List } from 'lucide-react';
import './AdminSync.css';

// ==========================================
// CUSTOM DIALOG SYSTEM - Substitui alert/confirm/prompt nativos
// ==========================================
const dialogStyles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(6px)',
        zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center',
        animation: 'dialogFadeIn 0.2s ease-out',
    },
    container: {
        background: 'linear-gradient(145deg, #1e1e2e 0%, #141420 100%)',
        borderRadius: '16px', padding: '0', minWidth: '360px', maxWidth: '480px', width: '90%',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(0,200,255,0.05)',
        animation: 'dialogSlideIn 0.25s ease-out',
        overflow: 'hidden',
    },
    header: {
        padding: '1.25rem 1.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
    },
    body: {
        padding: '0 1.5rem 1.25rem', color: '#c0c0d0', fontSize: '0.95rem', lineHeight: '1.6',
    },
    footer: {
        padding: '0.75rem 1.5rem 1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem',
    },
    input: {
        width: '100%', padding: '0.75rem 1rem', borderRadius: '8px',
        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.3)',
        color: '#fff', fontSize: '0.95rem', outline: 'none', marginTop: '0.75rem',
        transition: 'border-color 0.2s',
    },
};

const iconMap = {
    success: { icon: CheckCircle2, color: '#00ff88', glow: 'rgba(0,255,136,0.15)' },
    error: { icon: XCircle, color: '#ff4444', glow: 'rgba(255,68,68,0.15)' },
    warning: { icon: AlertTriangle, color: '#ffaa00', glow: 'rgba(255,170,0,0.15)' },
    info: { icon: Info, color: '#00ccff', glow: 'rgba(0,204,255,0.15)' },
    danger: { icon: AlertTriangle, color: '#ff4444', glow: 'rgba(255,68,68,0.15)' },
};

const getPriorityBadge = (priority) => {
    if (!priority || priority <= 0) return null;
    if (priority >= 9999) return <span className="priority-badge priority-badge-manual"><Star size={12} /> UPLOAD</span>;
    if (priority >= 5000) return <span className="priority-badge priority-badge-demand"><Activity size={12} /> DEMANDA</span>;
    if (priority >= 3000) return <span className="priority-badge priority-badge-today"><Sparkles size={12} /> NOVOS HOJE</span>;
    if (priority >= 2000) return <span className="priority-badge priority-badge-max"><Star size={12} /> PRIORIDADE MAX</span>;
    if (priority >= 999) return <span className="priority-badge priority-badge-audit"><AlertTriangle size={12} /> RE-UPLOAD</span>;
    return <span className="priority-badge"><Star size={12} /> PRIORIDADE</span>;
};

const btnBase = {
    padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none',
    cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem',
    transition: 'all 0.15s ease', letterSpacing: '0.02em',
};

const CustomDialog = ({ config, onClose }) => {
    const [inputValue, setInputValue] = useState(config.defaultValue || '');
    const inputRef = useRef(null);

    useEffect(() => {
        if (config.type === 'prompt' && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [config.type]);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose(config.type === 'prompt' ? null : false);
            if (e.key === 'Enter' && config.type !== 'prompt') onClose(true);
            if (e.key === 'Enter' && config.type === 'prompt') onClose(inputValue);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [inputValue]);

    if (!config) return null;

    const variant = config.variant || 'info';
    const { icon: IconComp, color, glow } = iconMap[variant] || iconMap.info;

    return (
        <div style={dialogStyles.overlay} onClick={() => onClose(config.type === 'prompt' ? null : false)}>
            <style>{`
                @keyframes dialogFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes dialogSlideIn { from { opacity: 0; transform: scale(0.92) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                .zoro-dialog-btn:hover { filter: brightness(1.15); transform: translateY(-1px); }
                .zoro-dialog-btn:active { transform: translateY(0px); filter: brightness(0.95); }
                .zoro-dialog-input:focus { border-color: ${color} !important; box-shadow: 0 0 0 3px ${glow}; }
            `}</style>
            <div style={dialogStyles.container} onClick={(e) => e.stopPropagation()}>
                <div style={dialogStyles.header}>
                    <div style={{ width: 40, height: 40, borderRadius: '10px', background: glow, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <IconComp size={22} color={color} />
                    </div>
                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1.05rem', fontWeight: 600 }}>
                        {config.title || (variant === 'success' ? 'Sucesso' : variant === 'error' ? 'Erro' : variant === 'warning' ? 'Atenção' : variant === 'danger' ? 'Cuidado' : 'Informação')}
                    </h3>
                </div>
                <div style={dialogStyles.body}>
                    <p style={{ margin: 0 }}>{config.message}</p>
                    {config.type === 'prompt' && (
                        <input
                            ref={inputRef}
                            className="zoro-dialog-input"
                            style={dialogStyles.input}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={config.placeholder || ''}
                        />
                    )}
                </div>
                <div style={dialogStyles.footer}>
                    {config.type === 'alert' && (
                        <button className="zoro-dialog-btn" onClick={() => onClose(true)} style={{ ...btnBase, background: color, color: variant === 'warning' || variant === 'success' ? '#000' : '#fff' }}>
                            Entendi
                        </button>
                    )}
                    {config.type === 'confirm' && (
                        <>
                            <button className="zoro-dialog-btn" onClick={() => onClose(false)} style={{ ...btnBase, background: 'rgba(255,255,255,0.06)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)' }}>
                                Cancelar
                            </button>
                            <button className="zoro-dialog-btn" onClick={() => onClose(true)} style={{ ...btnBase, background: color, color: variant === 'warning' || variant === 'success' ? '#000' : '#fff' }}>
                                {config.confirmText || 'Confirmar'}
                            </button>
                        </>
                    )}
                    {config.type === 'prompt' && (
                        <>
                            <button className="zoro-dialog-btn" onClick={() => onClose(null)} style={{ ...btnBase, background: 'rgba(255,255,255,0.06)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)' }}>
                                Cancelar
                            </button>
                            <button className="zoro-dialog-btn" onClick={() => onClose(inputValue)} style={{ ...btnBase, background: color, color: variant === 'warning' || variant === 'success' ? '#000' : '#fff' }}>
                                {config.confirmText || 'Salvar'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

function useDialog() {
    const [dialogConfig, setDialogConfig] = useState(null);
    const resolverRef = useRef(null);

    const showDialog = useCallback((config) => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setDialogConfig(config);
        });
    }, []);

    const handleClose = useCallback((result) => {
        setDialogConfig(null);
        if (resolverRef.current) {
            resolverRef.current(result);
            resolverRef.current = null;
        }
    }, []);

    const alert = useCallback((message, opts = {}) => {
        return showDialog({ type: 'alert', message, ...opts });
    }, [showDialog]);

    const confirm = useCallback((message, opts = {}) => {
        return showDialog({ type: 'confirm', message, ...opts });
    }, [showDialog]);

    const prompt = useCallback((message, defaultValue = '', opts = {}) => {
        return showDialog({ type: 'prompt', message, defaultValue, ...opts });
    }, [showDialog]);

    const DialogPortal = dialogConfig ? <CustomDialog config={dialogConfig} onClose={handleClose} /> : null;

    return { alert, confirm, prompt, DialogPortal };
}

const FullListModal = ({ isOpen, onClose, filter, searchQuery, sortSize, deleteItem, prioritizeItem, editItem, skipItem, formatBytes, fetchQueueParent }) => {
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        if (!isOpen) return;
        setItems([]);
        setPage(1);
        setHasMore(true);
        fetchData(1);
    }, [isOpen, filter, searchQuery, sortSize]);

    const fetchData = async (pageNum) => {
        if (loading) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/sync/queue?filter=${filter}&search=${encodeURIComponent(searchQuery)}&sortSize=${sortSize}&page=${pageNum}&limit=30`);
            if (res.ok) {
                const data = await res.json();
                if (pageNum === 1) setItems(data.items || []);
                else setItems(prev => [...prev, ...(data.items || [])]);
                if (pageNum >= data.totalPages || data.items.length === 0) setHasMore(false);
            }
        } catch(e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleScroll = (e) => {
        const { scrollTop, clientHeight, scrollHeight } = e.target;
        if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !loading) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchData(nextPage);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ width: '95%', maxWidth: '1200px', height: '90%', backgroundColor: '#1a1a1a', borderRadius: '8px', display: 'flex', flexDirection: 'column', border: '1px solid #333' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, color: '#fff' }}>Lista Completa (Filtro: {filter})</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><X size={30} /></button>
                </div>
                
                <div onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    <table className="glass-table">
                        <thead>
                            <tr>
                                <th style={{ width: '80px' }}>ID</th>
                                <th>Título</th>
                                <th style={{ width: '150px' }}>Status</th>
                                <th style={{ width: '120px' }}>Tamanho</th>
                                <th style={{ width: '120px', textAlign: 'center' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item.id} className="glass-row">
                                    <td style={{ color: '#888', fontSize: '0.9rem' }}>#{item.id}</td>
                                    <td style={{ fontWeight: '500' }}>
                                        {getPriorityBadge(item.priority)}
                                        {item.title}
                                    </td>
                                    <td>
                                        <span style={{ 
                                            padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem',
                                            backgroundColor: item.status === 'completed' ? '#00ff8822' : 
                                                            item.status === 'error' ? '#ff444422' : 
                                                            item.status === 'skipped' ? '#ffaa0022' : '#ffffff22',
                                            color: item.status === 'completed' ? '#00ff88' : 
                                                   item.status === 'error' ? '#ff4444' : 
                                                   item.status === 'skipped' ? '#ffaa00' : '#fff'
                                        }}>
                                            {item.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ color: '#888' }}>{formatBytes(item.file_size)}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {(item.status === 'pending' || item.status === 'error') && (
                                            <button 
                                                onClick={async () => { await prioritizeItem(item); fetchData(1); fetchQueueParent(); }}
                                                title="Furar Fila"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ffff00', marginRight: '0.5rem' }}
                                            >
                                                <ChevronsUp size={20} />
                                            </button>
                                        )}
                                        <button 
                                            onClick={async () => { await deleteItem(item); fetchData(1); fetchQueueParent(); }}
                                            title="Apagar"
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff4444' }}
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {loading && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: '#888' }}>Carregando...</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default function AdminSync() {
    const [state, setState] = useState({ isRunning: false, isPaused: false, downloadTask: null, uploadTaskDocker: null, uploadTaskPython: null });
    const [hybridWorkers, setHybridWorkers] = useState({});
    const [socket, setSocket] = useState(null);
    const [queue, setQueue] = useState({ items: [], pending: 0, completed: 0, total: 0, error: null, skipped: 0, error_count: 0, prioritized_count: 0, total_size_saved: 0, completed_today: 0, added_today: 0 });
    const [filter, setFilter] = useState('all');
    const [syncSubTab, setSyncSubTab] = useState('queue'); // 'queue' | 'workers' | 'iptv_source' | 'audit'
    const [searchQuery, setSearchQuery] = useState('');
    const [sortSize, setSortSize] = useState(''); // '' | 'asc' | 'desc'
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    
    const [mappingStats, setMappingStats] = useState({
        totalCached: 0,
        totalMovies: 0,
        totalSeries: 0,
        totalDrivePosters: 0,
        totalDriveBackdrops: 0,
        totalEpisodes: 0,
        totalDriveStills: 0
    });
    const dialog = useDialog();
    
    const filterRef = useRef(filter);
    const searchRef = useRef(searchQuery);
    const sortRef = useRef(sortSize);

    const fetchMappingStats = async () => {
        try {
            const res = await fetch('/api/admin/mapping-stats');
            if (res.ok) {
                const data = await res.json();
                setMappingStats(data);
            }
        } catch (e) {}
    };

    useEffect(() => {
        fetchMappingStats();
        const interval = setInterval(fetchMappingStats, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        filterRef.current = filter;
        searchRef.current = searchQuery;
        sortRef.current = sortSize;
    }, [filter, searchQuery, sortSize]);

    const fetchCounterRef = useRef(0);

    const fetchQueue = async (currentFilter = filterRef.current, currentSearch = searchRef.current, currentSort = sortRef.current) => {
        const currentFetchId = ++fetchCounterRef.current;
        try {
            const res = await fetch(`/api/sync/queue?filter=${currentFilter}&search=${encodeURIComponent(currentSearch)}&sortSize=${currentSort}`);
            const data = await res.json();
            
            // Ignora a resposta se um fetch mais recente já foi disparado
            if (currentFetchId !== fetchCounterRef.current) return;

            if (res.ok) {
                setQueue(data);
            } else {
                setQueue({ items: [], pending: 0, completed: 0, total: 0, error: data.error });
            }
        } catch (e) {
            if (currentFetchId === fetchCounterRef.current) {
                setQueue({ items: [], pending: 0, completed: 0, total: 0, error: 'Erro de conexão' });
            }
        }
    };

    useEffect(() => {
        // Conecta ao WebSocket na mesma URL
        const newSocket = io({ path: '/socket.io' });
        
        newSocket.on('sync_state', (data) => {
            setState(prev => {
                // Só atualiza a fila no banco de dados se houver mudança de ID de tarefa (evita flood de 10 requests por segundo pelo progresso)
                if (
                    prev.downloadTask?.dbId !== data.downloadTask?.dbId ||
                    prev.uploadTaskDocker?.dbId !== data.uploadTaskDocker?.dbId ||
                    prev.uploadTaskPython?.dbId !== data.uploadTaskPython?.dbId
                ) {
                    fetchQueue(filterRef.current, searchRef.current, sortRef.current);
                }
                return data;
            });
        });

        newSocket.on('hybrid_worker_state', (data) => {
            setHybridWorkers(data);
        });

        setSocket(newSocket);
        fetchQueue();

        const autoRefreshInterval = setInterval(() => {
            fetchQueue(filterRef.current, searchRef.current, sortRef.current);
        }, 10000);

        return () => {
            newSocket.close();
            clearInterval(autoRefreshInterval);
        };
    }, []);

    const startScan = async () => {
        try {
            const res = await fetch('/api/sync/scan', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                dialog.alert(`Varredura iniciada! ${data.totalFound} encontrados.`, { variant: 'success', title: 'Varredura Concluída' });
                fetchQueue();
            } else {
                dialog.alert(data.error || 'Erro ao iniciar scan', { variant: 'error', title: 'Falha na Varredura' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao iniciar scan', { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const [m3uUrlInput, setM3uUrlInput] = useState('http://offthesun.net/get.php?username=D2YMmy&password=ZKAhFW&type=m3u_plus&output=ts');
    const [isSavingM3u, setIsSavingM3u] = useState(false);

    const fetchM3uUrl = async () => {
        try {
            const res = await fetch('/api/sync/m3u-url');
            const data = await res.json();
            if (data.m3uUrl) setM3uUrlInput(data.m3uUrl);
        } catch (e) {}
    };

    useEffect(() => {
        fetchM3uUrl();
    }, []);

    const saveM3uUrl = async () => {
        if (!m3uUrlInput || !m3uUrlInput.trim()) {
            dialog.alert('Informe uma URL do M3U válida.', { variant: 'error', title: 'URL Inválida' });
            return;
        }
        setIsSavingM3u(true);
        try {
            const res = await fetch('/api/sync/m3u-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ m3uUrl: m3uUrlInput.trim() })
            });
            const data = await res.json();
            if (res.ok) {
                dialog.alert('URL da IPTV atualizada e salva com sucesso!', { variant: 'success', title: 'Configuração Salva' });
            } else {
                dialog.alert(data.error || 'Erro ao salvar URL', { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao salvar URL', { variant: 'error', title: 'Erro de Conexão' });
        } finally {
            setIsSavingM3u(false);
        }
    };

    const startRemoteScan = async () => {
        try {
            dialog.alert('Baixando e processando lista remotamente... isso pode demorar alguns segundos.', { variant: 'info', title: 'Processando...' });
            const res = await fetch('/api/sync/fetch-remote-m3u', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ m3uUrl: m3uUrlInput })
            });
            const data = await res.json();
            if (res.ok) {
                dialog.alert(`Varredura remota concluída! ${data.totalFound} encontrados, ${data.inserted} novos adicionados.`, { variant: 'success', title: 'Catálogo Atualizado' });
                fetchQueue();
            } else {
                dialog.alert(data.error || 'Erro ao iniciar scan remoto', { variant: 'error', title: 'Falha no Scan Remoto' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao iniciar scan remoto', { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const toggleWorker = async (pause) => {
        const endpoint = pause ? '/api/sync/pause' : '/api/sync/resume';
        await fetch(endpoint, { method: 'POST' });
        fetchQueue();
    };

    const deleteItem = async (item) => {
        const warning = item.telegram_message_id 
            ? "Deseja apagar este item? Como ele já foi enviado, ele TAMBÉM SERÁ APAGADO DO TELEGRAM." 
            : "Deseja apagar este item do histórico? Isso fará o sistema baixá-lo novamente.";
        
        const ok = await dialog.confirm(warning, { 
            variant: 'danger', 
            title: item.telegram_message_id ? '⚠️ Apagar do Telegram' : 'Apagar Item',
            confirmText: 'Sim, Apagar'
        });
        if (!ok) return;
        
        await fetch(`/api/sync/queue/${item.id}`, { method: 'DELETE' });
        fetchQueue();
    };

    const prioritizeItem = async (item) => {
        try {
            const res = await fetch(`/api/sync/queue/${item.id}/prioritize`, { method: 'POST' });
            if (res.ok) {
                fetchQueue();
            } else {
                dialog.alert("Erro ao priorizar o item", { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao priorizar item', { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const unprioritizeItem = async (item) => {
        try {
            const res = await fetch(`/api/sync/queue/${item.id}/unprioritize`, { method: 'POST' });
            if (res.ok) {
                fetchQueue();
            } else {
                dialog.alert("Erro ao remover prioridade do item", { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao remover prioridade', { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const prioritizeSeries = async () => {
        const seriesName = await dialog.prompt("Digite o nome da série para priorizar TODOS os seus episódios (ex: Castle, Alucinação):", "", { 
            variant: 'info', title: '⭐ Priorizar Série Inteira', confirmText: 'Priorizar Série', placeholder: 'Nome da série...' 
        });
        if (!seriesName || !seriesName.trim()) return;
        try {
            const res = await fetch('/api/sync/queue/prioritize-series', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seriesName })
            });
            if (res.ok) {
                const data = await res.json();
                dialog.alert(data.message || `${data.updated} episódios priorizados com sucesso!`, { variant: 'success', title: 'Série Priorizada!' });
                fetchQueue();
            } else {
                dialog.alert("Erro ao priorizar série", { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao priorizar série', { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const prioritizeFiltered = async () => {
        const ok = await dialog.confirm("Deseja priorizar TODOS os itens pendentes listados atualmente na busca/filtro?", { 
            variant: 'warning', title: 'Priorizar em Lote', confirmText: 'Priorizar Todos' 
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/sync/queue/prioritize-batch`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filter: filterRef.current, search: searchRef.current })
            });
            if (res.ok) {
                const data = await res.json();
                dialog.alert(`${data.updated} itens priorizados com sucesso!`, { variant: 'success', title: 'Priorizados!' });
                fetchQueue();
            } else {
                dialog.alert("Erro ao priorizar em lote", { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao priorizar em lote', { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const clearPriorities = async () => {
        const ok = await dialog.confirm("Deseja ZERAR a prioridade de TODOS os itens priorizados?", { 
            variant: 'warning', title: 'Limpar Prioridades', confirmText: 'Zerar Todas' 
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/sync/queue/clear-priorities`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                dialog.alert(`${data.updated} prioridades removidas!`, { variant: 'success', title: 'Prioridades Limpas' });
                fetchQueue();
            } else {
                dialog.alert("Erro ao limpar prioridades", { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao limpar prioridades', { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const skip24hChannels = async () => {
        const ok = await dialog.confirm("Deseja marcar como ignorados (pular) TODOS os canais de TV ao vivo [24H] que estão na fila de pendentes/erros?", { 
            variant: 'warning', title: 'Pular Canais 24H', confirmText: 'Pular Canais [24H]' 
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/sync/queue/skip-24h-channels`, { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                dialog.alert(data.message || `${data.skipped} canais [24H] pulados com sucesso!`, { variant: 'success', title: 'Canais Pulados' });
                fetchQueue();
            } else {
                dialog.alert("Erro ao pular canais 24h", { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao pular canais', { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const editItem = async (item) => {
        const newTitle = await dialog.prompt("Digite o novo título para este filme:", item.title, { 
            variant: 'info', title: 'Editar Título', confirmText: 'Salvar', placeholder: 'Novo título...' 
        });
        if (!newTitle || newTitle === item.title) return;

        const warning = item.telegram_message_id 
            ? "Este item já foi enviado. Ao editar o título aqui, a LEGENDA DO TELEGRAM também será alterada em tempo real. Continuar?" 
            : "Deseja alterar o título na fila de sincronização?";
        
        const ok = await dialog.confirm(warning, { 
            variant: item.telegram_message_id ? 'warning' : 'info', 
            title: 'Confirmar Edição',
            confirmText: 'Alterar'
        });
        if (!ok) return;

        try {
            const res = await fetch(`/api/sync/queue/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            if (res.ok) {
                fetchQueue();
            } else {
                dialog.alert("Erro ao editar o título.", { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert("Erro de conexão ao editar.", { variant: 'error', title: 'Erro de Conexão' });
        }
    };

    const retryErrors = async () => {
        const ok = await dialog.confirm("Deseja colocar todos os itens com 'Erro' de volta na fila pendente?", { 
            variant: 'warning', title: 'Reprocessar Erros', confirmText: 'Sim, Reprocessar' 
        });
        if (!ok) return;
        await fetch('/api/sync/retry-errors', { method: 'POST' });
        fetchQueue();
    };

    const skipItem = async (item) => {
        const ok = await dialog.confirm("Deseja ignorar este item? O worker não tentará baixá-lo novamente.", { 
            variant: 'warning', title: 'Ignorar Item', confirmText: 'Sim, Ignorar' 
        });
        if (!ok) return;
        await fetch(`/api/sync/queue/${item.id}/skip`, { method: 'PUT' });
        fetchQueue();
    };

    const handleExport = () => {
        window.open('/api/sync/export', '_blank');
    };

    const clearPending = async () => {
        const ok = await dialog.confirm("Deseja apagar TODOS os itens pendentes da fila? Isso não afetará os concluídos ou com erro.", { 
            variant: 'danger', title: 'Limpar Pendentes', confirmText: 'Apagar Todos' 
        });
        if (!ok) return;
        await fetch('/api/sync/queue/pending/clear', { method: 'DELETE' });
        fetchQueue();
    };

    const cleanupDuplicates = async () => {
        const ok = await dialog.confirm("Deseja remover da fila de download os itens pendentes que já possuem um vídeo concluído com o mesmo nome?", { 
            variant: 'info', title: 'Remover Duplicados', confirmText: 'Sim, Limpar' 
        });
        if (!ok) return;
        const res = await fetch('/api/sync/queue/pending/cleanup_duplicates', { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            dialog.alert(`Foram removidos ${data.removed} filmes/séries duplicados da fila de downloads!`, { variant: 'success', title: 'Duplicados Removidos' });
            fetchQueue();
        } else {
            dialog.alert('Erro ao limpar duplicados', { variant: 'error', title: 'Erro' });
        }
    };

    const cleanM3UTitles = async () => {
        const ok = await dialog.confirm("Deseja verificar e limpar títulos sujos importados do M3U no banco de dados?", { 
            variant: 'info', title: 'Limpar Títulos M3U', confirmText: 'Sim, Limpar' 
        });
        if (!ok) return;
        const res = await fetch('/api/sync/queue/clean-m3u-titles', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            dialog.alert(data.message, { variant: 'success', title: 'Títulos Limpos' });
            fetchQueue();
        } else {
            dialog.alert('Erro ao limpar títulos M3U.', { variant: 'error', title: 'Erro' });
        }
    };

    const [isRemapping, setIsRemapping] = useState(false);
    const [isCleaningTG, setIsCleaningTG] = useState(false);
    const [isCleaningBroken, setIsCleaningBroken] = useState(false);

    const deleteTelegramBroken = async () => {
        const ok = await dialog.confirm("Deseja APAGAR do canal do Telegram todas as mensagens de vídeos corrompidos (< 5MB)? Os conteúdos normais/válidos NÃO serão afetados.", { 
            variant: 'danger', title: 'Apagar Vídeos Corrompidos do Telegram', confirmText: 'Sim, Apagar Corrompidos' 
        });
        if (!ok) return;
        setIsCleaningBroken(true);
        try {
            const res = await fetch('/api/sync/queue/delete-telegram-broken', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                dialog.alert(data.message || `Apagados ${data.deletedTelegramCount} vídeos corrompidos do Telegram!`, { 
                    variant: 'success', title: 'Limpeza Concluída' 
                });
                fetchQueue();
            } else {
                dialog.alert(data.error || 'Erro ao apagar vídeos corrompidos do Telegram', { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão ao limpar vídeos corrompidos', { variant: 'error', title: 'Erro de Conexão' });
        } finally {
            setIsCleaningBroken(false);
        }
    };
    
    // === AUDIT STATE ===
    const [auditState, setAuditState] = useState({ isRunning: false, isPaused: false, progress: 0, total: 0, currentIndex: 0, currentItem: null, results: { passed: 0, failed: 0, failedItems: [] } });
    const auditPollRef = useRef(null);

    const pollAuditState = () => {
        if (auditPollRef.current) clearInterval(auditPollRef.current);
        auditPollRef.current = setInterval(async () => {
            try {
                const res = await fetch('/api/audit/state');
                const data = await res.json();
                setAuditState(data);
                if (!data.isRunning && data.progress >= 100) {
                    clearInterval(auditPollRef.current);
                    auditPollRef.current = null;
                }
            } catch (e) {}
        }, 2000);
    };

    const startAudit = async () => {
        const ok = await dialog.confirm('Isso vai verificar TODOS os vídeos completos no Telegram para encontrar os que NÃO possuem Fast Start (otimização web). Pode demorar bastante. Deseja iniciar?', {
            variant: 'warning', title: 'Auditoria Fast Start', confirmText: 'Iniciar Auditoria'
        });
        if (!ok) return;
        try {
            const res = await fetch('/api/audit/start', { method: 'POST' });
            if (res.ok) {
                dialog.alert('Auditoria iniciada! Acompanhe o progresso aqui embaixo.', { variant: 'success', title: 'Iniciado' });
                pollAuditState();
            } else {
                const data = await res.json();
                dialog.alert(data.error || 'Erro ao iniciar', { variant: 'error', title: 'Erro' });
            }
        } catch (e) {
            dialog.alert('Erro de conexão', { variant: 'error', title: 'Erro' });
        }
    };

    const stopAudit = async () => {
        await fetch('/api/audit/stop', { method: 'POST' });
        if (auditPollRef.current) { clearInterval(auditPollRef.current); auditPollRef.current = null; }
        setAuditState(prev => ({ ...prev, isRunning: false }));
    };

    const reuploadAuditItems = async (ids) => {
        const ok = await dialog.confirm(`Deseja re-enviar ${ids.length} vídeo(s) para a fila de upload com prioridade alta?`, {
            variant: 'warning', title: 'Re-Upload', confirmText: 'Re-enviar'
        });
        if (!ok) return;
        try {
            const res = await fetch('/api/audit/reupload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            if (res.ok) {
                dialog.alert(`${ids.length} vídeo(s) enviados para a fila!`, { variant: 'success', title: 'Sucesso' });
                setAuditState(prev => ({
                    ...prev,
                    results: {
                        ...prev.results,
                        failedItems: prev.results.failedItems.filter(i => !ids.includes(i.id)),
                        failed: prev.results.failed - ids.length
                    }
                }));
                fetchQueue();
            }
        } catch (e) {
            dialog.alert('Erro de conexão', { variant: 'error', title: 'Erro' });
        }
    };
    // --- VÍDEOS REPORTADOS PELO PLAYER ---
    const [reportedVideos, setReportedVideos] = useState([]);
    
    const fetchReportedVideos = async () => {
        try {
            const res = await fetch('/api/audit/reported');
            const data = await res.json();
            if (data.items) setReportedVideos(data.items);
        } catch (e) {}
    };

    const reuploadReportedItems = async (ids) => {
        const ok = await dialog.confirm(`Deseja re-enviar ${ids.length} vídeo(s) reportado(s) para a fila de upload com prioridade alta?`, {
            variant: 'warning', title: 'Re-Upload (Reportados)', confirmText: 'Re-enviar'
        });
        if (!ok) return;
        try {
            const res = await fetch('/api/audit/reupload-reported', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            if (res.ok) {
                dialog.alert(`${ids.length} vídeo(s) enviados para a fila!`, { variant: 'success', title: 'Sucesso' });
                fetchReportedVideos();
                fetchQueue();
            }
        } catch (e) {
            dialog.alert('Erro de conexão', { variant: 'error', title: 'Erro' });
        }
    };

    const dismissReportedItem = async (id) => {
        try {
            await fetch('/api/audit/dismiss-reported', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            fetchReportedVideos();
        } catch (e) {}
    };
    // Carrega estado da auditoria ao montar (caso ela esteja rodando)
    useEffect(() => {
        fetch('/api/audit/state').then(r => r.json()).then(data => {
            setAuditState(data);
            if (data.isRunning) pollAuditState();
        }).catch(() => {});
        
        fetchReportedVideos(); // Carrega os reportados
        
        return () => { if (auditPollRef.current) clearInterval(auditPollRef.current); };
    }, []);
    // === END AUDIT ===

    const remapTelegram = async () => {
        const ok = await dialog.confirm('Isso vai ler TODAS as mensagens do seu canal do Telegram e recriar as entradas no banco de dados. Deseja continuar?', { 
            variant: 'warning', title: 'Remapear Telegram', confirmText: 'Iniciar Remap' 
        });
        if (!ok) return;
        setIsRemapping(true);
        try {
            const res = await fetch('/api/sync/remap-telegram', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                dialog.alert('Remapeamento iniciado! Acompanhe o progresso no log do servidor (pm2 logs). A página irá atualizar em 30 segundos.', { variant: 'success', title: 'Remap Iniciado' });
                setTimeout(() => { fetchQueue(); setIsRemapping(false); }, 30000);
            } else {
                dialog.alert(data.error || 'Erro ao iniciar remapeamento', { variant: 'error', title: 'Erro' });
                setIsRemapping(false);
            }
        } catch (e) {
            dialog.alert('Erro de rede ao iniciar remapeamento', { variant: 'error', title: 'Erro de Conexão' });
            setIsRemapping(false);
        }
    };

    const cleanupTelegramDuplicates = async () => {
        const ok = await dialog.confirm('Isso vai APAGAR do canal do Telegram os vídeos duplicados (mantendo o mais recente de cada título) e remover do banco. Deseja continuar?', { 
            variant: 'danger', title: 'Limpar Duplicados do Telegram', confirmText: 'Sim, Apagar Duplicados' 
        });
        if (!ok) return;
        setIsCleaningTG(true);
        try {
            const res = await fetch('/api/sync/cleanup-telegram-duplicates', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                if (data.deleted === 0 && !data.deleting) {
                    dialog.alert(data.message || 'Nenhum duplicado encontrado!', { variant: 'info', title: 'Tudo Limpo' });
                    setIsCleaningTG(false);
                } else {
                    dialog.alert(data.message || `Apagando ${data.deleting} duplicados em background...`, { variant: 'success', title: 'Limpeza Iniciada' });
                    setTimeout(() => { fetchQueue(); setIsCleaningTG(false); }, 15000);
                }
            } else {
                dialog.alert(data.error || 'Erro ao limpar duplicados do Telegram', { variant: 'error', title: 'Erro' });
                setIsCleaningTG(false);
            }
        } catch (e) {
            dialog.alert('Erro de rede ao limpar duplicados do Telegram', { variant: 'error', title: 'Erro de Conexão' });
            setIsCleaningTG(false);
        }
    };

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div style={{ padding: '2rem', color: '#fff', position: 'relative' }}>
            <style>{`
                @keyframes pulseGreen {
                    0% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0.4); }
                    70% { box-shadow: 0 0 0 6px rgba(0, 255, 136, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(0, 255, 136, 0); }
                }
                .live-indicator {
                    width: 10px;
                    height: 10px;
                    background-color: #00ff88;
                    border-radius: 50%;
                    animation: pulseGreen 2s infinite;
                    display: inline-block;
                }
                .glass-table {
                    width: 100%;
                    min-width: 700px;
                    border-collapse: separate;
                    border-spacing: 0 8px;
                }
                .glass-table th {
                    background: rgba(0, 0, 0, 0.4);
                    color: #888;
                    font-weight: 600;
                    text-transform: uppercase;
                    font-size: 0.85rem;
                    padding: 1rem;
                    text-align: left;
                    border-top: 1px solid rgba(255,255,255,0.05);
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .glass-table th:first-child { border-left: 1px solid rgba(255,255,255,0.05); border-radius: 8px 0 0 8px; }
                .glass-table th:last-child { border-right: 1px solid rgba(255,255,255,0.05); border-radius: 0 8px 8px 0; }
                
                .glass-row {
                    background: rgba(255, 255, 255, 0.03);
                    transition: all 0.2s;
                }
                .glass-row:hover {
                    background: rgba(0, 255, 136, 0.05);
                    transform: scale(1.005);
                }
                .glass-row td {
                    padding: 1rem;
                    border-top: 1px solid rgba(255,255,255,0.03);
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                }
                .glass-row td:first-child { border-left: 1px solid rgba(255,255,255,0.03); border-radius: 8px 0 0 8px; }
                .glass-row td:last-child { border-right: 1px solid rgba(255,255,255,0.03); border-radius: 0 8px 8px 0; }
                
                .priority-badge {
                    background: linear-gradient(90deg, rgba(255, 255, 0, 0.2), rgba(255, 255, 0, 0.05));
                    color: #ffff00;
                    border: 1px solid rgba(255, 255, 0, 0.3);
                    padding: 0.2rem 0.6rem;
                    border-radius: 12px;
                    font-size: 0.75rem;
                    font-weight: bold;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.3rem;
                    margin-right: 0.8rem;
                    box-shadow: 0 0 10px rgba(255, 255, 0, 0.1);
                }
                
                .custom-checkbox {
                    width: 18px;
                    height: 18px;
                    accent-color: #00ff88;
                    cursor: pointer;
                }
            `}</style>
            <div className="sync-container">
                <div className="sync-header-wrap">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="sync-header-icon">
                            <HardDriveDownload size={24} color="#00ff88" />
                        </div>
                        <div>
                            <h1 className="sync-header-title">CineGeek Sync</h1>
                            <p style={{ margin: '2px 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>Pipeline Automatizado de Extração & Envio Telegram</p>
                        </div>
                    </div>
                    <span className="sync-live-badge">
                        <div className="live-indicator"></div> WebSocket Conectado
                    </span>
                </div>

                {/* Sub-abas Hierárquicas para Sync (Evita rolar para baixo e organiza funções) */}
                <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    marginBottom: '1.75rem', 
                    background: 'rgba(0,0,0,0.3)', 
                    padding: '0.4rem', 
                    borderRadius: '12px', 
                    border: '1px solid rgba(255,255,255,0.06)',
                    width: 'fit-content',
                    flexWrap: 'wrap'
                }}>
                    <button 
                        onClick={() => setSyncSubTab('queue')}
                        className={`admin-tab-btn ${syncSubTab === 'queue' ? 'active' : ''}`}
                    >
                        <ListFilter size={16} /> Fila & Processamento
                    </button>
                    <button 
                        onClick={() => setSyncSubTab('stats')}
                        className={`admin-tab-btn ${syncSubTab === 'stats' ? 'active' : ''}`}
                    >
                        <Activity size={16} /> Métricas & Catálogo
                    </button>
                    <button 
                        onClick={() => setSyncSubTab('workers')}
                        className={`admin-tab-btn ${syncSubTab === 'workers' ? 'active' : ''}`}
                    >
                        <Server size={16} /> Motores & Workers
                        {state.isRunning && !state.isPaused && <span className="admin-operator-dot" style={{ width: '6px', height: '6px' }}></span>}
                    </button>
                    <button 
                        onClick={() => setSyncSubTab('iptv_source')}
                        className={`admin-tab-btn ${syncSubTab === 'iptv_source' ? 'active' : ''}`}
                    >
                        <Radio size={16} /> Conexão IPTV (M3U)
                    </button>
                    <button 
                        onClick={() => setSyncSubTab('audit')}
                        className={`admin-tab-btn accent-warning ${syncSubTab === 'audit' ? 'active' : ''}`}
                    >
                        <AlertTriangle size={16} /> Auditoria & Correções
                        {reportedVideos.length > 0 && <span className="admin-tab-badge">{reportedVideos.length}</span>}
                    </button>
                </div>

                {/* SUB-ABA: Fila & Processamento */}
                {syncSubTab === 'queue' && (
                    <>
                        {/* Status Rápido dos Workers no Topo da Fila */}
                        <div style={{ 
                            background: '#151d26', 
                            border: '1px solid rgba(255,255,255,0.08)', 
                            borderRadius: '14px', 
                            padding: '1.25rem 1.5rem', 
                            marginBottom: '1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '1rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ 
                                    width: '10px', 
                                    height: '10px', 
                                    borderRadius: '50%', 
                                    background: state.isRunning && !state.isPaused ? '#00ff88' : '#ff4444',
                                    boxShadow: state.isRunning && !state.isPaused ? '0 0 10px #00ff88' : 'none'
                                }} />
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800 }}>Motor do Worker</span>
                                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>
                                        {state.isRunning ? (state.isPaused ? 'Em Pausa' : 'Ativo & Processando') : 'Parado'}
                                    </div>
                                </div>
                            </div>

                            {/* Mini resumo de métricas na barra superior */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                                <div>
                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Pendentes</span>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#e2e8f0' }}>{queue.pending}</div>
                                </div>
                                <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.08)' }}></div>
                                <div>
                                    <span style={{ fontSize: '0.72rem', color: '#facc15', textTransform: 'uppercase', fontWeight: 700 }}>Priorizados</span>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#facc15' }}>{queue.prioritized_count || 0}</div>
                                </div>
                                <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.08)' }}></div>
                                <div>
                                    <span style={{ fontSize: '0.72rem', color: '#00ff88', textTransform: 'uppercase', fontWeight: 700 }}>Concluídos</span>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#00ff88' }}>{queue.completed}</div>
                                </div>
                                <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.08)' }}></div>
                                <div>
                                    <span style={{ fontSize: '0.72rem', color: '#f87171', textTransform: 'uppercase', fontWeight: 700 }}>Erros</span>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f87171' }}>{queue.error_count || 0}</div>
                                </div>
                            </div>

                            {/* Controles rápidos do worker */}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button 
                                    onClick={() => toggleWorker(false)}
                                    disabled={state.isRunning && !state.isPaused}
                                    className="sync-btn-primary"
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', opacity: (state.isRunning && !state.isPaused) ? 0.4 : 1 }}
                                >
                                    <Play size={14} /> Retomar
                                </button>
                                <button 
                                    onClick={() => toggleWorker(true)}
                                    disabled={!state.isRunning || state.isPaused}
                                    className="sync-btn-secondary sync-btn-danger"
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', opacity: (!state.isRunning || state.isPaused) ? 0.4 : 1 }}
                                >
                                    <Pause size={14} /> Pausar
                                </button>
                            </div>
                        </div>

                        {/* Card do que está baixando/enviando agora (se houver atividade) */}
                        {(state.downloadTask || state.uploadTaskDocker || state.uploadTaskPython || Object.keys(hybridWorkers).length > 0) && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                {state.downloadTask && (
                                    <div className="pipeline-card active">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#00d2ff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <HardDriveDownload size={14} /> BAIXANDO IPTV
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: '#fff', fontWeight: 800 }}>
                                                {typeof state.downloadTask.progress === 'number' ? `${state.downloadTask.progress.toFixed(1)}%` : 'Liberando...'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {state.downloadTask.title}
                                        </div>
                                        <div className="pipeline-progress-track">
                                            <div className="pipeline-progress-bar" style={{ width: `${typeof state.downloadTask.progress === 'number' ? state.downloadTask.progress : 100}%`, background: '#00d2ff' }} />
                                        </div>
                                    </div>
                                )}
                                {state.uploadTaskDocker && (
                                    <div className="pipeline-card active">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#00ff88', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Send size={14} /> ENVIANDO TELEGRAM (TURBO)
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: '#fff', fontWeight: 800 }}>
                                                {String(state.uploadTaskDocker.progress || 0).includes('TURBO') ? state.uploadTaskDocker.progress : `${Number(state.uploadTaskDocker.progress || 0).toFixed(1)}%`}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {state.uploadTaskDocker.title}
                                        </div>
                                        <div className="pipeline-progress-track">
                                            <div className="pipeline-progress-bar" style={{ width: typeof state.uploadTaskDocker.progress === 'number' ? `${state.uploadTaskDocker.progress}%` : '100%', background: '#00ff88' }} />
                                        </div>
                                    </div>
                                )}
                                {state.uploadTaskPython && (
                                    <div className="pipeline-card active">
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#a855f7', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Send size={14} /> ENVIANDO TELEGRAM (PYTHON)
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: '#fff', fontWeight: 800 }}>
                                                {Number(state.uploadTaskPython.progress || 0).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {state.uploadTaskPython.title}
                                        </div>
                                        <div className="pipeline-progress-track">
                                            <div className="pipeline-progress-bar" style={{ width: `${Number(state.uploadTaskPython.progress || 0)}%`, background: '#a855f7' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* SUB-ABA: Métricas & Catálogo */}
                {syncSubTab === 'stats' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div className="sync-card">
                            <h3 className="sync-card-title">
                                <Activity size={20} color="#00ff88" /> Estatísticas Globais da Fila
                            </h3>
                            <div className="sync-stat-grid">
                                <div className="sync-stat-item border-pending">
                                    <div className="sync-stat-label" style={{color: '#8c8f96'}}><Clock size={15} /> Pendentes</div>
                                    <div className="sync-stat-value">{queue.pending}</div>
                                </div>
                                <div className="sync-stat-item border-prioritized">
                                    <div className="sync-stat-label" style={{color: '#ffff00'}}><Star size={15} /> Priorizados</div>
                                    <div className="sync-stat-value">{queue.prioritized_count || 0}</div>
                                </div>
                                <div className="sync-stat-item border-completed">
                                    <div className="sync-stat-label" style={{color: '#00ff88'}}><CheckCircle size={15} /> Concluídos</div>
                                    <div className="sync-stat-value">{queue.completed}</div>
                                </div>
                                <div className="sync-stat-item border-errors">
                                    <div className="sync-stat-label" style={{color: '#ff4444'}}><XCircle size={15} /> Erros</div>
                                    <div className="sync-stat-value">{queue.error_count || 0}</div>
                                </div>
                                <div className="sync-stat-item border-skipped">
                                    <div className="sync-stat-label" style={{color: '#ffaa00'}}><SkipForward size={15} /> Ignorados</div>
                                    <div className="sync-stat-value">{queue.skipped || 0}</div>
                                </div>
                                <div className="sync-stat-item border-db">
                                    <div className="sync-stat-label" style={{color: '#00ccff'}}><Database size={15} /> Economia DB</div>
                                    <div className="sync-stat-value">{formatBytes(queue.total_size_saved)}</div>
                                </div>
                                <div className="sync-stat-item border-today">
                                    <div className="sync-stat-label" style={{color: '#ff00ff'}}><Rocket size={15} /> Envios Hoje</div>
                                    <div className="sync-stat-value">{queue.completed_today || 0}</div>
                                </div>
                                <div className="sync-stat-item border-new">
                                    <div className="sync-stat-label" style={{color: '#00D1FF'}}><Sparkles size={15} /> Novos Hoje</div>
                                    <div className="sync-stat-value">{queue.added_today || 0}</div>
                                </div>
                            </div>
                        </div>

                        <div className="sync-card">
                            <h3 className="sync-card-title">
                                <Database size={20} color="#00ccff" /> Catálogo TMDB & Zoro Drive Mapeados
                            </h3>
                            <div className="sync-stat-grid">
                                <div className="sync-stat-item border-db">
                                    <div className="sync-stat-label" style={{color: '#00ccff'}}><Film size={15} /> Filmes & Séries</div>
                                    <div className="sync-stat-value">{mappingStats.totalCached}</div>
                                </div>
                                <div className="sync-stat-item border-prioritized">
                                    <div className="sync-stat-label" style={{color: '#ffcc00'}}><List size={15} /> Fila Mapeada</div>
                                    <div className="sync-stat-value">{mappingStats.queueMapped || 0} / {mappingStats.queueTotal || 0}</div>
                                </div>
                                <div className="sync-stat-item border-completed">
                                    <div className="sync-stat-label" style={{color: '#00ff88'}}><CheckCircle size={15} /> Posters no Drive</div>
                                    <div className="sync-stat-value">{mappingStats.totalDrivePosters}</div>
                                </div>
                                <div className="sync-stat-item border-today">
                                    <div className="sync-stat-label" style={{color: '#ff00ff'}}><Sparkles size={15} /> Backdrops no Drive</div>
                                    <div className="sync-stat-value">{mappingStats.totalDriveBackdrops}</div>
                                </div>
                                <div className="sync-stat-item border-prioritized">
                                    <div className="sync-stat-label" style={{color: '#ffff00'}}><ListFilter size={15} /> Stills de Episódios</div>
                                    <div className="sync-stat-value">{mappingStats.totalDriveStills} / {mappingStats.totalEpisodes}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* SUB-ABA: Motores & Workers */}
                {syncSubTab === 'workers' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div className="sync-card">
                            <h3 className="sync-card-title">
                                <Server size={20} color="#00ff88" /> Controle Geral do Motor
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1.25rem', borderRadius: '12px' }}>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Status de Execução:</span>
                                    <div style={{ marginTop: '4px' }}>
                                        <span className={`worker-status-pill ${state.isRunning ? (state.isPaused ? 'paused' : 'running') : 'stopped'}`}>
                                            {state.isRunning ? (state.isPaused ? 'PAUSADO' : 'RODANDO') : 'PARADO'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button 
                                        onClick={() => toggleWorker(false)}
                                        disabled={state.isRunning && !state.isPaused}
                                        className="sync-btn-primary"
                                        style={{ opacity: (state.isRunning && !state.isPaused) ? 0.5 : 1 }}
                                    >
                                        <Play size={16} /> Iniciar / Retomar
                                    </button>
                                    <button 
                                        onClick={() => toggleWorker(true)}
                                        disabled={!state.isRunning || state.isPaused}
                                        className="sync-btn-secondary sync-btn-danger"
                                        style={{ opacity: (!state.isRunning || state.isPaused) ? 0.5 : 1 }}
                                    >
                                        <Pause size={16} /> Pausar
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Workers em Execução Detalhados */}
                        <div className="sync-card">
                            <h3 className="sync-card-title">
                                <Activity size={20} color="#00ccff" /> Workers Híbridos & Tarefas Atuais
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                                {/* Download Local PC */}
                                <div className="pipeline-card">
                                    <h4 style={{ color: '#00ccff', fontSize: '0.95rem', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <HardDriveDownload size={18} /> Download Local (PC)
                                    </h4>
                                    {Object.entries(hybridWorkers).filter(([_, w]) => w.status === 'Baixando_PC').length > 0 ? (
                                        Object.entries(hybridWorkers).filter(([_, w]) => w.status === 'Baixando_PC').map(([workerId, worker]) => (
                                            <div key={workerId} style={{ marginBottom: '1rem' }}>
                                                <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem' }}>
                                                    #{worker.title || 'Desconhecido'} <span style={{ color: '#00ccff', fontSize: '0.75rem' }}>({workerId})</span>
                                                </div>
                                                <div className="pipeline-progress-track">
                                                    <div className="pipeline-progress-bar" style={{ width: `${Number(worker.progress) || 100}%`, background: '#00ccff' }} />
                                                </div>
                                                <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                                                    {(Number(worker.progress) || 0).toFixed(1)}%
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>Nenhum download ativo no PC.</p>
                                    )}
                                </div>

                                {/* Upload Docker Turbo */}
                                <div className="pipeline-card">
                                    <h4 style={{ color: '#00ff88', fontSize: '0.95rem', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Send size={18} /> Upload Telegram (Docker Turbo)
                                    </h4>
                                    {state.uploadTaskDocker ? (
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem' }}>
                                                #{state.uploadTaskDocker.title || 'Desconhecido'}
                                            </div>
                                            <div className="pipeline-progress-track">
                                                <div className="pipeline-progress-bar" style={{ width: typeof state.uploadTaskDocker.progress === 'number' ? `${state.uploadTaskDocker.progress}%` : '100%', background: '#00ff88' }} />
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                                                {String(state.uploadTaskDocker.progress || 0).includes('TURBO') ? state.uploadTaskDocker.progress : `${Number(state.uploadTaskDocker.progress || 0).toFixed(1)}%`}
                                            </div>
                                        </div>
                                    ) : (
                                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>Aguardando itens menores que 2GB...</p>
                                    )}
                                </div>

                                {/* Upload Python */}
                                <div className="pipeline-card">
                                    <h4 style={{ color: '#a855f7', fontSize: '0.95rem', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Send size={18} /> Upload Telegram (Python Grandes)
                                    </h4>
                                    {state.uploadTaskPython ? (
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: '#fff', fontSize: '0.85rem' }}>
                                                #{state.uploadTaskPython.title || 'Desconhecido'}
                                            </div>
                                            <div className="pipeline-progress-track">
                                                <div className="pipeline-progress-bar" style={{ width: `${Number(state.uploadTaskPython.progress || 0)}%`, background: '#a855f7' }} />
                                            </div>
                                            <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
                                                {(Number(state.uploadTaskPython.progress) || 0).toFixed(1)}%
                                            </div>
                                        </div>
                                    ) : (
                                        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>Aguardando itens gigantes...</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* SUB-ABA: Conexão IPTV (M3U) */}
                {syncSubTab === 'iptv_source' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div className="sync-card">
                            <h3 className="sync-card-title">
                                <Radio size={20} color="#00ff88" /> Servidor & Lista M3U (IPTV)
                            </h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
                                Configure o link oficial fornecido pelo seu provedor de IPTV para baixar o arquivo <code>.m3u_plus</code> e atualizar novos lançamentos.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    value={m3uUrlInput}
                                    onChange={(e) => setM3uUrlInput(e.target.value)}
                                    placeholder="http://servidor-iptv.com/get.php?username=...&password=..."
                                    style={{
                                        flex: '1 1 340px',
                                        background: 'rgba(0, 0, 0, 0.4)',
                                        border: '1px solid rgba(255, 255, 255, 0.12)',
                                        borderRadius: '10px',
                                        padding: '0.75rem 1rem',
                                        color: '#fff',
                                        fontSize: '0.9rem',
                                        outline: 'none'
                                    }}
                                />
                                <button 
                                    onClick={saveM3uUrl} 
                                    disabled={isSavingM3u} 
                                    className="sync-btn-secondary sync-btn-info"
                                >
                                    {isSavingM3u ? 'Salvando...' : '💾 Salvar URL M3U'}
                                </button>
                                <button 
                                    onClick={startRemoteScan} 
                                    className="sync-btn-primary"
                                >
                                    <RefreshCcw size={16} /> Varrer IPTV Agora
                                </button>
                            </div>
                        </div>

                        {/* Operações de Varredura & Limpeza */}
                        <div className="sync-card">
                            <h3 className="sync-card-title">
                                <Database size={20} color="#00d2ff" /> Ações de Catálogo & Banco de Dados
                            </h3>
                            <div className="sync-toolbar" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                                <button onClick={startScan} className="sync-btn-secondary">
                                    <Search size={16} /> Escanear M3U Local
                                </button>
                                <button onClick={retryErrors} className="sync-btn-secondary">
                                    <RefreshCcw size={15} /> Retentar Erros
                                </button>
                                <button onClick={handleExport} className="sync-btn-secondary sync-btn-info">
                                    <Download size={15} /> Exportar Banco (JSON)
                                </button>
                                <button onClick={cleanM3UTitles} className="sync-btn-secondary sync-btn-info">
                                    <Eraser size={15} /> Higienizar Títulos Sujos
                                </button>
                                <button onClick={cleanupDuplicates} className="sync-btn-secondary">
                                    <Eraser size={15} /> Limpar Duplicados na Fila
                                </button>
                                <button onClick={clearPending} className="sync-btn-secondary sync-btn-danger">
                                    <Trash2 size={15} /> Limpar Todos os Pendentes
                                </button>
                                <button onClick={cleanupTelegramDuplicates} disabled={isCleaningTG} className="sync-btn-secondary sync-btn-danger" style={{ opacity: isCleaningTG ? 0.6 : 1 }}>
                                    <Trash2 size={15} /> {isCleaningTG ? 'Limpando...' : 'Apagar Duplicados no Telegram'}
                                </button>
                                <button onClick={deleteTelegramBroken} disabled={isCleaningBroken} className="sync-btn-secondary sync-btn-danger" style={{ opacity: isCleaningBroken ? 0.6 : 1 }}>
                                    <Trash2 size={15} /> {isCleaningBroken ? 'Apagando Corrompidos...' : 'Apagar Corrompidos (<5MB) no Telegram'}
                                </button>
                                <button onClick={remapTelegram} disabled={isRemapping} className="sync-btn-secondary sync-btn-warning" style={{ opacity: isRemapping ? 0.6 : 1 }}>
                                    <Radio size={15} /> {isRemapping ? 'Remapeando...' : 'Remapear Mensagens do Telegram'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* SUB-ABA: Auditoria & Correções */}
                {syncSubTab === 'audit' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
                        {/* Seção de Falhas Reportadas pelo Player */}
                        {reportedVideos.length > 0 && (
                            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.06)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem', color: '#f87171' }}>
                                        <AlertTriangle size={20} color="#f87171" /> Falhas Reportadas pelo Player ({reportedVideos.length})
                                    </h3>
                                    <button onClick={() => reuploadReportedItems(reportedVideos.map(i => i.id))} className="sync-btn-secondary sync-btn-warning">
                                        <RefreshCcw size={15} /> Reupar Todos ({reportedVideos.length})
                                    </button>
                                </div>
                                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                                    Estes vídeos travaram ao rodar no player (provavelmente ausência de Fast Start MOOV atom) e foram sinalizados automaticamente pelos usuários.
                                </p>

                                <div style={{ maxHeight: '300px', overflowY: 'auto', background: 'rgba(0,0,0,0.4)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' }}>Título</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' }}>Tentativas</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase' }}>Ações</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reportedVideos.map(item => (
                                                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#f1f5f9', fontSize: '0.88rem' }}>{item.title}</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#facc15', fontSize: '0.88rem', fontWeight: 'bold' }}>{item.report_count}x</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                                                        <button onClick={() => reuploadReportedItems([item.id])} className="sync-btn-secondary sync-btn-warning" style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}>
                                                            <RefreshCcw size={13} /> Reupar
                                                        </button>
                                                        <button onClick={() => dismissReportedItem(item.id)} title="Ignorar (Falso Positivo)" className="sync-btn-secondary" style={{ padding: '0.35rem 0.6rem' }}>
                                                            <X size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Auditoria Fast Start */}
                        <div className="sync-card">
                            <h3 className="sync-card-title">
                                <Activity size={20} color="#00d2ff" /> Auditoria Fast Start (MOOV Atom)
                            </h3>
                            <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0 0 1.25rem 0', lineHeight: 1.5 }}>
                                Varre os vídeos já hospedados no Telegram para garantir que o cabeçalho Fast Start esteja presente. Sem isso, usuários não conseguem adiantar ou pular o vídeo sem travar.
                            </p>

                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                                {!auditState.isRunning ? (
                                    <button onClick={startAudit} className="sync-btn-secondary sync-btn-info">
                                        <Search size={16} /> Iniciar Auditoria no Telegram
                                    </button>
                                ) : (
                                    <button onClick={stopAudit} className="sync-btn-secondary sync-btn-danger">
                                        <X size={16} /> Parar Auditoria
                                    </button>
                                )}
                                {auditState.results.failedItems.length > 0 && (
                                    <button onClick={() => reuploadAuditItems(auditState.results.failedItems.map(i => i.id))} className="sync-btn-secondary sync-btn-warning">
                                        <RefreshCcw size={16} /> Reupar Vídeos Reprovados ({auditState.results.failedItems.length})
                                    </button>
                                )}
                            </div>

                            {(auditState.isRunning || auditState.progress > 0) && (
                                <div style={{ background: 'rgba(0,0,0,0.35)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '0.6rem' }}>
                                        <span>{auditState.isRunning ? `Verificando: ${auditState.currentItem || '...'}` : 'Varredura Concluída'}</span>
                                        <span>{auditState.currentIndex}/{auditState.total} ({auditState.progress}%)</span>
                                    </div>
                                    <div className="pipeline-progress-track">
                                        <div className="pipeline-progress-bar" style={{ width: `${auditState.progress}%`, background: 'linear-gradient(90deg, #00d2ff, #00ff88)' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '2rem', marginTop: '0.85rem', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                        <span style={{ color: '#00ff88' }}>✅ OK: {auditState.results.passed}</span>
                                        <span style={{ color: '#f87171' }}>❌ Precisam de Re-Upload: {auditState.results.failed}</span>
                                    </div>
                                </div>
                            )}

                            {auditState.results.failedItems.length > 0 && (
                                <div style={{ maxHeight: '280px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.75rem' }}>ID</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.75rem' }}>Título</th>
                                                <th style={{ padding: '0.6rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem' }}>Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditState.results.failedItems.map(item => (
                                                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '0.6rem 1rem', color: '#64748b', fontSize: '0.85rem' }}>#{item.id}</td>
                                                    <td style={{ padding: '0.6rem 1rem', color: '#e2e8f0', fontSize: '0.85rem' }}>{item.title}</td>
                                                    <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                                                        <button onClick={() => reuploadAuditItems([item.id])} className="sync-btn-secondary sync-btn-warning" style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}>
                                                            <RefreshCcw size={12} /> Reupar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* VISÃO DA FILA - EXIBIDA NA SUB-ABA QUEUE */}
                {syncSubTab === 'queue' && (
                    <>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <ListFilter size={20} color="#00ff88" />
                    Fila de Processamento
                </h3>
                
                <div style={{ display: 'flex', gap: '0.6rem', background: 'rgba(0,0,0,0.4)', padding: '0.4rem 0.8rem', borderRadius: '10px', alignItems: 'center', flex: '1', maxWidth: '340px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Search size={16} color="#888" />
                    <input 
                        type="text" 
                        placeholder="Buscar por título ou ID na fila..." 
                        value={searchQuery}
                        onChange={(e) => {
                            const val = e.target.value;
                            setSearchQuery(val);
                            searchRef.current = val;
                            
                            if (window.searchTimeout) clearTimeout(window.searchTimeout);
                            window.searchTimeout = setTimeout(() => {
                                fetchQueue(filter, val, sortSize);
                            }, 400);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                    />
                </div>
            </div>

            {/* Filter Pills and Quick Actions Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button onClick={() => { setFilter('all'); filterRef.current='all'; fetchQueue('all', searchQuery, sortSize); }} className={`admin-tab-btn ${filter === 'all' ? 'active' : ''}`}><ListFilter size={15} /> Todos</button>
                    <button onClick={() => { setFilter('prioritized'); filterRef.current='prioritized'; fetchQueue('prioritized', searchQuery, sortSize); }} className={`admin-tab-btn accent-warning ${filter === 'prioritized' ? 'active' : ''}`}><Star size={15} /> Priorizados</button>
                    <button onClick={() => { setFilter('pending'); filterRef.current='pending'; fetchQueue('pending', searchQuery, sortSize); }} className={`admin-tab-btn ${filter === 'pending' ? 'active' : ''}`}><Clock size={15} /> Pendentes</button>
                    <button onClick={() => { setFilter('completed'); filterRef.current='completed'; fetchQueue('completed', searchQuery, sortSize); }} className={`admin-tab-btn ${filter === 'completed' ? 'active' : ''}`}><CheckCircle size={15} /> Concluídos</button>
                    <button onClick={() => { setFilter('completed_today'); filterRef.current='completed_today'; fetchQueue('completed_today', searchQuery, sortSize); }} className={`admin-tab-btn ${filter === 'completed_today' ? 'active' : ''}`}><Rocket size={15} /> Hoje</button>
                    <button onClick={() => { setFilter('error'); filterRef.current='error'; fetchQueue('error', searchQuery, sortSize); }} className={`admin-tab-btn ${filter === 'error' ? 'active' : ''}`} style={filter === 'error' ? { color: '#ff4444', borderColor: '#ff4444' } : {}}><XCircle size={15} /> Erros</button>
                    <button onClick={() => { setFilter('skipped'); filterRef.current='skipped'; fetchQueue('skipped', searchQuery, sortSize); }} className={`admin-tab-btn ${filter === 'skipped' ? 'active' : ''}`}><SkipForward size={15} /> Ignorados</button>
                    <button onClick={() => { setFilter('new_today'); filterRef.current='new_today'; fetchQueue('new_today', searchQuery, sortSize); }} className={`admin-tab-btn ${filter === 'new_today' ? 'active' : ''}`}><Sparkles size={15} /> Novos</button>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={prioritizeFiltered} className="sync-btn-secondary" style={{ color: '#00ff88', borderColor: 'rgba(0,255,136,0.3)' }}>
                        <ChevronsUp size={15} /> Priorizar Busca
                    </button>
                    <button onClick={prioritizeSeries} className="sync-btn-secondary sync-btn-warning">
                        <Star size={15} /> Priorizar Série
                    </button>
                    <button onClick={skip24hChannels} className="sync-btn-secondary" style={{ color: '#fb923c', borderColor: 'rgba(251,146,60,0.3)' }}>
                        <SkipForward size={15} /> Pular [24H]
                    </button>
                    <button onClick={clearPriorities} className="sync-btn-secondary sync-btn-danger">
                        <Eraser size={15} /> Limpar Prioridades
                    </button>
                </div>
            </div>
            
            <div style={{ backgroundColor: '#1a1a1a', padding: '0.5rem 1rem', borderRadius: '8px', marginBottom: '1rem', color: '#00ff88', fontSize: '0.9rem', display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '0.5rem' }}>👉</span> 
                <strong>Dica no Celular:</strong> Deslize a tabela abaixo para a esquerda para ver os botões de ação (como o ⭐ Priorizar).
            </div>
            
            <div style={{ overflowX: 'auto', borderRadius: '8px' }}>
                <table className="glass-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px', textAlign: 'center' }}>
                                <input 
                                    type="checkbox" 
                                    className="custom-checkbox"
                                    checked={queue.items?.length > 0 && selectedIds.length === queue.items.length}
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedIds(queue.items.map(i => i.id));
                                        else setSelectedIds([]);
                                    }}
                                />
                            </th>
                            <th style={{ width: '80px' }}>ID</th>
                            <th>Título</th>
                            <th style={{ width: '150px' }}>Status</th>
                            <th 
                                style={{ width: '120px', cursor: 'pointer', userSelect: 'none' }}
                                onClick={() => {
                                    const nextSort = sortSize === '' ? 'desc' : (sortSize === 'desc' ? 'asc' : '');
                                    setSortSize(nextSort);
                                    sortRef.current = nextSort;
                                    fetchQueue(filter, searchQuery, nextSort);
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    Tamanho <ArrowDownUp size={14} color={sortSize !== '' ? '#00ff88' : '#888'} />
                                </div>
                            </th>
                            <th style={{ width: '240px', textAlign: 'center' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {queue.error ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '1rem', color: '#ff4444' }}>{queue.error}</td></tr>
                        ) : queue.items && queue.items.length > 0 ? (
                            queue.items.map(item => (
                                <tr key={item.id} className="glass-row">
                                    <td style={{ textAlign: 'center' }}>
                                        <input 
                                            type="checkbox" 
                                            className="custom-checkbox"
                                            checked={selectedIds.includes(item.id)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedIds([...selectedIds, item.id]);
                                                else setSelectedIds(selectedIds.filter(id => id !== item.id));
                                            }}
                                        />
                                    </td>
                                    <td style={{ color: '#888', fontSize: '0.9rem' }}>#{item.id}</td>
                                    <td style={{ fontWeight: '500' }}>
                                        {getPriorityBadge(item.priority)}
                                        {item.title}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{ 
                                            padding: '0.2rem 0.5rem', 
                                            borderRadius: '4px', 
                                            fontSize: '0.8rem',
                                            backgroundColor: item.status === 'completed' ? '#00ff8822' : 
                                                            item.status === 'error' ? '#ff444422' : 
                                                            item.status === 'skipped' ? '#ffaa0022' :
                                                            item.status === 'downloading' ? '#00ccff22' :
                                                            item.status === 'uploading' ? '#ff00ff22' :
                                                            item.status === 'pending_upload' ? '#ffff0022' : '#ffffff22',
                                            color: item.status === 'completed' ? '#00ff88' : 
                                                   item.status === 'error' ? '#ff4444' : 
                                                   item.status === 'skipped' ? '#ffaa00' : 
                                                   item.status === 'downloading' ? '#00ccff' :
                                                   item.status === 'uploading' ? '#ff00ff' :
                                                   item.status === 'pending_upload' ? '#ffff00' : '#fff'
                                        }}>
                                            {item.status.toUpperCase()}
                                        </span>
                                        {item.error_message && <div style={{ fontSize: '0.8rem', color: '#ff4444', marginTop: '0.2rem' }}>{item.error_message}</div>}
                                    </td>
                                    <td style={{ padding: '1rem', color: '#888' }}>
                                        {formatBytes(item.file_size)}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
                                        <button 
                                            onClick={() => editItem(item)}
                                            title="Editar Título"
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#00ccff', marginRight: '0.5rem' }}
                                        >
                                            <Edit size={20} />
                                        </button>
                                        {(item.status === 'pending' || item.status === 'error') && (
                                            <button 
                                                onClick={() => prioritizeItem(item)}
                                                title="Furar Fila (Priorizar Max)"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ffff00', marginRight: '0.5rem' }}
                                            >
                                                <ChevronsUp size={22} />
                                            </button>
                                        )}
                                        {item.priority > 0 && (
                                            <button 
                                                onClick={() => unprioritizeItem(item)}
                                                title="Remover Prioridade (Despriorizar)"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff8800', marginRight: '0.5rem' }}
                                            >
                                                <Eraser size={20} />
                                            </button>
                                        )}
                                        <button 
                                            onClick={async () => {
                                                const ok = await dialog.confirm("Deseja refazer o download deste item? Ele voltará para a fila e a versão antiga no Telegram será apagada.", { variant: 'warning', title: 'Refazer Download', confirmText: 'Refazer' });
                                                if(!ok) return;
                                                await fetch(`/api/sync/queue/${item.id}/retry`, { method: 'POST' });
                                                fetchQueue();
                                            }}
                                            title="Refazer Download"
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#00ff88', marginRight: '0.5rem' }}
                                        >
                                            <RefreshCcw size={20} />
                                        </button>
                                        {item.status !== 'completed' && item.status !== 'skipped' && (
                                            <button 
                                                onClick={() => skipItem(item)}
                                                title="Ignorar/Pular"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ffaa00', marginRight: '0.5rem' }}
                                            >
                                                <SkipForward size={20} />
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => deleteItem(item)}
                                            title="Apagar permanentemente"
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ff4444' }}
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>Nenhuma atividade recente na fila</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Bulk Actions Floating Toolbar */}
            {selectedIds.length > 0 && (
                <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(20, 20, 30, 0.95)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0, 255, 136, 0.3)', padding: '1rem 2rem', borderRadius: '50px', display: 'flex', alignItems: 'center', gap: '2rem', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 255, 136, 0.1)', zIndex: 1000, animation: 'dialogSlideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                        <span style={{ background: '#00ff88', color: '#000', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>{selectedIds.length}</span>
                        <span>Selecionados</span>
                    </div>
                    <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.1)' }}></div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={async () => {
                                const ok = await dialog.confirm(`Priorizar ${selectedIds.length} filmes selecionados?`, { variant: 'warning', title: 'Priorizar em Lote', confirmText: 'Priorizar' });
                                if(!ok) return;
                                await fetch('/api/sync/queue/bulk-prioritize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds }) });
                                setSelectedIds([]);
                                fetchQueue();
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 0, 0.1)', color: '#ffff00', border: '1px solid rgba(255, 255, 0, 0.3)', padding: '0.6rem 1.2rem', borderRadius: '25px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 0, 0.2)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 0, 0.1)'; }}
                        >
                            <Star size={16} /> Priorizar
                        </button>
                        <button 
                            onClick={async () => {
                                const ok = await dialog.confirm(`Remover prioridade de ${selectedIds.length} filmes selecionados?`, { variant: 'warning', title: 'Remover Prioridade em Lote', confirmText: 'Remover' });
                                if(!ok) return;
                                await fetch('/api/sync/queue/bulk-unprioritize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds }) });
                                setSelectedIds([]);
                                fetchQueue();
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 136, 0, 0.1)', color: '#ff8800', border: '1px solid rgba(255, 136, 0, 0.3)', padding: '0.6rem 1.2rem', borderRadius: '25px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 136, 0, 0.2)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 136, 0, 0.1)'; }}
                        >
                            <Eraser size={16} /> Despriorizar
                        </button>
                        <button 
                            onClick={async () => {
                                const ok = await dialog.confirm(`Excluir permanentemente ${selectedIds.length} filmes da fila?`, { variant: 'danger', title: 'Excluir em Lote', confirmText: 'Excluir' });
                                if(!ok) return;
                                await fetch('/api/sync/queue/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds }) });
                                setSelectedIds([]);
                                fetchQueue();
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid rgba(255, 68, 68, 0.3)', padding: '0.6rem 1.2rem', borderRadius: '25px', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 68, 68, 0.2)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)'; }}
                        >
                            <Trash2 size={16} /> Excluir
                        </button>
                        <button 
                            onClick={() => setSelectedIds([])}
                            style={{ background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Cancelar Seleção"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}

            {queue.total > 10 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1rem' }}>
                    <button 
                        onClick={() => setModalOpen(true)}
                        style={{ padding: '0.75rem 2rem', background: '#00ccff', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', width: '100%', maxWidth: '400px' }}
                    >
                        Ver Lista Completa
                    </button>
                </div>
            )}
            </>
            )}
            
            <FullListModal 
                isOpen={modalOpen} 
                onClose={() => setModalOpen(false)} 
                filter={filter} 
                searchQuery={searchQuery} 
                sortSize={sortSize} 
                deleteItem={deleteItem} 
                prioritizeItem={prioritizeItem} 
                editItem={editItem} 
                skipItem={skipItem} 
                formatBytes={formatBytes} 
                fetchQueueParent={fetchQueue}
            />
            {dialog.DialogPortal}
            </div>
        </div>
    );
}
