import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, KeyRound, Loader, CheckCircle, ArrowLeft } from 'lucide-react';

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    if (!token) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px', color: '#fff' }}>
                <h2>Token inválido ou ausente</h2>
                <Link to="/" style={{ color: '#00ff88' }}>Voltar para a Home</Link>
            </div>
        );
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        if (password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password })
            });
            const data = await res.json();

            if (res.ok) {
                setSuccess(true);
            } else {
                setError(data.error || 'Erro ao redefinir a senha.');
            }
        } catch (err) {
            setError('Falha de conexão com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            padding: '20px',
            background: 'url(/hero-bg.jpg) center/cover no-repeat',
            position: 'relative'
        }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(11, 12, 16, 0.9)' }}></div>
            
            <div style={{
                position: 'relative',
                background: '#13131a',
                border: '1px solid rgba(0, 255, 136, 0.2)',
                borderRadius: '16px',
                padding: '40px',
                width: '100%',
                maxWidth: '450px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                textAlign: 'center'
            }}>
                <div style={{ marginBottom: '30px' }}>
                    <KeyRound size={48} color="#00ff88" style={{ margin: '0 auto 15px auto' }} />
                    <h2 style={{ color: '#fff', fontSize: '1.8rem', marginBottom: '10px' }}>Nova Senha</h2>
                    <p style={{ color: '#9ba0a3', fontSize: '0.95rem' }}>Crie uma nova senha segura para sua conta CineGeek.</p>
                </div>

                {success ? (
                    <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
                        <CheckCircle size={64} color="#00ff88" style={{ margin: '0 auto 20px auto' }} />
                        <h3 style={{ color: '#00ff88', marginBottom: '15px' }}>Senha atualizada!</h3>
                        <p style={{ color: '#d1d1d6', marginBottom: '25px' }}>Sua senha foi redefinida com sucesso.</p>
                        <Link to="/" style={{
                            display: 'inline-block',
                            background: '#00ff88',
                            color: '#000',
                            padding: '12px 30px',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            textDecoration: 'none'
                        }}>
                            Ir para a Home
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {error && (
                            <div style={{
                                background: 'rgba(255, 68, 68, 0.1)',
                                color: '#ff4444',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 68, 68, 0.3)',
                                fontSize: '0.9rem'
                            }}>
                                {error}
                            </div>
                        )}

                        <div style={{ position: 'relative' }}>
                            <Lock size={20} color="#9ba0a3" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input 
                                type="password" 
                                placeholder="Nova Senha" 
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '15px 15px 15px 45px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                                onFocus={e => e.target.style.borderColor = '#00ff88'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                            />
                        </div>

                        <div style={{ position: 'relative' }}>
                            <Lock size={20} color="#9ba0a3" style={{ position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input 
                                type="password" 
                                placeholder="Confirmar Nova Senha" 
                                required
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '15px 15px 15px 45px',
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                                onFocus={e => e.target.style.borderColor = '#00ff88'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                            />
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '15px',
                                background: '#00ff88',
                                color: '#000',
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '1.1rem',
                                fontWeight: 'bold',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '10px',
                                marginTop: '10px',
                                opacity: loading ? 0.7 : 1
                            }}
                        >
                            {loading ? <Loader className="spin-anim" size={20} /> : 'Salvar Nova Senha'}
                        </button>
                    </form>
                )}

                <div style={{ marginTop: '30px' }}>
                    <Link to="/" style={{ color: '#9ba0a3', textDecoration: 'none', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        <ArrowLeft size={16} /> Voltar para o Início
                    </Link>
                </div>
            </div>
            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .spin-anim { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
}
