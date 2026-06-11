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
    const [adsEnabled, setAdsEnabled] = useState(false);

    useEffect(() => {
        if (!isAuthorized) return;
        if (activeTab === 'reports') fetchReports();
        if (activeTab === 'comments') fetchComments();
        if (activeTab === 'settings') fetchAdConfig();
    }, [activeTab, isAuthorized]);

    const fetchAdConfig = async () => {
        const resp = await fetch('/api/admin/config/ads');
        const data = await resp.json();
        setAdsEnabled(data.ads_enabled);
    };

    const toggleAds = async () => {
        const newValue = !adsEnabled;
        const resp = await fetch('/api/admin/config/ads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: newValue })
        });
        if (resp.ok) setAdsEnabled(newValue);
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
                        <div className="settings-row-card">
                            <div className="setting-info">
                                <h3>Sistema de Anúncios</h3>
                                <p>Ativar ou desativar todos os anúncios (Banners, Pop-unders e Social Bar) para usuários sem VIP.</p>
                            </div>
                            <button 
                                className={`btn-toggle-ads ${adsEnabled ? 'active' : ''}`} 
                                onClick={toggleAds}
                            >
                                {adsEnabled ? 'ATIVADOS' : 'DESATIVADOS'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
