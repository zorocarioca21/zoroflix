import React, { useState, useEffect } from 'react';
import { Shield, MessageSquare, AlertTriangle, Users, Search, Trash2, CheckCircle, UserCheck, ExternalLink, Ghost, EyeOff, MoreHorizontal, ChartBar, Key, Copy, Power, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

export default function AdminPanel() {
    const { user } = useAuth();
    const isAuthorized = user && user.role === 'admin';

    const [activeTab, setActiveTab] = useState('reports');
    const [loading, setLoading] = useState(false);
    const [configs, setConfigs] = useState({});
    const [stats, setStats] = useState({ monthly: 0, weekly: 0, daily: 0, monthlyUnique: 0, weeklyUnique: 0 });
    const [liveSessions, setLiveSessions] = useState([]);
    const [onlineCount, setOnlineCount] = useState(0);
    const [apiKeys, setApiKeys] = useState([]);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyResult, setNewKeyResult] = useState(null);

    // Estados de Listagem
    const [reports, setReports] = useState([]);
    const [comments, setComments] = useState([]);
    const [moderatedList, setModeratedList] = useState([]);
    const [hiddenList, setHiddenList] = useState([]);
    const [usersList, setUsersList] = useState([]);

    // Estados de Busca e Paginação
    const [searchReports, setSearchReports] = useState('');
    const [searchComments, setSearchComments] = useState('');
    const [searchModerated, setSearchModerated] = useState('');
    const [searchHidden, setSearchHidden] = useState('');
    const [searchUsers, setSearchUsers] = useState('');

    const [offsetReports, setOffsetReports] = useState(0);
    const [offsetComments, setOffsetComments] = useState(0);
    const [offsetModerated, setOffsetModerated] = useState(0);
    const [offsetHidden, setOffsetHidden] = useState(0);
    const [offsetUsers, setOffsetUsers] = useState(0);

    const LIMIT_INITIAL = 5;
    const LIMIT_MORE = 10;

    useEffect(() => {
        if (!isAuthorized) return;
        if (activeTab === 'reports') fetchReports(true);
        if (activeTab === 'comments') fetchComments(true);
        if (activeTab === 'moderated') fetchModerated(true);
        if (activeTab === 'hidden') fetchHidden(true);
        if (activeTab === 'users') fetchUsersList(true);
        if (activeTab === 'settings') fetchConfigs();
        if (activeTab === 'analytics') {
            fetchStats();
            fetchLive();
            fetchOnline();
        }
        if (activeTab === 'apikeys') fetchApiKeys();
    }, [activeTab, isAuthorized]);

    // Auto-refresh para Analytics a cada 5 segundos
    useEffect(() => {
        if (activeTab === 'analytics' && isAuthorized) {
            const interval = setInterval(() => {
                fetchStats();
                fetchLive();
                fetchOnline();
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [activeTab, isAuthorized]);

    const fetchReports = async (reset = false) => {
        setLoading(true);
        const currentOffset = reset ? 0 : offsetReports;
        const currentLimit = reset ? LIMIT_INITIAL : LIMIT_MORE;
        const resp = await fetch(`/api/admin/reports?limit=${currentLimit}&offset=${currentOffset}&search=${searchReports}`);
        const data = await resp.json();
        setReports(reset ? data : [...reports, ...data]);
        setOffsetReports(currentOffset + data.length);
        setLoading(false);
    };

    const fetchComments = async (reset = false) => {
        setLoading(true);
        const currentOffset = reset ? 0 : offsetComments;
        const currentLimit = reset ? LIMIT_INITIAL : LIMIT_MORE;
        const resp = await fetch(`/api/admin/comments?status=active&limit=${currentLimit}&offset=${currentOffset}&search=${searchComments}`);
        const data = await resp.json();
        setComments(reset ? data : [...comments, ...data]);
        setOffsetComments(currentOffset + data.length);
        setLoading(false);
    };

    const fetchModerated = async (reset = false) => {
        setLoading(true);
        const currentOffset = reset ? 0 : offsetModerated;
        const currentLimit = reset ? LIMIT_INITIAL : LIMIT_MORE;
        const resp = await fetch(`/api/admin/comments?status=moderated&limit=${currentLimit}&offset=${currentOffset}&search=${searchModerated}`);
        const data = await resp.json();
        setModeratedList(reset ? data : [...moderatedList, ...data]);
        setOffsetModerated(currentOffset + data.length);
        setLoading(false);
    };

    const fetchHidden = async (reset = false) => {
        setLoading(true);
        const currentOffset = reset ? 0 : offsetHidden;
        const currentLimit = reset ? LIMIT_INITIAL : LIMIT_MORE;
        const resp = await fetch(`/api/admin/comments?status=hidden&limit=${currentLimit}&offset=${currentOffset}&search=${searchHidden}`);
        const data = await resp.json();
        setHiddenList(reset ? data : [...hiddenList, ...data]);
        setOffsetHidden(currentOffset + data.length);
        setLoading(false);
    };

    const fetchUsersList = async (reset = false) => {
        setLoading(true);
        const currentOffset = reset ? 0 : offsetUsers;
        const currentLimit = reset ? LIMIT_INITIAL : LIMIT_MORE;
        const resp = await fetch(`/api/admin/users?query=${searchUsers}&limit=${currentLimit}&offset=${currentOffset}`);
        const data = await resp.json();
        setUsersList(reset ? data : [...usersList, ...data]);
        setOffsetUsers(currentOffset + data.length);
        setLoading(false);
    };

    const fetchConfigs = async () => {
        const resp = await fetch('/api/admin/config/all');
        const data = await resp.json();
        setConfigs(data);
    };

    // Fetch analytics data
    const fetchStats = async () => {
        const resp = await fetch('/api/admin/stats');
        if (resp.ok) {
            const data = await resp.json();
            setStats(data);
        }
    };
    const fetchLive = async () => {
        const resp = await fetch('/api/admin/live');
        if (resp.ok) {
            const data = await resp.json();
            setLiveSessions(data);
        }
    };
    const fetchOnline = async () => {
        const resp = await fetch('/api/admin/online');
        if (resp.ok) {
            const data = await resp.json();
            setOnlineCount(data.online);
        }
    };

    const updateConfig = async (key) => {
        const newValue = !configs[key];
        const resp = await fetch('/api/admin/config/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, enabled: newValue })
        });
        if (resp.ok) setConfigs(prev => ({ ...prev, [key]: newValue }));
    };

    // API Keys
    const fetchApiKeys = async () => {
        try {
            const resp = await fetch('/api/admin/api-keys');
            const data = await resp.json();
            setApiKeys(data);
        } catch (err) { console.error(err); }
    };

    const createApiKey = async () => {
        if (!newKeyName.trim()) return alert('Digite um nome para a chave.');
        try {
            const resp = await fetch('/api/admin/api-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName })
            });
            const data = await resp.json();
            if (data.success) {
                setNewKeyResult(data.key);
                setNewKeyName('');
                fetchApiKeys();
            }
        } catch (err) { console.error(err); }
    };

    const toggleApiKey = async (id) => {
        try {
            await fetch(`/api/admin/api-keys/${id}/toggle`, { method: 'PATCH' });
            fetchApiKeys();
        } catch (err) { console.error(err); }
    };

    const deleteApiKey = async (id) => {
        if (!window.confirm('Tem certeza que deseja deletar esta API Key?')) return;
        try {
            await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
            fetchApiKeys();
        } catch (err) { console.error(err); }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert('Copiado!');
    };

    const handleModeration = async (commentId, mode) => {
        const confirmMsg = mode === 'moderated' ? "Marcar como 'Apagado por Admin'?" : mode === 'hidden' ? "Esconder comentário completamente do site?" : "Restaurar comentário?";
        if (!window.confirm(confirmMsg)) return;

        const resp = await fetch(`/api/admin/comments/${commentId}/moderation`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode })
        });
        
        if (resp.ok) {
            fetchReports(true);
            fetchComments(true);
            fetchModerated(true);
            fetchHidden(true);
        }
    };

    const handleDismissReport = async (reportId) => {
        const resp = await fetch(`/api/admin/reports/${reportId}/dismiss`, { method: 'PATCH' });
        if (resp.ok) fetchReports(true);
    };

    const handleChangeRole = async (userId, newRole) => {
        const resp = await fetch(`/api/admin/users/${userId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        if (resp.ok) fetchUsersList(true);
    };

    const getLocalLink = (item) => {
        const path = item.media_type === 'movie' ? `/filme/${item.content_id}` : `/serie/${item.content_id}`;
        return (
            <Link to={path} className="local-link-adm">
                {item.media_type === 'movie' ? 'Filme' : 'Série'} <ExternalLink size={12} />
            </Link>
        );
    };

    if (!isAuthorized) {
        return (
            <div className="admin-access-denied">
                <Shield size={64} color="#ff4444" />
                <h1>Acesso Negado</h1>
                <p>Este painel é exclusivo para administradores da Zoroflix.</p>
            </div>
        );
    }

    return (
        <div className="admin-page-container">
            <div className="admin-header-main">
                <div className="admin-title-wrap">
                    <Shield size={32} className="admin-icon-glow" />
                    <h1>Painel Administrativo</h1>
                </div>
                <div className="admin-tabs">
                    <button className={activeTab === 'reports' ? 'active' : ''} onClick={() => setActiveTab('reports')}>
                        <AlertTriangle size={18} /> Denúncias
                    </button>
                    <button className={activeTab === 'comments' ? 'active' : ''} onClick={() => setActiveTab('comments')}>
                        <MessageSquare size={18} /> Comentários
                    </button>
                    <button className={activeTab === 'moderated' ? 'active' : ''} onClick={() => setActiveTab('moderated')}>
                        <Trash2 size={18} /> Apagados
                    </button>
                    <button className={activeTab === 'hidden' ? 'active' : ''} onClick={() => setActiveTab('hidden')}>
                        <EyeOff size={18} /> Escondidos
                    </button>
                    <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
                        <Users size={18} /> Usuários
                    </button>
                    <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>
                        <Shield size={18} /> Configurações
                    </button>
                    <button className={activeTab === 'apikeys' ? 'active' : ''} onClick={() => setActiveTab('apikeys')}>
                        <Key size={18} /> API Keys
                    </button>
                    <button className={activeTab === 'analytics' ? 'active' : ''} onClick={() => setActiveTab('analytics')}>
                        <ChartBar size={18} /> Analytics
                    </button>
                </div>
            </div>

            {/* Old analytics block removed */}

            <div className="admin-content-area">
                {/* ABA DENÚNCIAS */}
                {activeTab === 'reports' && (
                    <div className="admin-card-list">
                        <div className="admin-tab-header">
                            <h2>Denúncias Pendentes</h2>
                            <div className="admin-search-bar">
                                <input type="text" placeholder="Buscar..." value={searchReports} onChange={e => setSearchReports(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchReports(true)} />
                                <button onClick={() => fetchReports(true)}><Search size={18}/></button>
                            </div>
                        </div>
                        {reports.length === 0 ? <p className="no-data">Nenhuma denúncia encontrada.</p> : reports.map(r => (
                            <div key={r.id} className="admin-row-card report">
                                <div className="card-header-admin">
                                    <span className="reporter">Por: <b>{r.reporter_nick}</b> | {getLocalLink(r)}</span>
                                    <span className="reason">Motivo: {r.reason}</span>
                                </div>
                                <div className="comment-preview">"{r.comment_text}"</div>
                                <div className="card-actions-admin">
                                    <button className="btn-adm-delete btn-moderation-warn" onClick={() => handleModeration(r.comment_id, 'moderated')}>Avisar</button>
                                    <button className="btn-adm-delete btn-moderation-hidden" onClick={() => handleModeration(r.comment_id, 'hidden')}>Esconder</button>
                                    <button className="btn-adm-safe" onClick={() => handleDismissReport(r.id)}>Ignorar</button>
                                </div>
                            </div>
                        ))}
                        {reports.length >= LIMIT_INITIAL && <button className="admin-pagination-btn" onClick={() => fetchReports()}>Ver Mais</button>}
                    </div>
                )}

                {/* ABA COMENTÁRIOS ATIVOS */}
                {activeTab === 'comments' && (
                    <div className="admin-card-list">
                        <div className="admin-tab-header">
                            <h2>Comentários Ativos</h2>
                            <div className="admin-search-bar">
                                <input type="text" placeholder="Buscar texto ou nick..." value={searchComments} onChange={e => setSearchComments(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchComments(true)} />
                                <button onClick={() => fetchComments(true)}><Search size={18}/></button>
                            </div>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr><th>Usuário</th><th>Comentário</th><th>Local</th><th>Ações</th></tr>
                                </thead>
                                <tbody>
                                    {comments.map(c => (
                                        <tr key={c.id}>
                                            <td>{c.user_nick}</td>
                                            <td className="comment-txt-cell">{c.text}</td>
                                            <td>{getLocalLink(c)}</td>
                                            <td>
                                                <div className="action-row-mini">
                                                    <button onClick={() => handleModeration(c.id, 'moderated')} title="Avisar"><Trash2 size={16} color="#ffab00"/></button>
                                                    <button onClick={() => handleModeration(c.id, 'hidden')} title="Esconder"><EyeOff size={16} color="#ff4444"/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {comments.length >= LIMIT_INITIAL && <button className="admin-pagination-btn" onClick={() => fetchComments()}>Ver Mais</button>}
                    </div>
                )}

                {/* ABA APAGADOS */}
                {activeTab === 'moderated' && (
                    <div className="admin-card-list">
                        <div className="admin-tab-header">
                            <h2>Comentários com Aviso</h2>
                            <div className="admin-search-bar">
                                <input type="text" placeholder="Buscar..." value={searchModerated} onChange={e => setSearchModerated(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchModerated(true)} />
                                <button onClick={() => fetchModerated(true)}><Search size={18}/></button>
                            </div>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr><th>Usuário</th><th>Texto Original</th><th>Ações</th></tr>
                                </thead>
                                <tbody>
                                    {moderatedList.map(c => (
                                        <tr key={c.id}>
                                            <td>{c.user_nick}</td>
                                            <td className="comment-txt-cell">{c.text}</td>
                                            <td>
                                                <div className="action-row-mini">
                                                    {getLocalLink(c)}
                                                    <button onClick={() => handleModeration(c.id, 'active')} title="Restaurar" className="btn-adm-safe mini-rest"><CheckCircle size={16}/></button>
                                                    <button onClick={() => handleModeration(c.id, 'hidden')} title="Mudar para Escondido"><EyeOff size={16} color="#ff4444"/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {moderatedList.length >= LIMIT_INITIAL && <button className="admin-pagination-btn" onClick={() => fetchModerated()}>Ver Mais</button>}
                    </div>
                )}

                {/* ABA ESCONDIDOS */}
                {activeTab === 'hidden' && (
                    <div className="admin-card-list">
                        <div className="admin-tab-header">
                            <h2>Comentários Ocultos</h2>
                            <div className="admin-search-bar">
                                <input type="text" placeholder="Buscar..." value={searchHidden} onChange={e => setSearchHidden(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchHidden(true)} />
                                <button onClick={() => fetchHidden(true)}><Search size={18}/></button>
                            </div>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr><th>Usuário</th><th>Texto Original</th><th>Ações</th></tr>
                                </thead>
                                <tbody>
                                    {hiddenList.map(c => (
                                        <tr key={c.id}>
                                            <td>{c.user_nick}</td>
                                            <td className="comment-txt-cell">{c.text}</td>
                                            <td>
                                                <div className="action-row-mini">
                                                    {getLocalLink(c)}
                                                    <button onClick={() => handleModeration(c.id, 'active')} title="Restaurar" className="btn-adm-safe mini-rest"><CheckCircle size={16}/></button>
                                                    <button onClick={() => handleModeration(c.id, 'moderated')} title="Mudar para Avisar"><Trash2 size={16} color="#ffab00"/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {hiddenList.length >= LIMIT_INITIAL && <button className="admin-pagination-btn" onClick={() => fetchHidden()}>Ver Mais</button>}
                    </div>
                )}

                {/* ABA USUÁRIOS */}
                {activeTab === 'users' && (
                    <div className="admin-users-section">
                        <div className="admin-tab-header">
                            <h2>Gestão de Usuários</h2>
                            <div className="admin-search-bar">
                                <input type="text" placeholder="Nick ou Email..." value={searchUsers} onChange={e => setSearchUsers(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchUsersList(true)} />
                                <button onClick={() => fetchUsersList(true)}><Search size={18}/></button>
                            </div>
                        </div>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr><th>Nick</th><th>Email</th><th>Cargo</th><th>Ações</th></tr>
                                </thead>
                                <tbody>
                                    {usersList.map(u => (
                                        <tr key={u.id}>
                                            <td>{u.nick}</td>
                                            <td>{u.email}</td>
                                            <td><span className={`role-tag ${u.role}`}>{u.role}</span></td>
                                            <td>
                                                <div className="action-row-mini">
                                                    <button onClick={() => handleChangeRole(u.id, 'free')}>Free</button>
                                                    <button onClick={() => handleChangeRole(u.id, 'vip')} className="btn-vip">VIP</button>
                                                    <button onClick={() => handleChangeRole(u.id, 'admin')} className="btn-admin">ADM</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {usersList.length >= LIMIT_INITIAL && <button className="admin-pagination-btn" onClick={() => fetchUsersList()}>Ver Mais</button>}
                    </div>
                )}

                {/* ABA CONFIGURAÇÕES */}
                {activeTab === 'settings' && (
                    <div className="admin-settings-section">
                        <h2>Configurações Globais</h2>
                        <div className="settings-grid-admin">
                            <div className="settings-row-card">
                                <div className="setting-info"><h3>Master Ads Switch</h3><p>Ativa/Desativa todos os anúncios.</p></div>
                                <button className={`btn-toggle-ads ${configs.ads_enabled ? 'active' : ''}`} onClick={() => updateConfig('ads_enabled')}>{configs.ads_enabled ? 'ON' : 'OFF'}</button>
                            </div>
                            <div className="settings-row-card">
                                <div className="setting-info"><h3>Banners</h3><p>Imagens nas páginas de info.</p></div>
                                <button className={`btn-toggle-ads ${configs.ads_banner ? 'active' : ''}`} onClick={() => updateConfig('ads_banner')}>{configs.ads_banner ? 'ON' : 'OFF'}</button>
                            </div>
                            <div className="settings-row-card">
                                <div className="setting-info"><h3>Pop-Unders</h3><p>Novas abas no player.</p></div>
                                <button className={`btn-toggle-ads ${configs.ads_popunder ? 'active' : ''}`} onClick={() => updateConfig('ads_popunder')}>{configs.ads_popunder ? 'ON' : 'OFF'}</button>
                            </div>
                            <div className="settings-row-card">
                                <div className="setting-info"><h3>Social Bar</h3><p>Notificação global.</p></div>
                                <button className={`btn-toggle-ads ${configs.ads_socialbar ? 'active' : ''}`} onClick={() => updateConfig('ads_socialbar')}>{configs.ads_socialbar ? 'ON' : 'OFF'}</button>
                            </div>
                            <div className="settings-row-card warning">
                                <div className="setting-info"><h3>Anti-Adblock</h3><p>Aviso para bloqueadores.</p></div>
                                <button className={`btn-toggle-ads ${configs.anti_adblock ? 'active' : ''}`} onClick={() => updateConfig('anti_adblock')}>{configs.anti_adblock ? 'ON' : 'OFF'}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ABA API KEYS */}
                {activeTab === 'apikeys' && (
                    <div className="admin-settings-section">
                        <h2>Gerenciar API Keys</h2>
                        <p style={{color: '#888', marginBottom: '1.5rem'}}>Crie e gerencie chaves de acesso para a API Mobile. <a href="/api-docs" target="_blank" style={{color: 'var(--primary)'}}>Ver Documentação →</a></p>

                        {/* Criar nova key */}
                        <div className="apikey-create-row">
                            <input
                                type="text"
                                className="apikey-input"
                                placeholder="Nome da chave (ex: App Android, Bot Discord...)"
                                value={newKeyName}
                                onChange={e => setNewKeyName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && createApiKey()}
                            />
                            <button className="apikey-create-btn" onClick={createApiKey}>
                                <Plus size={16} /> Criar Key
                            </button>
                        </div>

                        {/* Key recém-criada */}
                        {newKeyResult && (
                            <div className="apikey-new-result">
                                <p>🔑 Chave criada! Copie agora, ela não será mostrada novamente completa:</p>
                                <div className="apikey-display">
                                    <code>{newKeyResult}</code>
                                    <button onClick={() => copyToClipboard(newKeyResult)}><Copy size={14} /></button>
                                </div>
                                <button className="apikey-dismiss" onClick={() => setNewKeyResult(null)}>Entendido</button>
                            </div>
                        )}

                        {/* Lista de keys */}
                        <div className="admin-table-wrap" style={{marginTop: '1.5rem'}}>
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Nome</th>
                                        <th>Key</th>
                                        <th>Status</th>
                                        <th>Último Uso</th>
                                        <th>Criada Em</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {apiKeys.length === 0 ? (
                                        <tr><td colSpan="6" style={{textAlign: 'center', color: '#666', padding: '2rem'}}>Nenhuma API Key criada ainda.</td></tr>
                                    ) : apiKeys.map(k => (
                                        <tr key={k.id} style={{opacity: k.active ? 1 : 0.5}}>
                                            <td><strong>{k.name}</strong></td>
                                            <td>
                                                <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                                                    <code className="apikey-masked">{k.key.substring(0, 8)}...{k.key.substring(k.key.length - 4)}</code>
                                                    <button className="btn-copy-mini" onClick={() => copyToClipboard(k.key)} title="Copiar"><Copy size={12} /></button>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`apikey-status ${k.active ? 'active' : 'inactive'}`}>
                                                    {k.active ? 'Ativa' : 'Inativa'}
                                                </span>
                                            </td>
                                            <td style={{fontSize:'0.8rem', color:'#888'}}>{k.last_used ? new Date(k.last_used).toLocaleString() : 'Nunca'}</td>
                                            <td style={{fontSize:'0.8rem', color:'#888'}}>{new Date(k.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <div className="action-row-mini">
                                                    <button onClick={() => toggleApiKey(k.id)} title={k.active ? 'Desativar' : 'Ativar'}>
                                                        <Power size={16} color={k.active ? '#4caf50' : '#ff4444'} />
                                                    </button>
                                                    <button onClick={() => deleteApiKey(k.id)} title="Deletar">
                                                        <Trash2 size={16} color="#ff4444" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ABA ANALYTICS */}
                {activeTab === 'analytics' && (
                    <div className="admin-analytics-section">
                        <div className="admin-tab-header">
                            <h2>Visão Geral</h2>
                            <button className="btn-adm-delete btn-moderation-warn" onClick={async () => {
                                if (window.confirm('Tem certeza que deseja zerar TODAS as estatísticas históricas?')) {
                                    const resp = await fetch('/api/admin/stats/clear', { method: 'DELETE' });
                                    if (resp.ok) { fetchStats(); alert('Estatísticas zeradas.'); }
                                }
                            }}>
                                <Trash2 size={16} /> Zerar Histórico
                            </button>
                        </div>
                        
                        <div className="stats-cards-grid">
                            <div className="stat-card">
                                <Users className="stat-icon pulse" color="#ff4444" />
                                <div className="stat-info">
                                    <h3>Online Agora</h3>
                                    <p className="stat-value highlight">{onlineCount}</p>
                                </div>
                            </div>
                            <div className="stat-card">
                                <ChartBar className="stat-icon" color="#2196f3" />
                                <div className="stat-info">
                                    <h3>Acessos Hoje</h3>
                                    <p className="stat-value">{stats.daily}</p>
                                </div>
                            </div>
                            <div className="stat-card">
                                <ChartBar className="stat-icon" color="#4caf50" />
                                <div className="stat-info">
                                    <h3>Acessos Semana</h3>
                                    <p className="stat-value">{stats.weekly}</p>
                                </div>
                            </div>
                            <div className="stat-card">
                                <UserCheck className="stat-icon" color="#4caf50" />
                                <div className="stat-info">
                                    <h3>Pessoas Semana</h3>
                                    <p className="stat-value">{stats.weeklyUnique}</p>
                                </div>
                            </div>
                            <div className="stat-card">
                                <ChartBar className="stat-icon" color="#ff9800" />
                                <div className="stat-info">
                                    <h3>Acessos Mês</h3>
                                    <p className="stat-value">{stats.monthly}</p>
                                </div>
                            </div>
                            <div className="stat-card">
                                <UserCheck className="stat-icon" color="#ff9800" />
                                <div className="stat-info">
                                    <h3>Pessoas Mês</h3>
                                    <p className="stat-value">{stats.monthlyUnique}</p>
                                </div>
                            </div>
                        </div>

                        <div className="admin-tab-header" style={{ marginTop: '3rem' }}>
                            <h2><Shield size={20} /> O que estão assistindo agora?</h2>
                            <span style={{ fontSize: '0.8rem', color: '#888' }}>Auto-refresh a cada 5s</span>
                        </div>

                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Usuário</th>
                                        <th>Visualizando / Página</th>
                                        <th>Última Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {liveSessions.length === 0 ? (
                                        <tr><td colSpan="3" style={{textAlign: 'center', color: '#666', padding: '2rem'}}>Nenhum usuário ativo no momento.</td></tr>
                                    ) : liveSessions.map(s => (
                                        <tr key={s.uuid}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div className={`live-dot-mini ${s.name !== 'Visitante' ? 'logged' : ''}`}></div>
                                                    <strong>{s.name}</strong>
                                                </div>
                                            </td>
                                            <td>
                                                <Link to={s.page} className="live-page-link" target="_blank">
                                                    {s.title}
                                                    <ExternalLink size={12} style={{marginLeft: '6px', opacity: 0.5}} />
                                                </Link>
                                                <br/>
                                                <span style={{fontSize: '0.7rem', color: '#666'}}>{s.page}</span>
                                            </td>
                                            <td style={{ fontSize: '0.8rem', color: '#aaa' }}>
                                                {new Date(s.lastSeen + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
