import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Loader, AlertTriangle } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAAFZ5H2yd0GPwKeFK';
const STORAGE_KEY = 'cinegeek_cf_clearance';

export default function TurnstileGatekeeper({ children }) {
    const location = useLocation();
    const { user } = useAuth();
    const widgetRef = useRef(null);
    const widgetIdRef = useRef(null);

    const [isVerified, setIsVerified] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved) return false;
            const parsed = JSON.parse(saved);
            // Clearance válida por 4 horas
            if (parsed.timestamp && Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000) {
                return true;
            }
            localStorage.removeItem(STORAGE_KEY);
            return false;
        } catch (e) {
            return false;
        }
    });

    const [isChecking, setIsChecking] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    // Rotas liberadas da verificação:
    // 1. Painel Administrativo completo
    // 2. Documentação de API (/api-docs, /api/docs, /docs, /api)
    // 3. Usuário autenticado como Administrador
    const path = location.pathname.toLowerCase();
    const isExempt = 
        user?.role === 'admin' ||
        path.startsWith('/paineladm') ||
        path === '/api-docs' ||
        path === '/api/docs' ||
        path === '/docs' ||
        path === '/api';

    useEffect(() => {
        if (isExempt || isVerified) return;

        let interval = null;

        const renderTurnstile = () => {
            if (!window.turnstile || !widgetRef.current) return false;

            if (widgetIdRef.current !== null) {
                try { window.turnstile.remove(widgetIdRef.current); } catch (e) {}
            }

            try {
                widgetIdRef.current = window.turnstile.render(widgetRef.current, {
                    sitekey: TURNSTILE_SITE_KEY,
                    theme: 'dark',
                    callback: async (token) => {
                        setIsChecking(true);
                        setErrorMessage(null);
                        try {
                            const res = await fetch('/api/turnstile/verify', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ token })
                            });
                            const data = await res.json();
                            if (res.ok && data.success) {
                                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                                    timestamp: Date.now()
                                }));
                                setIsVerified(true);
                            } else {
                                setErrorMessage('Falha na verificação de segurança. Tente novamente.');
                                if (window.turnstile && widgetIdRef.current !== null) {
                                    window.turnstile.reset(widgetIdRef.current);
                                }
                            }
                        } catch (err) {
                            setErrorMessage('Erro de comunicação com o servidor de validação.');
                            if (window.turnstile && widgetIdRef.current !== null) {
                                window.turnstile.reset(widgetIdRef.current);
                            }
                        } finally {
                            setIsChecking(false);
                        }
                    },
                    'error-callback': () => {
                        setErrorMessage('Não foi possível carregar o desafio Cloudflare. Recarregue a página.');
                    }
                });
                return true;
            } catch (err) {
                console.error('Erro render Turnstile:', err);
                return false;
            }
        };

        if (!renderTurnstile()) {
            interval = setInterval(() => {
                if (renderTurnstile()) {
                    clearInterval(interval);
                }
            }, 500);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isExempt, isVerified, path]);

    // Se estiver liberado ou verificado, renderiza o site normalmente
    if (isExempt || isVerified) {
        return children;
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: '#070b09',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999999,
            padding: '1.5rem',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
            <div style={{
                background: '#0d1411',
                border: '1px solid #1a2f24',
                borderRadius: '24px',
                padding: '2.5rem 2rem',
                maxWidth: '440px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 25px 60px rgba(0,0,0,0.85)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
            }}>
                <div style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '20px',
                    background: 'rgba(0, 255, 136, 0.1)',
                    border: '1px solid rgba(0, 255, 136, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.5rem',
                    color: '#00ff88'
                }}>
                    <ShieldCheck size={38} />
                </div>

                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    color: '#fff',
                    marginBottom: '0.6rem',
                    letterSpacing: '-0.02em'
                }}>
                    Verificação de Segurança
                </h2>

                <p style={{
                    color: '#8fa89b',
                    fontSize: '0.92rem',
                    lineHeight: '1.5',
                    marginBottom: '2rem'
                }}>
                    Por favor, confirme que você é humano para acessar o catálogo e transmissões da <strong>CineGeek</strong>.
                </p>

                {/* Container do Turnstile */}
                <div style={{ minHeight: '65px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.2rem' }}>
                    <div ref={widgetRef} />
                </div>

                {isChecking && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#00ff88', fontSize: '0.88rem', fontWeight: '500' }}>
                        <Loader size={18} className="spin-anim" />
                        <span>Validando credencial...</span>
                    </div>
                )}

                {errorMessage && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#ff4444',
                        fontSize: '0.85rem',
                        background: 'rgba(255, 68, 68, 0.1)',
                        padding: '0.6rem 1rem',
                        borderRadius: '10px',
                        border: '1px solid rgba(255, 68, 68, 0.3)',
                        marginTop: '0.5rem'
                    }}>
                        <AlertTriangle size={16} />
                        <span>{errorMessage}</span>
                    </div>
                )}

                <div style={{
                    marginTop: '2rem',
                    paddingTop: '1.2rem',
                    borderTop: '1px solid #16241c',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    color: '#52695c',
                    fontSize: '0.78rem'
                }}>
                    <span>Protegido por</span>
                    <strong style={{ color: '#8fa89b' }}>Cloudflare Turnstile</strong>
                </div>
            </div>
        </div>
    );
}
