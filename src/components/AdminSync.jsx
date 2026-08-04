import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Play, Pause, Trash2, Edit, HardDriveDownload, Send, Search, ArrowDownUp, SkipForward, Download, RefreshCcw, Eraser, ChevronsUp } from 'lucide-react';

export default function AdminSync() {
    const [state, setState] = useState({ isRunning: false, isPaused: false, downloadTask: null, uploadTaskDocker: null, uploadTaskPython: null });
    const [socket, setSocket] = useState(null);
    const [queue, setQueue] = useState({ items: [], pending: 0, completed: 0, total: 0, error: null, skipped: 0, error_count: 0, total_size_saved: 0, completed_today: 0 });
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortSize, setSortSize] = useState(''); // '' | 'asc' | 'desc'
    const [manualUpload, setManualUpload] = useState({ title: '', file: null, progress: 0, status: 'idle' });
    
    const filterRef = useRef(filter);
    const searchRef = useRef(searchQuery);
    const sortRef = useRef(sortSize);

    useEffect(() => {
        filterRef.current = filter;
        searchRef.current = searchQuery;
        sortRef.current = sortSize;
    }, [filter, searchQuery, sortSize]);

    const fetchQueue = async (currentFilter = filterRef.current, currentSearch = searchRef.current, currentSort = sortRef.current) => {
        try {
            const res = await fetch(`/api/sync/queue?filter=${currentFilter}&search=${encodeURIComponent(currentSearch)}&sortSize=${currentSort}`);
            const data = await res.json();
            if (res.ok) {
                setQueue(data);
            } else {
                setQueue({ items: [], pending: 0, completed: 0, total: 0, error: data.error });
            }
        } catch (e) {
            setQueue({ items: [], pending: 0, completed: 0, total: 0, error: 'Erro de conexão' });
        }
    };

    useEffect(() => {
        // Conecta ao WebSocket na mesma URL
        const newSocket = io({ path: '/socket.io' });
        
        newSocket.on('sync_state', (data) => {
            setState(data);
            fetchQueue(filterRef.current, searchRef.current, sortRef.current); // Atualiza fila usando os valores mais recentes das Refs
        });

        setSocket(newSocket);
        fetchQueue();

        return () => newSocket.close();
    }, []);

    const startScan = async () => {
        try {
            const res = await fetch('/api/sync/scan', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert(`Varredura iniciada! ${data.totalFound} encontrados.`);
                fetchQueue();
            } else {
                alert(data.error || 'Erro ao iniciar scan');
            }
        } catch (e) {
            alert('Erro de conexão ao iniciar scan');
        }
    };

    const handleManualUpload = () => {
        if (!manualUpload.title || !manualUpload.file) {
            alert("Preencha o título e selecione um arquivo de vídeo.");
            return;
        }

        setManualUpload(prev => ({ ...prev, status: 'uploading', progress: 0 }));

        const formData = new FormData();
        formData.append('title', manualUpload.title);
        formData.append('video', manualUpload.file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/sync/manual-upload', true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                setManualUpload(prev => ({ ...prev, progress: percent }));
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                alert("Upload enviado com sucesso para a esteira do bot!");
                setManualUpload({ title: '', file: null, progress: 0, status: 'idle' });
                if (document.getElementById('manual-file-input')) {
                    document.getElementById('manual-file-input').value = "";
                }
                fetchQueue();
            } else {
                let errorMsg = xhr.responseText;
                try { errorMsg = JSON.parse(xhr.responseText).error; } catch(e){}
                alert("Erro no upload: " + errorMsg);
                setManualUpload(prev => ({ ...prev, status: 'error' }));
            }
        };

        xhr.onerror = () => {
            alert("Erro de conexão durante o upload.");
            setManualUpload(prev => ({ ...prev, status: 'error' }));
        };

        xhr.send(formData);
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
        
        if (!window.confirm(warning)) return;
        
        await fetch(`/api/sync/queue/${item.id}`, { method: 'DELETE' });
        fetchQueue();
    };

    const prioritizeItem = async (item) => {
        if (!window.confirm("Deseja priorizar este item para que ele fure a fila e seja o próximo a ser baixado?")) return;
        
        try {
            const res = await fetch(`/api/sync/queue/${item.id}/prioritize`, { method: 'POST' });
            if (res.ok) {
                fetchQueue();
            } else {
                alert("Erro ao priorizar o item");
            }
        } catch (e) {
            alert('Erro de conexão ao priorizar item');
        }
    };

    const editItem = async (item) => {
        const newTitle = window.prompt("Digite o novo título para este filme:", item.title);
        if (!newTitle || newTitle === item.title) return;

        const warning = item.telegram_message_id 
            ? "Este item já foi enviado. Ao editar o título aqui, a LEGENDA DO TELEGRAM também será alterada em tempo real. Continuar?" 
            : "Deseja alterar o título na fila de sincronização?";
        
        if (!window.confirm(warning)) return;

        try {
            const res = await fetch(`/api/sync/queue/${item.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });
            if (res.ok) {
                fetchQueue();
            } else {
                alert("Erro ao editar o título.");
            }
        } catch (e) {
            alert("Erro de conexão ao editar.");
        }
    };

    const retryErrors = async () => {
        if (!window.confirm("Deseja colocar todos os itens com 'Erro' de volta na fila pendente?")) return;
        await fetch('/api/sync/retry-errors', { method: 'POST' });
        fetchQueue();
    };

    const skipItem = async (item) => {
        if (!window.confirm("Deseja ignorar este item? O worker não tentará baixá-lo novamente.")) return;
        await fetch(`/api/sync/queue/${item.id}/skip`, { method: 'PUT' });
        fetchQueue();
    };

    const handleExport = () => {
        window.open('/api/sync/export', '_blank');
    };

    const clearPending = async () => {
        if (!window.confirm("Deseja apagar TODOS os itens pendentes da fila? Isso não afetará os concluídos ou com erro.")) return;
        await fetch('/api/sync/queue/pending/clear', { method: 'DELETE' });
        fetchQueue();
    };

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div style={{ padding: '2rem', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <HardDriveDownload size={32} color="#00ff88" />
                    CineGeek Sync
                </h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px' }}>
                    <h3>Estatísticas da Fila</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                        <div><span style={{ color: '#888' }}>⏱ Pendentes:</span> {queue.pending}</div>
                        <div><span style={{ color: '#00ff88' }}>✔ Concluídos:</span> {queue.completed}</div>
                        <div><span style={{ color: '#ff4444' }}>❌ Erros:</span> {queue.error_count || 0}</div>
                        <div><span style={{ color: '#ffaa00' }}>⏭ Ignorados:</span> {queue.skipped || 0}</div>
                        <div><span style={{ color: '#00ccff' }}>💾 Economia DB:</span> {formatBytes(queue.total_size_saved)}</div>
                        <div><span style={{ color: '#ff00ff' }}>🚀 Envios Hoje:</span> {queue.completed_today || 0}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                        <button 
                            onClick={startScan}
                            style={{ flex: 1, padding: '0.5rem', background: '#00ff88', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            Re-escanear iptv_list.m3u
                        </button>
                        <button 
                            onClick={retryErrors}
                            style={{ padding: '0.5rem 1rem', background: '#333', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <RefreshCcw size={16} /> Tentar Erros
                        </button>
                        <button 
                            onClick={handleExport}
                            style={{ padding: '0.5rem 1rem', background: '#333', color: '#00ccff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Download size={16} /> Exportar BD
                        </button>
                        <button 
                            onClick={clearPending}
                            style={{ padding: '0.5rem 1rem', background: '#333', color: '#ff4444', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Eraser size={16} /> Limpar Pendentes
                        </button>
                    </div>
                </div>

                <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px' }}>
                    <h3>Controle do Worker</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
                        <span>Status: <strong style={{ color: state.isRunning && !state.isPaused ? '#00ff88' : '#ff4444' }}>
                            {state.isRunning ? (state.isPaused ? 'PAUSADO' : 'RODANDO') : 'PARADO'}
                        </strong></span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button 
                            onClick={() => toggleWorker(false)}
                            disabled={state.isRunning && !state.isPaused}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#00ff88', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: (state.isRunning && !state.isPaused) ? 0.5 : 1 }}
                        >
                            <Play size={16} /> Iniciar / Retomar
                        </button>
                        <button 
                            onClick={() => toggleWorker(true)}
                            disabled={!state.isRunning || state.isPaused}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', opacity: (!state.isRunning || state.isPaused) ? 0.5 : 1 }}
                        >
                            <Pause size={16} /> Pausar
                        </button>
                    </div>
                </div>
            </div>

            {/* Upload Manual Panel */}
            <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', marginBottom: '2rem', border: '1px solid #333' }}>
                <h3 style={{ color: '#00ccff', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <HardDriveDownload size={20} /> Upload Manual de Filmes/Séries
                </h3>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888' }}>Título do Filme/Episódio</label>
                        <input 
                            type="text" 
                            placeholder="Ex: Matrix (1999)"
                            value={manualUpload.title}
                            onChange={(e) => setManualUpload({...manualUpload, title: e.target.value})}
                            disabled={manualUpload.status === 'uploading'}
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#888' }}>Arquivo (MP4, MKV)</label>
                        <input 
                            type="file" 
                            id="manual-file-input"
                            accept="video/*,.mkv"
                            onChange={(e) => setManualUpload({...manualUpload, file: e.target.files[0]})}
                            disabled={manualUpload.status === 'uploading'}
                            style={{ width: '100%', padding: '0.55rem', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff' }}
                        />
                    </div>
                    <button 
                        onClick={handleManualUpload}
                        disabled={manualUpload.status === 'uploading'}
                        style={{ padding: '0.75rem 2rem', background: '#00ff88', color: '#000', border: 'none', borderRadius: '4px', cursor: manualUpload.status === 'uploading' ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                    >
                        {manualUpload.status === 'uploading' ? 'Enviando...' : 'Fazer Upload'}
                    </button>
                </div>

                {manualUpload.status === 'uploading' && (
                    <div style={{ marginTop: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#888' }}>Enviando arquivo para a VPS...</span>
                            <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{manualUpload.progress}%</span>
                        </div>
                        <div style={{ width: '100%', backgroundColor: '#222', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                            <div style={{ width: `${manualUpload.progress}%`, backgroundColor: '#00ff88', height: '100%', transition: 'width 0.1s' }} />
                        </div>
                        <small style={{ color: '#666', marginTop: '0.5rem', display: 'block' }}>Aguarde o envio concluir, não feche a página.</small>
                    </div>
                )}
            </div>

            {/* Pipeline Cards: Download e Upload */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                {state.downloadTask ? (
                    <div style={{ backgroundColor: '#1a1a2e', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
                        <h3 style={{ color: '#00ccff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <HardDriveDownload size={20} /> Baixando da IPTV
                        </h3>
                        <div style={{ marginTop: '1rem' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>#{state.downloadTask.title}</div>
                            <div style={{ width: '100%', backgroundColor: '#222', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ width: `${typeof state.downloadTask.progress === 'number' ? state.downloadTask.progress : 100}%`, backgroundColor: typeof state.downloadTask.progress === 'number' ? '#00ccff' : '#ffaa00', height: '100%', transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '0.2rem', color: '#888' }}>
                                {typeof state.downloadTask.progress === 'number' ? `${state.downloadTask.progress.toFixed(2)}%` : 'Aguardando Liberação de Espaço...'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#666' }}>Aguardando fila de Download...</span>
                    </div>
                )}

                {/* Upload via Docker (Menores que 2GB) */}
                {state.uploadTaskDocker ? (
                    <div style={{ backgroundColor: '#2e1a2e', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
                        <h3 style={{ color: '#ff00ff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Send size={20} /> Enviando pro Telegram (Motor Turbo)
                        </h3>
                        <div style={{ marginTop: '1rem' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>#{state.uploadTaskDocker.title || 'Desconhecido'}</div>
                            <div style={{ width: '100%', backgroundColor: '#222', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ 
                                    width: (typeof state.uploadTaskDocker.progress === 'number' && !isNaN(state.uploadTaskDocker.progress)) ? `${state.uploadTaskDocker.progress}%` : '100%', 
                                    backgroundColor: (typeof state.uploadTaskDocker.progress === 'number' && !isNaN(state.uploadTaskDocker.progress)) ? '#ff00ff' : '#00ff88', 
                                    height: '100%', 
                                    transition: 'width 0.3s' 
                                }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '0.2rem', color: '#888' }}>
                                {String(state.uploadTaskDocker.progress || 0).includes('TURBO') ? state.uploadTaskDocker.progress : (Number(state.uploadTaskDocker.progress) || 0).toFixed(2) + '%'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#666' }}>Aguardando fila de Upload (Pequenos)...</span>
                    </div>
                )}

                {/* Upload via Python (Qualquer tamanho, geralmente os Gigantes) */}
                {state.uploadTaskPython ? (
                    <div style={{ backgroundColor: '#1e2030', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
                        <h3 style={{ color: '#ffaa00', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Send size={20} /> Enviando pro Telegram (Python)
                        </h3>
                        <div style={{ marginTop: '1rem' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>#{state.uploadTaskPython.title || 'Desconhecido'}</div>
                            <div style={{ width: '100%', backgroundColor: '#222', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ 
                                    width: (typeof state.uploadTaskPython.progress === 'number' && !isNaN(state.uploadTaskPython.progress)) ? `${state.uploadTaskPython.progress}%` : '100%', 
                                    backgroundColor: '#ffaa00', 
                                    height: '100%', 
                                    transition: 'width 0.3s' 
                                }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '0.2rem', color: '#888' }}>
                                {(Number(state.uploadTaskPython.progress) || 0).toFixed(2) + '%'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#666' }}>Aguardando fila de Upload (Grandes)...</span>
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
                            setSearchQuery(e.target.value);
                            fetchQueue(filter, e.target.value, sortSize);
                        }}
                        style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%', padding: '0.3rem' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => { setFilter('all'); fetchQueue('all', searchQuery, sortSize); }} style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'all' ? '#00ccff' : '#333', color: filter === 'all' ? '#000' : '#fff' }}>Todos</button>
                    <button onClick={() => { setFilter('pending'); fetchQueue('pending', searchQuery, sortSize); }} style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'pending' ? '#ffff00' : '#333', color: filter === 'pending' ? '#000' : '#fff' }}>Pendentes</button>
                    <button onClick={() => { setFilter('completed'); fetchQueue('completed', searchQuery, sortSize); }} style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'completed' ? '#00ff88' : '#333', color: filter === 'completed' ? '#000' : '#fff' }}>Concluídos</button>
                    <button onClick={() => { setFilter('error'); fetchQueue('error', searchQuery, sortSize); }} style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'error' ? '#ff4444' : '#333', color: filter === 'error' ? '#fff' : '#fff' }}>Erros</button>
                    <button onClick={() => { setFilter('skipped'); fetchQueue('skipped', searchQuery, sortSize); }} style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', background: filter === 'skipped' ? '#ffaa00' : '#333', color: filter === 'skipped' ? '#000' : '#fff' }}>Ignorados</button>
                </div>
            </div>
            <div style={{ overflowX: 'auto', borderRadius: '8px' }}>
                <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', backgroundColor: '#1a1a1a', overflow: 'hidden' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#222' }}>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>ID</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Título</th>
                            <th style={{ padding: '1rem', textAlign: 'left' }}>Status</th>
                            <th 
                                style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}
                                onClick={() => {
                                    const nextSort = sortSize === '' ? 'desc' : (sortSize === 'desc' ? 'asc' : '');
                                    setSortSize(nextSort);
                                    fetchQueue(filter, searchQuery, nextSort);
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    Tamanho <ArrowDownUp size={14} color={sortSize !== '' ? '#00ff88' : '#888'} />
                                    {sortSize === 'asc' && <span style={{ fontSize: '0.8rem', color: '#00ff88' }}>Maior-Menor</span>}
                                    {sortSize === 'desc' && <span style={{ fontSize: '0.8rem', color: '#00ff88' }}>Menor-Maior</span>}
                                </div>
                            </th>
                            <th style={{ padding: '1rem', textAlign: 'center' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {queue.error ? (
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: '#ff4444' }}>{queue.error}</td></tr>
                        ) : queue.items && queue.items.length > 0 ? (
                            queue.items.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ padding: '1rem', color: '#888' }}>#{item.id}</td>
                                    <td style={{ padding: '1rem' }}>
                                        {item.priority > 0 && <span style={{ color: '#ffff00', marginRight: '0.5rem', fontWeight: 'bold' }}>⭐ [PRIORIDADE]</span>}
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
                                                if(!window.confirm("Deseja refazer o download deste item? Ele voltará para a fila e a versão antiga no Telegram será apagada.")) return;
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
                            <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: '#888' }}>Nenhuma atividade recente na fila</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
