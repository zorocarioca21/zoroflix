import React, { useState } from 'react';
import { Globe, Server, RefreshCw, Power, Terminal, CheckCircle2, AlertCircle, Loader } from 'lucide-react';

export default function AdminSystemUpdates() {
    const token = localStorage.getItem('cinegeek_token');
    const [actionLoading, setActionLoading] = useState(null); // 'site' | 'backend' | 'all' | 'restart'
    const [logs, setLogs] = useState([]);
    const [lastActionStatus, setLastActionStatus] = useState(null); // 'success' | 'error'

    const handleAction = async (endpoint, actionKey, label) => {
        if (actionKey === 'restart' && !window.confirm('Tem certeza que deseja reiniciar o servidor da VPS? Ele ficará indisponível por alguns segundos.')) {
            return;
        }

        setActionLoading(actionKey);
        setLastActionStatus(null);
        setLogs([`⏳ Disparando: ${label}...`]);

        try {
            const res = await fetch(`/api/admin/system/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setLastActionStatus('success');
                setLogs(data.logs || ['✅ Operação concluída com sucesso!']);
            } else {
                setLastActionStatus('error');
                setLogs(data.logs || [data.error || '❌ Ocorreu um erro ao executar o comando na VPS.']);
            }
        } catch (err) {
            setLastActionStatus('error');
            setLogs([`❌ Falha de rede ou resposta do servidor: ${err.message}`]);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="admin-system-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="admin-tab-header">
                <div>
                    <h2 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>Controle do Sistema & Atualizações</h2>
                    <p style={{ color: '#888', margin: '0.4rem 0 0 0', fontSize: '0.9rem' }}>
                        Gerencie deploys automáticos da VPS direto do GitHub com zero tempo de inatividade.
                    </p>
                </div>
            </div>

            {/* Grid de Cards de Ações */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '1.2rem'
            }}>
                {/* 1. Atualizar Site Principal */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(0, 255, 136, 0.2)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.6rem' }}>
                            <div style={{ background: 'rgba(0, 255, 136, 0.1)', padding: '10px', borderRadius: '8px', color: '#00ff88' }}>
                                <Globe size={24} />
                            </div>
                            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Site Principal</h3>
                        </div>
                        <p style={{ color: '#aaa', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>
                            Executa <code style={{ color: '#00ff88' }}>git pull</code> + <code style={{ color: '#00ff88' }}>npm run build</code>. 
                            Atualiza o visual, player e páginas <strong>sem derrubar a API nem o Embed</strong>.
                        </p>
                    </div>

                    <button
                        onClick={() => handleAction('update-site', 'site', 'Atualizar Site Principal')}
                        disabled={actionLoading !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: '#00ff88',
                            color: '#000',
                            fontWeight: 'bold',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '8px',
                            cursor: actionLoading ? 'not-allowed' : 'pointer',
                            opacity: actionLoading ? 0.6 : 1,
                            transition: '0.2s'
                        }}
                    >
                        {actionLoading === 'site' ? <Loader size={18} className="spin-anim" /> : <Globe size={18} />}
                        Atualizar Site
                    </button>
                </div>

                {/* 2. Atualizar API & Embed */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(0, 204, 255, 0.2)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.6rem' }}>
                            <div style={{ background: 'rgba(0, 204, 255, 0.1)', padding: '10px', borderRadius: '8px', color: '#00ccff' }}>
                                <Server size={24} />
                            </div>
                            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>API & Embed</h3>
                        </div>
                        <p style={{ color: '#aaa', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>
                            Executa <code style={{ color: '#00ccff' }}>git pull</code> + <code style={{ color: '#00ccff' }}>pm2 reload</code>. 
                            Atualiza as rotas backend e chaves mantendo a disponibilidade ativa.
                        </p>
                    </div>

                    <button
                        onClick={() => handleAction('update-backend', 'backend', 'Atualizar API & Embed')}
                        disabled={actionLoading !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: '#00ccff',
                            color: '#000',
                            fontWeight: 'bold',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '8px',
                            cursor: actionLoading ? 'not-allowed' : 'pointer',
                            opacity: actionLoading ? 0.6 : 1,
                            transition: '0.2s'
                        }}
                    >
                        {actionLoading === 'backend' ? <Loader size={18} className="spin-anim" /> : <Server size={18} />}
                        Atualizar API
                    </button>
                </div>

                {/* 3. Atualizar Tudo (Geral) */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 170, 0, 0.2)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.6rem' }}>
                            <div style={{ background: 'rgba(255, 170, 0, 0.1)', padding: '10px', borderRadius: '8px', color: '#ffaa00' }}>
                                <RefreshCw size={24} />
                            </div>
                            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Atualizar Tudo</h3>
                        </div>
                        <p style={{ color: '#aaa', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>
                            Puxa do GitHub, compila o frontend e reinicia o backend com as últimas novidades.
                        </p>
                    </div>

                    <button
                        onClick={() => handleAction('update-all', 'all', 'Atualizar Tudo')}
                        disabled={actionLoading !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: '#ffaa00',
                            color: '#000',
                            fontWeight: 'bold',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '8px',
                            cursor: actionLoading ? 'not-allowed' : 'pointer',
                            opacity: actionLoading ? 0.6 : 1,
                            transition: '0.2s'
                        }}
                    >
                        {actionLoading === 'all' ? <Loader size={18} className="spin-anim" /> : <RefreshCw size={18} />}
                        Atualizar Tudo
                    </button>
                </div>

                {/* 4. Reiniciar Servidor */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 68, 68, 0.2)',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.6rem' }}>
                            <div style={{ background: 'rgba(255, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', color: '#ff4444' }}>
                                <Power size={24} />
                            </div>
                            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem' }}>Reiniciar Servidor</h3>
                        </div>
                        <p style={{ color: '#aaa', fontSize: '0.85rem', lineHeight: '1.4', margin: 0 }}>
                            Reinicia o processo Node.js na VPS (limpa memória RAM e reconecta workers).
                        </p>
                    </div>

                    <button
                        onClick={() => handleAction('restart', 'restart', 'Reiniciar Servidor')}
                        disabled={actionLoading !== null}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: 'rgba(255, 68, 68, 0.15)',
                            color: '#ff4444',
                            border: '1px solid #ff4444',
                            fontWeight: 'bold',
                            padding: '12px',
                            borderRadius: '8px',
                            cursor: actionLoading ? 'not-allowed' : 'pointer',
                            opacity: actionLoading ? 0.6 : 1,
                            transition: '0.2s'
                        }}
                    >
                        {actionLoading === 'restart' ? <Loader size={18} className="spin-anim" /> : <Power size={18} />}
                        Reiniciar VPS
                    </button>
                </div>
            </div>

            {/* Terminal / Log de Saída da VPS */}
            <div style={{
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '12px',
                padding: '1.2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.8rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#58a6ff' }}>
                        <Terminal size={18} />
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Log do Console da VPS</span>
                    </div>

                    {lastActionStatus === 'success' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00ff88', fontSize: '0.85rem' }}>
                            <CheckCircle2 size={16} /> Sucesso
                        </div>
                    )}
                    {lastActionStatus === 'error' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ff4444', fontSize: '0.85rem' }}>
                            <AlertCircle size={16} /> Erro
                        </div>
                    )}
                </div>

                <div style={{
                    background: '#030712',
                    borderRadius: '8px',
                    padding: '1rem',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    color: '#e6edf3',
                    minHeight: '120px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    border: '1px solid #1f2937'
                }}>
                    {logs.length === 0 ? (
                        <span style={{ color: '#4b5563' }}>Nenhuma ação recente. Clique em um dos botões acima para executar.</span>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} style={{ marginBottom: '4px' }}>{log}</div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
