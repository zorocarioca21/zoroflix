import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Code, CheckCircle, Zap } from 'lucide-react';
import './ApiLandingPage.css'; // Importa o novo CSS premium

export default function ApiLandingPage() {
    const [stats, setStats] = useState({ movies: 0, series: 0, animes: 0, doramas: 0, episodes: 0, channels: 0 });

    useEffect(() => {
        fetch('/api/embed/stats')
            .then(r => r.json())
            .then(data => setStats(data))
            .catch(e => console.error(e));
    }, []);

    const totalVideos = (stats.movies || 0) + (stats.episodes || 0) + (stats.channels || 0);

    return (
        <div className="api-landing-body">
            {/* Ambient Orbs */}
            <div className="api-ambient-orb orb-1"></div>
            <div className="api-ambient-orb orb-2"></div>

            {/* Hero Section */}
            <div className="api-hero-container">
                <div className="api-hero-card">
                    <video 
                        autoPlay 
                        loop 
                        muted 
                        playsInline
                        className="api-hero-video"
                    >
                        <source src="https://api.zorobot.shop/drive/f/f67b4121e5b154f4a3cfe48a652a323a/video_gerado_por_ia_pra_api_cinegeek.mp4" type="video/mp4" />
                    </video>
                    
                    <div className="api-hero-overlay"></div>
                    
                    <div className="api-hero-content">
                        <Play size={48} className="api-hero-icon" />
                        <h1 className="api-hero-title">
                            Explore uma API com <span>{totalVideos.toLocaleString('pt-BR')}</span> vídeos e canais gratuitos!
                        </h1>
                        
                        <div className="api-hero-buttons">
                            <Link to="/docs" className="api-btn-primary">
                                <Code size={20} /> Ver Documentação
                            </Link>
                            <a href="https://t.me/cinegeekapi" target="_blank" rel="noreferrer" className="api-btn-secondary">
                                Adquira sua Key
                            </a>
                        </div>
                        
                        {/* Stats Cards Inside Hero */}
                        <div className="api-stats-wrapper">
                            {[
                                { label: 'FILMES', count: stats.movies },
                                { label: 'SÉRIES', count: stats.series },
                                { label: 'ANIMES', count: stats.animes },
                                { label: 'DORAMAS', count: stats.doramas },
                                { label: 'EPISÓDIOS', count: stats.episodes },
                                { label: 'CANAIS VIP', count: stats.channels || 0 }
                            ].map((stat, i) => (
                                <div key={i} className="api-stat-card">
                                    <div className="api-stat-number">{stat.count.toLocaleString('pt-BR')}</div>
                                    <div className="api-stat-label">{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Removido o bloco isolado de Stats porque ele foi movido para dentro do Hero Card para ficar igual à SuperflixAPI */}

            {/* Features */}
            <div className="api-features-grid">
                <div className="api-feature-card">
                    <div className="api-feature-icon-wrap">
                        <Zap size={32} />
                    </div>
                    <h3 className="api-feature-title">Alta Velocidade</h3>
                    <p className="api-feature-desc">Streaming direto otimizado com entrega rápida de pacotes, garantindo carregamento ágil e reprodução fluida em qualquer dispositivo.</p>
                </div>
                <div className="api-feature-card">
                    <div className="api-feature-icon-wrap">
                        <Code size={32} />
                    </div>
                    <h3 className="api-feature-title">Fácil Integração</h3>
                    <p className="api-feature-desc">Basta copiar um simples iframe com o ID do TMDB e o player inteligente faz toda a mágica automaticamente no seu site.</p>
                </div>
                <div className="api-feature-card">
                    <div className="api-feature-icon-wrap">
                        <CheckCircle size={32} />
                    </div>
                    <h3 className="api-feature-title">Alta Disponibilidade</h3>
                    <p className="api-feature-desc">Arquitetura com múltiplos workers e armazenamento distribuído para garantir estabilidade contínua e suporte a múltiplas requisições.</p>
                </div>
            </div>

            <footer style={{ textAlign: 'center', padding: '3rem 2rem', color: '#6b7280', fontSize: '0.9rem', borderTop: '1px solid #1a2f24', marginTop: '4rem' }}>
                © {new Date().getFullYear()} CineGeek API. Todos os direitos reservados.
            </footer>
        </div>
    );
}
