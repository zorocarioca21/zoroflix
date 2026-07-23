import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Camera, Edit2, Calendar, ShieldCheck, Clock, Heart } from 'lucide-react';

export default function UserProfile() {
    const { user, login } = useAuth();
    const [newNick, setNewNick] = useState(user?.nick || '');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    React.useEffect(() => {
        if (user?.nick) {
            setNewNick(user.nick);
        }
    }, [user]);

    if (!user) return <div className="profile-error">Faça login para ver seu perfil.</div>;

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('avatar', file);
        formData.append('userId', user.id);

        try {
            setLoading(true);
            const resp = await fetch('/api/profile/upload-avatar', {
                method: 'POST',
                body: formData
            });
            const data = await resp.json();
            if (resp.ok) {
                login({ ...user, avatar: data.avatar }, localStorage.getItem('cinegeek_token'));
                setMsg({ type: 'success', text: 'Foto atualizada!' });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Erro ao enviar imagem.' });
        } finally {
            setLoading(false);
        }
    };

    const handleNickChange = async () => {
        if (newNick === user.nick) return;
        try {
            setLoading(true);
            const resp = await fetch('/api/profile/update-nick', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, newNick })
            });
            const data = await resp.json();
            if (resp.ok) {
                login({ ...user, nick: newNick }, localStorage.getItem('cinegeek_token'));
                setMsg({ type: 'success', text: 'Nome de usuário atualizado!' });
            } else {
                setMsg({ type: 'error', text: data.error });
            }
        } catch (err) {
            setMsg({ type: 'error', text: 'Erro ao conectar ao servidor.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="profile-page-container">
            <div className="profile-card">
                <div className="profile-header-meta">
                    <div className="avatar-edit-wrap">
                        <img 
                            src={user.avatar && !user.avatar.includes('zorobot.shop') ? user.avatar : '/default-avatar.svg'} 
                            alt="Avatar" 
                            className="profile-avatar-big" 
                            onError={(e) => { e.target.onerror = null; e.target.src = '/default-avatar.svg'; }}
                        />
                        <label className="avatar-upload-btn">
                            <Camera size={20} />
                            <input type="file" hidden accept="image/*" onChange={handleAvatarChange} />
                        </label>
                    </div>
                    <div className="profile-title">
                        <h1>{user.nick}</h1>
                        <span className={`role-badge ${user.role}`}>{user.role.toUpperCase()}</span>
                    </div>
                </div>

                {msg.text && <div className={`profile-msg ${msg.type}`}>{msg.text}</div>}

                <div className="profile-content-grid">
                    <div className="profile-section">
                        <h3><Edit2 size={18} /> Editar Perfil</h3>
                        <div className="profile-field">
                            <label>Nome de Usuário</label>
                            <div className="input-with-btn">
                                <input 
                                    type="text" value={newNick} 
                                    onChange={(e) => setNewNick(e.target.value)} 
                                />
                                <button onClick={handleNickChange} disabled={loading}>Salvar</button>
                            </div>
                            <p className="field-hint"><Clock size={12} /> Você pode mudar o nick uma vez a cada 30 dias.</p>
                        </div>
                        
                        <div className="profile-field">
                            <label>E-mail</label>
                            <input type="email" value={user.email} disabled />
                            <p className="field-hint">O e-mail não pode ser alterado por segurança.</p>
                        </div>
                    </div>

                    <div className="profile-section status-sec">
                        <h3><ShieldCheck size={18} /> Status da Conta</h3>
                        <div className="status-item">
                            <Calendar size={18} />
                            <span>Membro desde: {new Date(user.created_at || Date.now()).toLocaleDateString()}</span>
                        </div>
                        <div className="status-item">
                            <ShieldCheck size={18} />
                            <span>Tipo de Conta: <strong>{user.role === 'free' ? 'Gratuita' : 'Premium'}</strong></span>
                        </div>
                    </div>

                    <div className="profile-section">
                        <h3><Heart size={18} /> Sincronizar Favoritos</h3>
                        <p className="field-hint" style={{marginBottom: '1rem'}}>
                            Se você salvou filmes como visitante antes de fazer login neste navegador, clique abaixo para importá--los para a sua conta.
                        </p>
                        <button 
                            className="btn-main-play" 
                            style={{width: '100%', padding: '0.8rem'}}
                            onClick={async () => {
                                setLoading(true);
                                try {
                                    const token = localStorage.getItem('cinegeek_token');
                                    const uuidLocal = localStorage.getItem('cinegeek_uuid');
                                    const res = await fetch('/api/favorites/sync', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Bearer ${token}`,
                                            'x-device-uuid': uuidLocal
                                        }
                                    });
                                    const data = await res.json();
                                    if (res.ok) {
                                        setMsg({ type: 'success', text: `Sucesso! ${data.count} favoritos importados.` });
                                    } else {
                                        setMsg({ type: 'error', text: data.error || 'Erro na sincronização' });
                                    }
                                } catch (e) {
                                    setMsg({ type: 'error', text: 'Erro ao comunicar com servidor.' });
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                        >
                            Importar Favoritos do Dispositivo
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
