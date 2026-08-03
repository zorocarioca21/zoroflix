import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Play, Pause, Trash2, HardDriveDownload, Send } from 'lucide-react';

export default function AdminSync() {
    const [state, setState] = useState({ isRunning: false, isPaused: false, downloadTask: null, uploadTask: null });
    const [socket, setSocket] = useState(null);
    const [queue, setQueue] = useState({ items: [], pending: 0, completed: 0, total: 0, error: null });

    const fetchQueue = async () => {
        try {
            const res = await fetch('/api/sync/queue');
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
            fetchQueue(); // Atualiza fila quando o estado muda
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

    const toggleWorker = async (pause) => {
        const endpoint = pause ? '/api/sync/pause' : '/api/sync/resume';
        await fetch(endpoint, { method: 'POST' });
        fetchQueue();
    };

    const deleteItem = async (id) => {
        if (!window.confirm("Deseja apagar este item do histórico? Isso fará o sistema baixá-lo novamente.")) return;
        await fetch(`/api/sync/queue/${id}`, { method: 'DELETE' });
        fetchQueue();
    };

    return (
        <div style={{ padding: '2rem', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <HardDriveDownload size={32} color="#00ff88" />
                    Zoroflix Sync
                </h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px' }}>
                    <h3>Estatísticas da Fila</h3>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem' }}>
                        <div><span style={{ color: '#888' }}>⏱ Pendentes:</span> {queue.pending}</div>
                        <div><span style={{ color: '#00ff88' }}>✔ Concluídos:</span> {queue.completed}</div>
                        <div><span style={{ color: '#888' }}>Total:</span> {queue.total}</div>
                    </div>
                    <button 
                        onClick={startScan}
                        style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#00ff88', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Re-escanear iptv_list.m3u
                    </button>
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
                                <div style={{ width: `${state.downloadTask.progress}%`, backgroundColor: '#00ccff', height: '100%', transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '0.2rem', color: '#888' }}>
                                {state.downloadTask.progress.toFixed(2)}%
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#666' }}>Aguardando fila de Download...</span>
                    </div>
                )}

                {state.uploadTask ? (
                    <div style={{ backgroundColor: '#2e1a2e', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333' }}>
                        <h3 style={{ color: '#ff00ff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Send size={20} /> Enviando pro Telegram
                        </h3>
                        <div style={{ marginTop: '1rem' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>#{state.uploadTask.title}</div>
                            <div style={{ width: '100%', backgroundColor: '#222', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ width: `${state.uploadTask.progress}%`, backgroundColor: '#ff00ff', height: '100%', transition: 'width 0.3s' }} />
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.8rem', marginTop: '0.2rem', color: '#888' }}>
                                {state.uploadTask.progress.toFixed(2)}%
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ backgroundColor: '#1a1a1a', padding: '1.5rem', borderRadius: '8px', border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: '#666' }}>Aguardando fila de Upload...</span>
                    </div>
                )}
            </div>

            <h3 style={{ marginBottom: '1rem' }}>Últimos Filmes na Fila</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: '#1a1a1a', borderRadius: '8px', overflow: 'hidden' }}>
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
                    {queue.error ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '1rem', color: '#ff4444' }}>{queue.error}</td></tr>
                    ) : queue.items && queue.items.length > 0 ? (
                        queue.items.map(item => (
                            <tr key={item.id} style={{ borderBottom: '1px solid #222' }}>
                                <td style={{ padding: '1rem', color: '#888' }}>#{item.id}</td>
                                <td style={{ padding: '1rem' }}>{item.title}</td>
                                <td style={{ padding: '1rem' }}>
                                    <span style={{ 
                                        padding: '0.2rem 0.5rem', 
                                        borderRadius: '4px', 
                                        fontSize: '0.8rem',
                                        backgroundColor: item.status === 'completed' ? '#00ff8822' : 
                                                        item.status === 'error' ? '#ff444422' : 
                                                        item.status === 'downloading' ? '#00ccff22' :
                                                        item.status === 'uploading' ? '#ff00ff22' :
                                                        item.status === 'pending_upload' ? '#ffff0022' : '#ffffff22',
                                        color: item.status === 'completed' ? '#00ff88' : 
                                               item.status === 'error' ? '#ff4444' : 
                                               item.status === 'downloading' ? '#00ccff' :
                                               item.status === 'uploading' ? '#ff00ff' :
                                               item.status === 'pending_upload' ? '#ffff00' : '#fff'
                                    }}>
                                        {item.status.toUpperCase()}
                                    </span>
                                    {item.error_message && <div style={{ fontSize: '0.8rem', color: '#ff4444', marginTop: '0.2rem' }}>{item.error_message}</div>}
                                </td>
                                <td style={{ padding: '1rem', color: '#888' }}>
                                    {item.file_size ? (item.file_size / 1024 / 1024).toFixed(2) + ' MB' : '-'}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                    <button 
                                        onClick={() => deleteItem(item.id)}
                                        title="Apagar e baixar novamente"
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
    );
}
