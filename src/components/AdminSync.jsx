import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Play, Pause, Trash2, HardDriveUpload } from 'lucide-react';

export default function AdminSync() {
    const [socket, setSocket] = useState(null);
    const [state, setState] = useState({ isRunning: false, isPaused: false, currentTask: null });
    const [queue, setQueue] = useState({ items: [], pending: 0, completed: 0, total: 0 });

    useEffect(() => {
        // Conecta ao WebSocket na mesma URL (o Vite faz o proxy na porta certa via env ou host)
        const token = localStorage.getItem('cinegeek_token'); // Caso precisemos de auth no socket no futuro
        const newSocket = io({
            auth: { token }
        });
        setSocket(newSocket);

        newSocket.on('sync_state', (data) => {
            setState(data);
            fetchQueue(); // Atualiza fila quando o estado muda (ex: mudou de filme)
        });

        fetchQueue();

        return () => newSocket.close();
    }, []);

    const fetchQueue = async () => {
        try {
            const res = await fetch('/api/sync/queue');
            const data = await res.json();
            if (res.ok) {
                setQueue(data);
            } else {
                setQueue({ items: [], error: data.error });
            }
        } catch (e) {
            setQueue({ items: [], error: 'Erro de conexão' });
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Tem certeza que deseja deletar este histórico? Se você der Play novamente, ele tentará baixar de novo.")) return;
        try {
            const res = await fetch(`/api/sync/queue/${id}`, { method: 'DELETE' });
            if (res.ok) {
                fetchQueue();
            }
        } catch (e) {
            alert("Erro ao deletar");
        }
    };

    const handlePause = async () => {
        await fetch('/api/sync/pause', { method: 'POST' });
    };

    const handleResume = async () => {
        await fetch('/api/sync/resume', { method: 'POST' });
    };

    return (
        <div style={{ padding: '0', maxWidth: '100%', margin: '0', color: '#fff' }}>
            <h1 style={{ display: 'none' }}>
                <HardDriveUpload size={28} /> Dashboard de Sincronização IPTV
            </h1>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <div style={{ background: '#1a1a2e', padding: '1.5rem', borderRadius: '12px', flex: 1 }}>
                    <h3 style={{ color: '#aaa', margin: '0 0 0.5rem 0' }}>Informações</h3>
                    <p style={{ color: '#ccc', lineHeight: '1.5' }}>
                        O sistema lê a lista <strong>iptv_list.m3u</strong> em tempo real linha por linha.<br/>
                        Apenas filmes e séries (.mp4, .mkv) são processados.<br/>
                        Se quiser forçar um arquivo a ser baixado de novo, apague ele do histórico abaixo.
                    </p>
                </div>

                <div style={{ background: '#1a1a2e', padding: '1.5rem', borderRadius: '12px', flex: 1 }}>
                    <h3 style={{ color: '#aaa', margin: '0 0 0.5rem 0' }}>Controle do Worker</h3>
                    <div style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
                        Status: 
                        <span style={{ 
                            marginLeft: '0.5rem', 
                            color: state.isPaused ? '#ffb300' : (state.isRunning ? '#00e676' : '#ff3d00'),
                            fontWeight: 'bold'
                        }}>
                            {state.isPaused ? 'PAUSADO' : (state.isRunning ? 'RODANDO' : 'PARADO')}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={handleResume} 
                            disabled={state.isRunning && !state.isPaused}
                            style={{ background: '#00e676', color: '#000', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
                        >
                            <Play size={18} /> Iniciar / Retomar
                        </button>
                        <button 
                            onClick={handlePause} 
                            disabled={state.isPaused || !state.isRunning}
                            style={{ background: '#ff3d00', color: '#fff', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
                        >
                            <Pause size={18} /> Pausar
                        </button>
                    </div>
                </div>
            </div>

            {state.currentTask && (
                <div style={{ background: '#161625', border: '1px solid #333', padding: '2rem', borderRadius: '12px', marginTop: '2rem' }}>
                    <h2 style={{ margin: '0 0 1rem 0', color: '#00e676' }}>🔥 Processando Agora</h2>
                    <h3>{state.currentTask.title}</h3>
                    <p>Fase atual: <strong>{state.currentTask.type === 'download' ? 'Baixando da IPTV para VPS' : 'Upload da VPS para Telegram'}</strong></p>
                    
                    <div style={{ width: '100%', background: '#333', height: '24px', borderRadius: '12px', overflow: 'hidden', marginTop: '1rem', position: 'relative' }}>
                        <div style={{ 
                            width: `${state.currentTask.progress}%`, 
                            background: state.currentTask.type === 'download' ? '#2196f3' : '#9c27b0', 
                            height: '100%',
                            transition: 'width 0.3s ease'
                        }} />
                        <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontWeight: 'bold', fontSize: '0.9rem', textShadow: '1px 1px 2px #000' }}>
                            {state.currentTask.progress.toFixed(2)}%
                        </span>
                    </div>
                </div>
            )}

            <h3 style={{ marginTop: '3rem', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Últimos Filmes na Fila</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                <thead>
                    <tr style={{ background: '#1a1a2e', textAlign: 'left' }}>
                        <th style={{ padding: '1rem' }}>ID</th>
                        <th style={{ padding: '1rem' }}>Título</th>
                        <th style={{ padding: '1rem' }}>Status</th>
                        <th style={{ padding: '1rem' }}>Tamanho</th>
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
                                    padding: '0.3rem 0.6rem',
                                    borderRadius: '4px',
                                    fontSize: '0.8rem',
                                    background: item.status === 'completed' ? 'rgba(0,230,118,0.2)' : 
                                                item.status === 'error' ? 'rgba(255,61,0,0.2)' : 'rgba(255,255,255,0.1)',
                                    color: item.status === 'completed' ? '#00e676' : 
                                           item.status === 'error' ? '#ff3d00' : '#fff'
                                }}>
                                    {item.status.toUpperCase()}
                                </span>
                            </td>
                            <td style={{ padding: '1rem', color: '#888' }}>
                                {item.file_size ? (item.file_size / (1024*1024)).toFixed(2) + ' MB' : '-'}
                            </td>
                            <td style={{ padding: '1rem', textAlign: 'center' }}>
                                <button onClick={() => handleDelete(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer' }} title="Deletar Histórico (força novo download)">
                                    <Trash2 size={18} />
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
