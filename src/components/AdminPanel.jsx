import React, { useState, useEffect } from 'react';
import { Shield, MessageSquare, AlertTriangle, Users, Search, Trash2, CheckCircle, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminPanel() {
    const { user } = useAuth();
    const isAuthorized = user && user.role === 'admin';


    const [activeTab, setActiveTab] = useState('reports');
    const [reports, setReports] = useState([]);
    const [comments, setComments] = useState([]);
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [configs, setConfigs] = useState({});

    useEffect(() => {
        if (!isAuthorized) return;
        if (activeTab === 'reports') fetchReports();
        if (activeTab === 'comments') fetchComments();
        if (activeTab === 'settings') fetchConfigs();
    }, [activeTab, isAuthorized]);

    const fetchConfigs = async () => {
        const resp = await fetch('/api/admin/config/all');
        const data = await resp.json();
        setConfigs(data);
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

    const fetchReports = async () => {
        setLoading(true);
        const resp = await fetch('/api/admin/reports');
        const data = await resp.json();
        setReports(data);
        setLoading(false);
    };

    const fetchComments = async () => {
        setLoading(true);
        const resp = await fetch('/api/admin/comments');
        const data = await resp.json();
        setComments(data);
        setLoading(false);
    };

    const searchUsers = async () => {
        if (!searchQuery) return;
        setLoading(true);
        const resp = await fetch(`/api/admin/users?query=${searchQuery}`);
        const data = await resp.json();
        setUsers(data);
        setLoading(false);
    };

    const handleDeleteComment = async (commentId) => {
        if (!window.confirm('Deseja realmente apagar este comentário?')) return;
        const resp = await fetch(`/api/admin/comments/${commentId}/delete`, { method: 'PATCH' });
        if (resp.ok) {
            if (activeTab === 'reports') fetchReports();
            if (activeTab === 'comments') fetchComments();
        }
    };

    const handleDismissReport = async (reportId) => {
        const resp = await fetch(`/api/admin/reports/${reportId}/dismiss`, { method: 'PATCH' });
        if (resp.ok) fetchReports();
    };

    const handleChangeRole = async (userId, newRole) => {
        const resp = await fetch(`/api/admin/users/${userId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        if (resp.ok) searchUsers();
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
                        <AlertTriangle size={18} /> Denúncias {reports.length > 0 && <span className="admin-badge">{reports.length}</span>}
                    </button>
                    <button className={activeTab === 'comments' ? 'active' : ''} onClick={() => setActiveTab('comments')}>
                        <MessageSquare size={18} /> Comentários
                    </button>
                    <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
                        <Users size={18} /> Usuários
                    </button>
                    <button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}>
                        <Shield size={18} /> Configurações
                    </button>
                </div>
            </div>

            <div className="admin-content-area">
                {activeTab === 'reports' && (
                    <div className="admin-card-list">
                        <h2>Denúncias Pendentes</h2>
                        {reports.length === 0 ? <p className="no-data">Nenhuma denúncia no momento.</p> : reports.map(r => (
                            <div key={r.id} className="admin-row-card report">
                                <div className="card-header-admin">
                                    <span className="reporter">Por: <b>{r.reporter_nick}</b></span>
                                    <span className="reason">Motivo: {r.reason}</span>
                                </div>
                                <div className="comment-preview">"{r.comment_text}"</div>
                                <div className="card-actions-admin">
                                    <button className="btn-adm-delete" onClick={() => handleDeleteComment(r.comment_id)}>Apagar Comentário</button>
                                    <button className="btn-adm-safe" onClick={() => handleDismissReport(r.id)}>Ignorar</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'comments' && (
                    <div className="admin-card-list">
                        <h2>Últimos 50 Comentários</h2>
                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Usuário</th>
                                        <th>Comentário</th>
                                        <th>Local</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comments.map(c => (
                                        <tr key={c.id}>
                                            <td>{c.user_nick}</td>
                                            <td className="comment-txt-cell">{c.text}</td>
                                            <td>{c.media_type} ({c.content_id})</td>
                                            <td>
                                                <button className="icon-btn-delete" title="Apagar" onClick={() => handleDeleteComment(c.id)}><Trash2 size={16}/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="admin-users-section">
                        <div className="admin-search-bar">
                            <input 
                                type="text" placeholder="Pesquisar por nick ou email..." 
                                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && searchUsers()}
                            />
                            <button onClick={searchUsers}><Search size={20}/></button>
                        </div>

                        <div className="admin-table-wrap">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Nick</th>
                                        <th>Email</th>
                                        <th>Cargo</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id}>
                                            <td>{u.nick}</td>
                                            <td>{u.email}</td>
                                            <td><span className={`role-tag ${u.role}`}>{u.role}</span></td>
                                            <td>
                                                <div className="action-row-mini">
                                                    <button onClick={() => handleChangeRole(u.id, 'free')} title="Tornar Free">Free</button>
                                                    <button onClick={() => handleChangeRole(u.id, 'vip')} className="btn-vip" title="Tornar VIP">VIP</button>
                                                    <button onClick={() => handleChangeRole(u.id, 'admin')} className="btn-admin" title="Tornar ADM">ADM</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="admin-settings-section">
                        <h2>Configurações Globais</h2>
                        
                        <div className="settings-grid-admin">
                            <div className="settings-row-card">
                                <div className="setting-info">
                                    <h3>Master Ads Switch</h3>
                                    <p>Ativa/Desativa todos os anúncios de uma vez.</p>
                                </div>
                                <button className={`btn-toggle-ads ${configs.ads_enabled ? 'active' : ''}`} onClick={() => updateConfig('ads_enabled')}>
                                    {configs.ads_enabled ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            <div className="settings-row-card">
                                <div className="setting-info">
                                    <h3>Banners (Imagens)</h3>
                                    <p>Anúncios visuais nas páginas de info.</p>
                                </div>
                                <button className={`btn-toggle-ads ${configs.ads_banner ? 'active' : ''}`} onClick={() => updateConfig('ads_banner')}>
                                    {configs.ads_banner ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            <div className="settings-row-card">
                                <div className="setting-info">
                                    <h3>Pop-Unders (Player)</h3>
                                    <p>Anúncios que abrem novas abas no player.</p>
                                </div>
                                <button className={`btn-toggle-ads ${configs.ads_popunder ? 'active' : ''}`} onClick={() => updateConfig('ads_popunder')}>
                                    {configs.ads_popunder ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            <div className="settings-row-card">
                                <div className="setting-info">
                                    <h3>Social Bar (Flutuante)</h3>
                                    <p>Notificação de anúncio global no canto.</p>
                                </div>
                                <button className={`btn-toggle-ads ${configs.ads_socialbar ? 'active' : ''}`} onClick={() => updateConfig('ads_socialbar')}>
                                    {configs.ads_socialbar ? 'ON' : 'OFF'}
                                </button>
                            </div>

                            <div className="settings-row-card warning">
                                <div className="setting-info">
                                    <h3>Anti-Adblock</h3>
                                    <p>Exibir aviso para quem usar bloqueadores.</p>
                                </div>
                                <button className={`btn-toggle-ads ${configs.anti_adblock ? 'active' : ''}`} onClick={() => updateConfig('anti_adblock')}>
                                    {configs.anti_adblock ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
