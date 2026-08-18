import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Code, CheckCircle, Zap } from 'lucide-react';

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
        <div style={{ backgroundColor: '#0b0f19', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            {/* Navbar */}
            <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 3rem', backgroundColor: '#13131a', borderBottom: '1px solid #1a2f24' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', letterSpacing: '-0.5px' }}>
                    CINEGEEK<span style={{ color: '#00ff88' }}>API</span>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.9rem' }}>
                    <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600' }}>Início</Link>
                    <Link to="/docs" style={{ color: '#9ca3af', textDecoration: 'none', fontWeight: '500' }}>Documentação</Link>
                    <a href="https://t.me/seu_contato" target="_blank" rel="noreferrer" style={{ backgroundColor: '#00ff88', padding: '0.4rem 1rem', borderRadius: '0.5rem', color: '#000', textDecoration: 'none', fontWeight: 'bold' }}>Adquira sua Key</a>
                </div>
            </nav>

            {/* Hero Section */}
            <div style={{ position: 'relative', overflow: 'hidden', padding: '6rem 2rem', textAlign: 'center', minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Vídeo de fundo */}
                <video 
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 0,
                        opacity: 0.3
                    }}
                >
                    <source src="https://tbcdn.talentbrew.com/company/391/v3_0/video/hero-video-0423.mp4" type="video/mp4" />
                </video>
                
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to bottom, rgba(11, 15, 25, 0.4), #0b0f19)', zIndex: 1 }}></div>
                
                <div style={{ position: 'relative', zIndex: 2, maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                    <Play size={64} color="#00ff88" style={{ margin: '0 auto 1.5rem', filter: 'drop-shadow(0 0 15px rgba(0,255,136,0.5))' }} />
                    <h1 style={{ fontSize: '3.5rem', fontWeight: '900', marginBottom: '1.5rem', lineHeight: '1.2' }}>
                        Explore uma API com <span style={{ color: '#00ff88' }}>{totalVideos.toLocaleString('pt-BR')}</span> vídeos gratuitos!
                    </h1>
                    <p style={{ fontSize: '1.2rem', color: '#d1d1d6', marginBottom: '2.5rem', maxWidth: '600px', margin: '0 auto 2.5rem' }}>
                        Incorpore o maior acervo da internet no seu próprio site. Player rápido, sem travamentos e com a melhor qualidade de imagem.
                    </p>
                    <Link to="/docs" style={{ backgroundColor: '#00ff88', color: '#000', padding: '1rem 2rem', borderRadius: '30px', fontSize: '1.1rem', fontWeight: 'bold', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(0,255,136,0.3)' }}>
                        <Code size={20} /> Ver Documentação
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1.5rem', padding: '2rem', position: 'relative', zIndex: 3, marginTop: '-4rem' }}>
                {[
                    { label: 'FILMES', count: stats.movies },
                    { label: 'SÉRIES', count: stats.series },
                    { label: 'ANIMES', count: stats.animes },
                    { label: 'DORAMAS', count: stats.doramas },
                    { label: 'EPISÓDIOS', count: stats.episodes }
                ].map((stat, i) => (
                    <div key={i} style={{ backgroundColor: '#13131a', border: '1px solid #1a2f24', padding: '1.5rem 2rem', borderRadius: '1rem', minWidth: '160px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '900', color: '#fff', marginBottom: '0.5rem' }}>{stat.count.toLocaleString('pt-BR')}</div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#00ff88', letterSpacing: '1px' }}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Features */}
            <div style={{ maxWidth: '1200px', margin: '3rem auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', padding: '0 2rem' }}>
                <div style={{ backgroundColor: '#13131a', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #1a2f24' }}>
                    <Zap color="#00ff88" size={28} style={{ marginBottom: '1rem' }} />
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Alta Velocidade</h3>
                    <p style={{ color: '#9ca3af', fontSize: '0.95rem', lineHeight: '1.5' }}>Nossos servidores são otimizados para streaming HLS de alta performance, sem buffering.</p>
                </div>
                <div style={{ backgroundColor: '#13131a', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #1a2f24' }}>
                    <Code color="#00ff88" size={28} style={{ marginBottom: '1rem' }} />
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Fácil Integração</h3>
                    <p style={{ color: '#9ca3af', fontSize: '0.95rem', lineHeight: '1.5' }}>Basta um simples Iframe com o ID do TMDB e o player faz o resto automaticamente.</p>
                </div>
                <div style={{ backgroundColor: '#13131a', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #1a2f24' }}>
                    <CheckCircle color="#00ff88" size={28} style={{ marginBottom: '1rem' }} />
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Uptime de 99.9%</h3>
                    <p style={{ color: '#9ca3af', fontSize: '0.95rem', lineHeight: '1.5' }}>Infraestrutura redundante garante que seus usuários nunca fiquem sem conteúdo.</p>
                </div>
            </div>

            <footer style={{ textAlign: 'center', padding: '3rem 2rem', color: '#6b7280', fontSize: '0.9rem', borderTop: '1px solid #1a2f24', marginTop: '4rem' }}>
                © {new Date().getFullYear()} CineGeek API. Todos os direitos reservados.
            </footer>
        </div>
    );
}
