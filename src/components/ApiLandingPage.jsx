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

    return (
        <div style={{ backgroundColor: '#0b0f19', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
            {/* Navbar */}
            <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5rem 3rem', backgroundColor: '#13192b', borderBottom: '1px solid #1f2937' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', letterSpacing: '-0.5px' }}>
                    CINEGEEK<span style={{ color: '#00e676' }}>API</span>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontSize: '0.9rem' }}>
                    <Link to="/api" style={{ color: '#fff', textDecoration: 'none', fontWeight: '600' }}>Início</Link>
                    <Link to="/api/docs" style={{ color: '#9ca3af', textDecoration: 'none', fontWeight: '500' }}>Documentação</Link>
                    <a href="https://t.me/seu_contato" target="_blank" rel="noreferrer" style={{ backgroundColor: '#00e676', padding: '0.4rem 1rem', borderRadius: '0.5rem', color: '#000', textDecoration: 'none', fontWeight: 'bold' }}>Adquira sua Key</a>
                </div>
            </nav>

            {/* Hero Section */}
            <div style={{ position: 'relative', overflow: 'hidden', padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'url(https://image.tmdb.org/t/p/original/9y0T18n3iR1T4p1lO57HkEDP3fH.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.15, zIndex: 0 }}></div>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to bottom, transparent, #0b0f19)', zIndex: 1 }}></div>
                
                <div style={{ position: 'relative', zIndex: 2, maxWidth: '800px', margin: '0 auto' }}>
                    <Play size={48} color="#00e676" style={{ margin: '0 auto 1rem' }} />
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '900', marginBottom: '1rem', lineHeight: '1.2' }}>
                        Explore uma API com <span style={{ color: '#00e676' }}>{(stats.movies + stats.series + stats.animes + stats.doramas).toLocaleString('pt-BR')}</span> vídeos gratuitos!
                    </h1>
                    <p style={{ fontSize: '1.1rem', color: '#9ca3af', marginBottom: '2rem' }}>
                        Incorpore o maior acervo da internet no seu próprio site. Player rápido, sem travamentos e com a melhor qualidade de imagem.
                    </p>
                    <Link to="/api/docs" style={{ backgroundColor: '#fff', color: '#000', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontSize: '1rem', fontWeight: 'bold', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Code size={18} /> Ver Documentação
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem', padding: '2rem', position: 'relative', zIndex: 3, marginTop: '-3rem' }}>
                {[
                    { label: 'FILMES', value: stats.movies },
                    { label: 'SÉRIES', value: stats.series },
                    { label: 'ANIMES', value: stats.animes },
                    { label: 'DORAMAS', value: stats.doramas },
                    { label: 'EPISÓDIOS', value: stats.episodes }
                ].map(s => (
                    <div key={s.label} style={{ backgroundColor: '#13192b', padding: '1rem 1.5rem', borderRadius: '1rem', border: '1px solid #1f2937', textAlign: 'center', minWidth: '120px' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#fff', marginBottom: '0.25rem' }}>{s.value.toLocaleString('pt-BR')}</div>
                        <div style={{ fontSize: '0.75rem', color: '#00e676', letterSpacing: '1px', fontWeight: 'bold' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Features */}
            <div style={{ maxWidth: '1200px', margin: '3rem auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', padding: '0 2rem' }}>
                <div style={{ backgroundColor: '#13192b', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #1f2937' }}>
                    <Zap color="#00e676" size={28} style={{ marginBottom: '1rem' }} />
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Alta Velocidade</h3>
                    <p style={{ color: '#9ca3af', lineHeight: '1.5', fontSize: '0.95rem' }}>Nossos servidores garantem uma entrega de vídeo sem buffering, utilizando nossa infraestrutura privada e descentralizada para armazenamento de alta performance.</p>
                </div>
                <div style={{ backgroundColor: '#13192b', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #1f2937' }}>
                    <Code color="#00e676" size={28} style={{ marginBottom: '1rem' }} />
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Fácil Integração</h3>
                    <p style={{ color: '#9ca3af', lineHeight: '1.5', fontSize: '0.95rem' }}>Basta um simples Iframe com o ID do TMDB. Suportamos Filmes e Séries nativamente com a mesma estrutura de URL da concorrência.</p>
                </div>
                <div style={{ backgroundColor: '#13192b', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #1f2937' }}>
                    <CheckCircle color="#00e676" size={28} style={{ marginBottom: '1rem' }} />
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Planos Premium</h3>
                    <p style={{ color: '#9ca3af', lineHeight: '1.5', fontSize: '0.95rem' }}>O player padrão possui anúncios (Pop-under). Adquira uma API Key Premium e ofereça uma experiência 100% limpa para seus usuários.</p>
                </div>
            </div>
            
            <footer style={{ textAlign: 'center', padding: '3rem', borderTop: '1px solid #1f2937', color: '#6b7280' }}>
                <p>&copy; 2026 CineGeek API. Todos os direitos reservados.</p>
            </footer>
        </div>
    );
}
