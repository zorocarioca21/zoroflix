import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Play, Pause, Trash2, Edit, HardDriveDownload, Send, Search, ArrowDownUp, SkipForward, Download, RefreshCcw, Eraser, ChevronsUp, X, Radio, AlertTriangle, CheckCircle2, Info, XCircle, Clock, Star, CheckCircle, Database, Rocket, Sparkles, Check, Server, ListFilter, Activity } from 'lucide-react';

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
                    <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', backgroundColor: '#1a1a1a' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#222' }}>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>ID</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>Título</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>Tamanho</th>
                                <th style={{ padding: '1rem', textAlign: 'center' }}>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ padding: '1rem', color: '#888' }}>#{item.id}</td>
                                    <td style={{ padding: '1rem' }}>
                                        {item.priority > 0 && <span style={{ color: '#ffff00', marginRight: '0.5rem', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center' }}><Star size={14} style={{ marginRight: '0.2rem' }} /> [PRIORIDADE]</span>}
                                        {item.title}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
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
                                    <td style={{ padding: '1rem', color: '#888' }}>{formatBytes(item.file_size)}</td>
                                    <td style={{ padding: '1rem', textAlign: 'center' }}>
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
                            {loading && <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem' }}>Carregando...</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default function AdminSync() {
    const [state, setState] = useState({ isRunning: false, isPaused: false, downloadTask: null, uploadTaskDocker: null, uploadTaskPython: null });
    const [socket, setSocket] = useState(null);
    const [queue, setQueue] = useState({ items: [], pending: 0, completed: 0, total: 0, error: null, skipped: 0, error_count: 0, prioritized_count: 0, total_size_saved: 0, completed_today: 0, added_today: 0 });
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortSize, setSortSize] = useState(''); // '' | 'asc' | 'desc'
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    
    const dialog = useDialog();
    
    const filterRef = useRef(filter);
    const searchRef = useRef(searchQuery);
    const sortRef = useRef(sortSize);

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

    const startRemoteScan = async () => {
        try {
            dialog.alert('Baixando e processando lista remotamente... isso pode demorar alguns segundos.', { variant: 'info', title: 'Processando...' });
            const res = await fetch('/api/sync/fetch-remote-m3u', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ m3uUrl: 'https://kixar.xyz/get.php?username=zorocarioca21&password=rf1st91a&type=m3u_plus&output=ts' })
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <HardDriveDownload size={32} color="#00ff88" />
                    CineGeek Sync
                    <span style={{ fontSize: '0.9rem', color: '#888', display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.8rem', borderRadius: '20px' }}>
                        <div className="live-indicator"></div> Ao Vivo
                    </span>
                </h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ backgroundColor: 'rgba(0, 255, 136, 0.05)', border: '1px solid rgba(0, 255, 136, 0.2)', padding: '1.5rem', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
                    <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#00ff88', fontSize: '1.2rem' }}>
                        <Activity size={20} /> Estatísticas da Fila
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #888' }}>
                            <div style={{ color: '#888', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><Clock size={16} /> Pendentes</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{queue.pending}</div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ffff00' }}>
                            <div style={{ color: '#ffff00', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><Star size={16} /> Priorizados</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{queue.prioritized_count || 0}</div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #00ff88' }}>
                            <div style={{ color: '#00ff88', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><CheckCircle size={16} /> Concluídos</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{queue.completed}</div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ff4444' }}>
                            <div style={{ color: '#ff4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><XCircle size={16} /> Erros</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{queue.error_count || 0}</div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ffaa00' }}>
                            <div style={{ color: '#ffaa00', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><SkipForward size={16} /> Ignorados</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{queue.skipped || 0}</div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #00ccff' }}>
                            <div style={{ color: '#00ccff', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><Database size={16} /> Economia DB</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{formatBytes(queue.total_size_saved)}</div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ff00ff' }}>
                            <div style={{ color: '#ff00ff', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><Rocket size={16} /> Envios Hoje</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{queue.completed_today || 0}</div>
                        </div>
                        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #00ff88' }}>
                            <div style={{ color: '#00ff88', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}><Sparkles size={16} /> Novos Hoje</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{queue.added_today || 0}</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '1.5rem' }}>
                        <button 
                            onClick={startScan}
                            style={{ flex: '1 1 calc(50% - 0.4rem)', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        >
                            <Search size={18} /> Escanear iptv_list.m3u (Local)
                        </button>
                        <button 
                            onClick={startRemoteScan}
                            style={{ flex: '1 1 calc(50% - 0.4rem)', padding: '0.8rem', background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0,255,136,0.2)'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(0,255,136,0.1)'; }}
                        >
                            <RefreshCcw size={18} /> Atualizar Catálogo (Auto)
                        </button>
                        <button 
                            onClick={retryErrors}
                            style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
                        >
                            <RefreshCcw size={16} /> Tentar Erros
                        </button>
                        <button 
                            onClick={handleExport}
                            style={{ padding: '0.6rem 1rem', background: 'rgba(0,204,255,0.05)', color: '#00ccff', border: '1px solid rgba(0,204,255,0.2)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
                        >
                            <Download size={16} /> Exportar BD
                        </button>
                        <button 
                            onClick={clearPending}
                            style={{ padding: '0.6rem 1rem', background: 'rgba(255,68,68,0.05)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
                        >
                            <Eraser size={16} /> Limpar Todos Pendentes
                        </button>
                        <button 
                            onClick={cleanupDuplicates}
                            style={{ padding: '0.6rem 1rem', background: 'rgba(0,255,136,0.05)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
                        >
                            <Eraser size={16} /> Limpar Pendentes Duplicados
                        </button>
                        <button 
                            onClick={cleanM3UTitles}
                            style={{ padding: '0.6rem 1rem', background: 'rgba(0,204,255,0.05)', color: '#00ccff', border: '1px solid rgba(0,204,255,0.2)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s' }}
                        >
                            <Eraser size={16} /> Corrigir Títulos Sujos
                        </button>
                        <button 
                            onClick={cleanupTelegramDuplicates}
                            disabled={isCleaningTG}
                            style={{ padding: '0.6rem 1rem', background: 'rgba(255,68,68,0.05)', color: '#ff4444', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '8px', cursor: isCleaningTG ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isCleaningTG ? 0.6 : 1, transition: 'all 0.2s' }}
                        >
                            <Trash2 size={16} /> {isCleaningTG ? 'Limpando...' : 'Apagar Duplicados do TG'}
                        </button>
                        <button 
                            onClick={remapTelegram}
                            disabled={isRemapping}
                            style={{ padding: '0.6rem 1rem', background: 'rgba(255,170,0,0.05)', color: '#ffaa00', border: '1px solid rgba(255,170,0,0.2)', borderRadius: '8px', cursor: isRemapping ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isRemapping ? 0.6 : 1, transition: 'all 0.2s' }}
                        >
                            <Radio size={16} /> {isRemapping ? 'Remapeando...' : 'Remapear Telegram'}
                        </button>
                    </div>
                </div>

                <div style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <h3 style={{ margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', color: '#fff' }}>
                        <Server size={20} color="#00ff88" /> Controle do Worker
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                        <span style={{ color: '#888' }}>Status:</span> 
                        <strong style={{ 
                            color: state.isRunning && !state.isPaused ? '#00ff88' : '#ff4444', 
                            padding: '0.3rem 0.8rem', 
                            background: state.isRunning && !state.isPaused ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)', 
                            borderRadius: '12px' 
                        }}>
                            {state.isRunning ? (state.isPaused ? 'PAUSADO' : 'RODANDO') : 'PARADO'}
                        </strong>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                        <button 
                            onClick={() => toggleWorker(false)}
                            disabled={state.isRunning && !state.isPaused}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.5rem', background: '#00ff88', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', opacity: (state.isRunning && !state.isPaused) ? 0.5 : 1, flex: 1, justifyContent: 'center' }}
                        >
                            <Play size={18} /> Iniciar / Retomar
                        </button>
                        <button 
                            onClick={() => toggleWorker(true)}
                            disabled={!state.isRunning || state.isPaused}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.5rem', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', opacity: (!state.isRunning || state.isPaused) ? 0.5 : 1, flex: 1, justifyContent: 'center' }}
                        >
                            <Pause size={18} /> Pausar
                        </button>
                    </div>
                </div>
            </div>

            {/* Pipeline Cards: Download e Upload */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {state.downloadTask ? (
                    <div style={{ backgroundColor: 'rgba(0, 255, 136, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(0, 255, 136, 0.2)' }}>
                        <h3 style={{ color: '#00ff88', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}>
                            <HardDriveDownload size={20} /> Baixando da IPTV
                        </h3>
                        <div>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.8rem', color: '#fff' }}>#{state.downloadTask.title}</div>
                            <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.5)', height: '12px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ width: `${typeof state.downloadTask.progress === 'number' ? state.downloadTask.progress : 100}%`, backgroundColor: typeof state.downloadTask.progress === 'number' ? '#00ff88' : '#ffaa00', height: '100%', transition: 'width 0.3s', boxShadow: '0 0 10px rgba(0,255,136,0.5)' }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.85rem', marginTop: '0.5rem', color: '#aaa' }}>
                                {typeof state.downloadTask.progress === 'number' ? `${state.downloadTask.progress.toFixed(2)}%` : 'Aguardando Liberação de Espaço...'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#666', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><HardDriveDownload size={18} /> Aguardando fila de Download...</span>
                    </div>
                )}

                {/* Upload via Docker (Menores que 2GB) */}
                {state.uploadTaskDocker ? (
                    <div style={{ backgroundColor: 'rgba(0, 255, 136, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(0, 255, 136, 0.2)' }}>
                        <h3 style={{ color: '#00ff88', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}>
                            <Send size={20} /> Enviando pro Telegram (Motor Turbo)
                        </h3>
                        <div>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.8rem', color: '#fff' }}>#{state.uploadTaskDocker.title || 'Desconhecido'}</div>
                            <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.5)', height: '12px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ 
                                    width: (typeof state.uploadTaskDocker.progress === 'number' && !isNaN(state.uploadTaskDocker.progress)) ? `${state.uploadTaskDocker.progress}%` : '100%', 
                                    backgroundColor: '#00ff88', 
                                    height: '100%', 
                                    transition: 'width 0.3s',
                                    boxShadow: '0 0 10px rgba(0,255,136,0.5)'
                                }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.85rem', marginTop: '0.5rem', color: '#aaa' }}>
                                {String(state.uploadTaskDocker.progress || 0).includes('TURBO') ? state.uploadTaskDocker.progress : (Number(state.uploadTaskDocker.progress) || 0).toFixed(2) + '%'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#666', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Send size={18} /> Aguardando fila de Upload (Pequenos)...</span>
                    </div>
                )}

                {/* Upload via Python (Qualquer tamanho, geralmente os Gigantes) */}
                {state.uploadTaskPython ? (
                    <div style={{ backgroundColor: 'rgba(0, 255, 136, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(0, 255, 136, 0.2)' }}>
                        <h3 style={{ color: '#00ff88', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0' }}>
                            <Send size={20} /> Enviando pro Telegram (Python)
                        </h3>
                        <div>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.8rem', color: '#fff' }}>#{state.uploadTaskPython.title || 'Desconhecido'}</div>
                            <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.5)', height: '12px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{ 
                                    width: (typeof state.uploadTaskPython.progress === 'number' && !isNaN(state.uploadTaskPython.progress)) ? `${state.uploadTaskPython.progress}%` : '100%', 
                                    backgroundColor: '#00ff88', 
                                    height: '100%', 
                                    transition: 'width 0.3s',
                                    boxShadow: '0 0 10px rgba(0,255,136,0.5)'
                                }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.85rem', marginTop: '0.5rem', color: '#aaa' }}>
                                {(Number(state.uploadTaskPython.progress) || 0).toFixed(2) + '%'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#666', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Send size={18} /> Aguardando fila de Upload (Grandes)...</span>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h3 style={{ margin: 0 }}>Últimos Filmes na Fila</h3>
                
                <div style={{ display: 'flex', gap: '0.5rem', background: '#333', padding: '0.3rem', borderRadius: '8px', alignItems: 'center', flex: '1', maxWidth: '300px' }}>
                    <Search size={18} color="#888" style={{ marginLeft: '0.5rem' }} />
                    <input 
                        type="text" 
                        placeholder="Pesquisar por título ou ID..." 
                        value={searchQuery}
                        onChange={(e) => {
                            const val = e.target.value;
                            setSearchQuery(val);
                            searchRef.current = val; // Atualiza a ref na hora para o socket não usar valor antigo
                            
                            if (window.searchTimeout) clearTimeout(window.searchTimeout);
                            window.searchTimeout = setTimeout(() => {
                                fetchQueue(filter, val, sortSize);
                            }, 400);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%', padding: '0.3rem' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={() => { setFilter('all'); filterRef.current='all'; fetchQueue('all', searchQuery, sortSize); }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid ' + (filter === 'all' ? '#00ff88' : 'rgba(255,255,255,0.1)'), cursor: 'pointer', background: filter === 'all' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)', color: filter === 'all' ? '#00ff88' : '#fff', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ListFilter size={16} /> Todos</button>
                    <button onClick={() => { setFilter('prioritized'); filterRef.current='prioritized'; fetchQueue('prioritized', searchQuery, sortSize); }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid ' + (filter === 'prioritized' ? '#ffff00' : 'rgba(255,255,255,0.1)'), cursor: 'pointer', background: filter === 'prioritized' ? 'rgba(255,255,0,0.1)' : 'rgba(255,255,255,0.05)', color: filter === 'prioritized' ? '#ffff00' : '#fff', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Star size={16} /> Priorizados</button>
                    <button onClick={() => { setFilter('pending'); filterRef.current='pending'; fetchQueue('pending', searchQuery, sortSize); }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid ' + (filter === 'pending' ? '#888' : 'rgba(255,255,255,0.1)'), cursor: 'pointer', background: filter === 'pending' ? 'rgba(136,136,136,0.1)' : 'rgba(255,255,255,0.05)', color: filter === 'pending' ? '#fff' : '#aaa', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Clock size={16} /> Pendentes</button>
                    <button onClick={() => { setFilter('completed'); filterRef.current='completed'; fetchQueue('completed', searchQuery, sortSize); }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid ' + (filter === 'completed' ? '#00ff88' : 'rgba(255,255,255,0.1)'), cursor: 'pointer', background: filter === 'completed' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)', color: filter === 'completed' ? '#00ff88' : '#fff', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle size={16} /> Concluídos</button>
                    <button onClick={() => { setFilter('error'); filterRef.current='error'; fetchQueue('error', searchQuery, sortSize); }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid ' + (filter === 'error' ? '#ff4444' : 'rgba(255,255,255,0.1)'), cursor: 'pointer', background: filter === 'error' ? 'rgba(255,68,68,0.1)' : 'rgba(255,255,255,0.05)', color: filter === 'error' ? '#ff4444' : '#fff', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><XCircle size={16} /> Erros</button>
                    <button onClick={() => { setFilter('skipped'); filterRef.current='skipped'; fetchQueue('skipped', searchQuery, sortSize); }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid ' + (filter === 'skipped' ? '#ffaa00' : 'rgba(255,255,255,0.1)'), cursor: 'pointer', background: filter === 'skipped' ? 'rgba(255,170,0,0.1)' : 'rgba(255,255,255,0.05)', color: filter === 'skipped' ? '#ffaa00' : '#fff', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><SkipForward size={16} /> Ignorados</button>
                    <button onClick={() => { setFilter('new_today'); filterRef.current='new_today'; fetchQueue('new_today', searchQuery, sortSize); }} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid ' + (filter === 'new_today' ? '#00ff88' : 'rgba(255,255,255,0.1)'), cursor: 'pointer', background: filter === 'new_today' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)', color: filter === 'new_today' ? '#00ff88' : '#fff', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Sparkles size={16} /> Novos Hoje</button>
                    
                    <button onClick={prioritizeFiltered} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(0, 255, 136, 0.5)', cursor: 'pointer', background: 'rgba(0, 255, 136, 0.1)', color: '#00ff88', display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.5rem', fontWeight: 'bold', transition: 'all 0.2s' }}>
                        <ChevronsUp size={16} /> Priorizar Busca
                    </button>
                    <button onClick={clearPriorities} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(255, 68, 68, 0.5)', cursor: 'pointer', background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold', transition: 'all 0.2s' }}>
                        <Eraser size={16} /> Limpar Prioridades
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
                            <th style={{ width: '220px', textAlign: 'center' }}>Ações</th>
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
                                        {item.priority > 0 && <span className="priority-badge"><Star size={12} /> PRIORIDADE</span>}
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
                                                title="Furar Fila (Priorizar)"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ffff00', marginRight: '0.5rem' }}
                                            >
                                                <ChevronsUp size={22} />
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
    );
}
