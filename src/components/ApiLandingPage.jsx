import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Code, CheckCircle, Zap } from 'lucide-react';
import './ApiLandingPage.css'; // Importa o novo CSS premium

export default function ApiLandingPage() {
    const [stats, setStats] = useState({ movies: 0, series: 0, animes: 0, doramas: 0, episodes: 0 });

    useEffect(() => {
        fetch('/api/embed/stats')
            .then(r => r.json())
            .then(data => setStats(data))
            .catch(e => console.error(e));
    }, []);

    const totalVideos = stats.movies + stats.episodes;

    return (
        <div className="api-landing-body">
            {/* Ambient Orbs */}
            <div className="api-ambient-orb orb-1"></div>
            <div className="api-ambient-orb orb-2"></div>

            {/* Navbar */}
            <nav className="api-navbar">
                <div className="api-logo">
                    CINEGEEK<span className="api-logo-highlight">API</span>
                </div>
                <div className="api-nav-links">
                    <Link to="/" className="api-nav-link">Início</Link>
                    <Link to="/docs" className="api-nav-link">Documentação</Link>
                    <a href="https://t.me/seu_contato" target="_blank" rel="noreferrer" className="api-btn-primary">Adquira sua Key</a>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="api-hero">
                <video 
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                    className="api-hero-video"
                >
                    <source src="https://tbcdn.talentbrew.com/company/391/v3_0/video/hero-video-0423.mp4" type="video/mp4" />
                </video>
                
                <div className="api-hero-overlay"></div>
                
                <div className="api-hero-content">
                    <Play size={64} className="api-hero-icon" />
                    <h1 className="api-hero-title">
                        Explore uma API com <span>{totalVideos.toLocaleString('pt-BR')}</span> vídeos gratuitos!
                    </h1>
                    <p className="api-hero-desc">
                        Incorpore o maior acervo da internet no seu próprio site. Player extremamente rápido, zero travamentos, design moderno e a melhor qualidade de imagem do mercado.
                    </p>
                    <Link to="/docs" className="api-btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }}>
                        <Code size={22} /> Ver Documentação
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="api-stats-wrapper">
                {[
                    { label: 'FILMES', count: stats.movies },
                    { label: 'SÉRIES', count: stats.series },
                    { label: 'ANIMES', count: stats.animes },
                    { label: 'DORAMAS', count: stats.doramas },
                    { label: 'EPISÓDIOS', count: stats.episodes }
                ].map((stat, i) => (
                    <div key={i} className="api-stat-card">
                        <div className="api-stat-number">{stat.count.toLocaleString('pt-BR')}</div>
                        <div className="api-stat-label">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Features */}
            <div className="api-features-grid">
                <div className="api-feature-card">
                    <div className="api-feature-icon-wrap">
                        <Zap size={32} />
                    </div>
                    <h3 className="api-feature-title">Alta Velocidade</h3>
                    <p className="api-feature-desc">Nossos servidores em cluster são otimizados para streaming HLS de altíssima performance, com CDN distribuída garantindo zero buffering.</p>
                </div>
                <div className="api-feature-card">
                    <div className="api-feature-icon-wrap">
                        <Code size={32} />
                    </div>
                    <h3 className="api-feature-title">Fácil Integração</h3>
                    <p className="api-feature-desc">Basta copiar um simples Iframe com o ID do TMDB e o player inteligente faz toda a mágica automaticamente no seu site.</p>
                </div>
                <div className="api-feature-card">
                    <div className="api-feature-icon-wrap">
                        <CheckCircle size={32} />
                    </div>
                    <h3 className="api-feature-title">Uptime de 99.9%</h3>
                    <p className="api-feature-desc">Arquitetura baseada em redundância com múltiplos workers e nuvens descentralizadas para que o seu site nunca caia.</p>
                </div>
            </div>

            <footer style={{ textAlign: 'center', padding: '3rem 2rem', color: '#6b7280', fontSize: '0.9rem', borderTop: '1px solid #1a2f24', marginTop: '4rem' }}>
                © {new Date().getFullYear()} CineGeek API. Todos os direitos reservados.
            </footer>
        </div>
    );
}
