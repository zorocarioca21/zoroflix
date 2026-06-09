import React, { useState, useEffect } from 'react';
import { Shield, MessageSquare, AlertTriangle, Users, Search, Trash2, CheckCircle, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminPanel() {
    const { user } = useAuth();
    // Estado para verificação manual
    const [identifier, setIdentifier] = useState('');
    const [isAdminVerified, setIsAdminVerified] = useState(false);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyError, setVerifyError] = useState('');
    const isAuthorized = user && (user.role === 'admin' || isAdminVerified);


    const [activeTab, setActiveTab] = useState('reports');
    const [reports, setReports] = useState([]);
    const [comments, setComments] = useState([]);
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!isAuthorized) return;
        if (activeTab === 'reports') fetchReports();
        if (activeTab === 'comments') fetchComments();
    }, [activeTab, isAuthorized]);

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
        const handleVerify = async () => {
            if (!identifier) return;
            setVerifyLoading(true);
            setVerifyError('');
            try {
                const resp = await fetch('/api/admin/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier })
                });
                const data = await resp.json();
                if (data.isAdmin) {
                    setIsAdminVerified(true);
                } else {
                    setVerifyError('Usuário não é administrador.');
                }
            } catch (err) {
                setVerifyError('Erro ao verificar administrador.');
            } finally {
                setVerifyLoading(false);
            }
        };

        return (
            <div className="admin-access-denied">
                <Shield size={64} color="#ff4444" />
                <h1>Acesso Negado</h1>
                <p>Este painel é exclusivo para administradores da Zoroflix.</p>
                <div className="admin-verify-form" style={{ marginTop: '1rem' }}>
                    <input
                        type="text"
                        placeholder="Nick ou Email"
                        value={identifier}
                        onChange={e => setIdentifier(e.target.value)}
                        disabled={verifyLoading}
                    />
                    <button onClick={handleVerify} disabled={verifyLoading}>Verificar</button>
                </div>
                {verifyError && <p style={{ color: '#ff4444', marginTop: '0.5rem' }}>{verifyError}</p>}
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
            </div>
        </div>
    );
}
