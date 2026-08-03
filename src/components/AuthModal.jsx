import React, { useState } from 'react';
import { X, User, Mail, Lock, LogIn, UserPlus, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({ isOpen, onClose }) {
    const [isLogin, setIsLogin] = useState(true);
    const [isForgot, setIsForgot] = useState(false);
    const { login, uuid } = useAuth();
    const [formData, setFormData] = useState({ nick: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');
        setLoading(true);

        if (isForgot) {
            try {
                const resp = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: formData.email })
                });
                const data = await resp.json();
                if (resp.ok) {
                    setSuccessMsg(data.message);
                } else {
                    setError(data.error || 'Erro ao solicitar redefinição.');
                }
            } catch (err) {
                setError('Erro de conexão com o servidor.');
            } finally {
                setLoading(false);
            }
            return;
        }

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
                    <h2>{isForgot ? 'Recuperar Senha' : (isLogin ? 'Bem-vindo de volta' : 'Criar Conta')}</h2>
                    <p>{isForgot ? 'Enviaremos um link para redefinir sua senha' : (isLogin ? 'Entre para comentar e salvar favoritos' : 'Cadastre-se para participar da comunidade')}</p>
                </div>

                {error && <div className="auth-error">{error}</div>}
                {successMsg && <div className="auth-success" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', padding: '10px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #00ff88', fontSize: '0.9rem', textAlign: 'center' }}>{successMsg}</div>}

                <form className="auth-form" onSubmit={handleSubmit}>
                    {!isLogin && !isForgot && (
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

                    {!isForgot && (
                        <div className="auth-input-group">
                            <Lock size={18} className="auth-input-icon" />
                            <input 
                                type="password" placeholder="Senha" required 
                                value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                            />
                        </div>
                    )}

                    <button className="auth-submit-btn" disabled={loading}>
                        {loading ? 'Processando...' : (isForgot ? 'Enviar Link' : (isLogin ? 'Entrar' : 'Cadastrar'))}
                        {isForgot ? <KeyRound size={18} /> : (isLogin ? <LogIn size={18} /> : <UserPlus size={18} />)}
                    </button>
                </form>

                <div className="auth-switch" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {isLogin && !isForgot && (
                        <button onClick={() => { setIsForgot(true); setError(''); setSuccessMsg(''); }} style={{ color: '#00ff88', fontSize: '0.85rem' }}>
                            Esqueci minha senha
                        </button>
                    )}
                    
                    <div>
                        {isForgot ? 'Lembrou a senha?' : (isLogin ? 'Não tem conta?' : 'Já tem conta?')}
                        <button onClick={() => { setIsForgot(false); setIsLogin(!isLogin && !isForgot ? true : !isLogin); setError(''); setSuccessMsg(''); }} style={{ marginLeft: '5px' }}>
                            {isForgot ? 'Voltar para Login' : (isLogin ? 'Cadastrar agora' : 'Fazer Login')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
