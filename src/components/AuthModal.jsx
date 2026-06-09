import React, { useState } from 'react';
import { X, User, Mail, Lock, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({ isOpen, onClose }) {
    const [isLogin, setIsLogin] = useState(true);
    const { login, uuid } = useAuth();
    const [formData, setFormData] = useState({ nick: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
        const payload = isLogin 
            ? { email: formData.email, password: formData.password }
            : { ...formData, uuid };

        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();

            if (resp.ok) {
                login(data.user, data.token);
                onClose();
            } else {
                setError(data.error || 'Erro ao processar solicitação.');
            }
        } catch (err) {
            setError('Erro de conexão com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-overlay" onClick={onClose}>
            <div className="auth-sidebar" onClick={e => e.stopPropagation()}>
                <button className="auth-close" onClick={onClose}><X size={24} /></button>
                
                <div className="auth-header">
                    <h2>{isLogin ? 'Bem-vindo de volta' : 'Criar Conta'}</h2>
                    <p>{isLogin ? 'Entre para comentar e salvar favoritos' : 'Cadastre-se para participar da comunidade'}</p>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form className="auth-form" onSubmit={handleSubmit}>
                    {!isLogin && (
                        <div className="auth-input-group">
                            <User size={18} className="auth-input-icon" />
                            <input 
                                type="text" placeholder="Seu Nickname" required 
                                value={formData.nick} onChange={e => setFormData({...formData, nick: e.target.value})}
                            />
                        </div>
                    )}
                    
                    <div className="auth-input-group">
                        <Mail size={18} className="auth-input-icon" />
                        <input 
                            type="email" placeholder="Email" required 
                            value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                        />
                    </div>

                    <div className="auth-input-group">
                        <Lock size={18} className="auth-input-icon" />
                        <input 
                            type="password" placeholder="Senha" required 
                            value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                        />
                    </div>

                    <button className="auth-submit-btn" disabled={loading}>
                        {loading ? 'Processando...' : (isLogin ? 'Entrar' : 'Cadastrar')}
                        {isLogin ? <LogIn size={18} /> : <UserPlus size={18} />}
                    </button>
                </form>

                <div className="auth-switch">
                    {isLogin ? 'Não tem conta?' : 'Já tem conta?'}
                    <button onClick={() => setIsLogin(!isLogin)}>
                        {isLogin ? 'Cadastrar agora' : 'Fazer Login'}
                    </button>
                </div>
            </div>
        </div>
    );
}
