import React, { useState, useEffect } from 'react';
import { Database, Image as ImageIcon, Trash2, KeyRound, ArrowRight, Loader } from 'lucide-react';
import './StoragePage.css';

export default function StoragePage() {
    const [token, setToken] = useState(localStorage.getItem('storage_token'));
    const [user, setUser] = useState(null);
    const [files, setFiles] = useState([]);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        if (token) {
            fetchFiles();
            // Parse JWT for username (simplified)
            try {
                // Not strictly needed, we can just fetch my-files and assume we are logged in.
            } catch (e) {}
        }
    }, [token]);

    const handleAuth = async (type) => {
        if (!username || !password) return alert("Preencha usuário e senha.");
        setLoading(true);
        try {
            const res = await fetch(`/api/storage/${type}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('storage_token', data.token);
                setToken(data.token);
                setUser(data.user);
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        localStorage.removeItem('storage_token');
        setToken(null);
        setUser(null);
        setFiles([]);
    };

    const fetchFiles = async () => {
        try {
            const res = await fetch('/api/storage/my-files', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFiles(data);
            } else if (res.status === 401) {
                logout();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Apagar permanentemente este arquivo?")) return;
        try {
            const res = await fetch(`/api/storage/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) fetchFiles();
        } catch (err) {
            console.error(err);
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/api/storage/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            if (res.ok) {
                fetchFiles();
            } else {
                alert("Erro no upload");
            }
        } catch (err) {
            console.error(err);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    if (!token) {
        return (
            <div className="storage-auth-page">
                <div className="storage-auth-card">
                    <Database size={48} color="#00ff88" />
                    <h1>Zoro Storage CDN</h1>
                    <p>Hospedagem de imagens e arquivos de alta performance</p>
                    
                    <div className="auth-form">
                        <input type="text" placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} />
                        <input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />
                        <div className="auth-buttons">
                            <button onClick={() => handleAuth('login')} disabled={loading}>
                                {loading ? <Loader className="spin" size={16}/> : 'Entrar'}
                            </button>
                            <button className="btn-secondary" onClick={() => handleAuth('register')} disabled={loading}>
                                Criar Conta
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="storage-dashboard">
            <header className="storage-header">
                <div className="logo">
                    <Database size={24} color="#00ff88" /> Zoro Storage
                </div>
                <div className="user-menu">
                    <span>Olá, {user?.username || 'Usuário'}</span>
                    <button className="btn-logout" onClick={logout}>Sair</button>
                </div>
            </header>

            <main className="storage-main">
                <div className="storage-sidebar">
                    <div className="api-key-box">
                        <h3><KeyRound size={16} /> Sua API Key</h3>
                        <p>Use no header <code>x-api-key</code> para autenticar chamadas externas de bots ou scripts.</p>
                        <code>{user?.api_key || '***************'}</code>
                    </div>

                    <div className="upload-box">
                        <label className="btn-upload">
                            {uploading ? <Loader className="spin" size={18}/> : <ImageIcon size={18} />} 
                            {uploading ? 'Enviando...' : 'Fazer Upload (Max 10MB)'}
                            <input type="file" accept="image/*,video/mp4" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
                        </label>
                    </div>
                </div>

                <div className="storage-content">
                    <h2>Seus Arquivos ({files.length})</h2>
                    {files.length === 0 ? (
                        <div className="empty-state">
                            Nenhum arquivo enviado ainda. Use o botão ao lado.
                        </div>
                    ) : (
                        <div className="files-grid">
                            {files.map(f => (
                                <div key={f.id} className="file-card">
                                    <div className="file-preview">
                                        {f.mime_type.startsWith('image/') ? (
                                            <img src={f.url} alt={f.file_name} />
                                        ) : (
                                            <div className="no-preview">Sem Preview</div>
                                        )}
                                    </div>
                                    <div className="file-info">
                                        <span className="file-name" title={f.file_name}>{f.file_name}</span>
                                        <span className="file-size">{(f.size / 1024).toFixed(1)} KB</span>
                                        <div className="file-actions">
                                            <button className="btn-copy" onClick={() => {
                                                navigator.clipboard.writeText(window.location.origin + f.url);
                                                alert("Link copiado!");
                                            }}>Copiar URL</button>
                                            <button className="btn-delete" onClick={() => handleDelete(f.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
