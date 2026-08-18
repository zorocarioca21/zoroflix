import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, MonitorPlay, Tv, Code, Zap, Key } from 'lucide-react';

export default function EmbedDocsPage() {
    const baseUrl = window.location.origin;

    return (
        <div style={{ backgroundColor: '#0b0f19', minHeight: '100vh', color: '#e5e7eb', fontFamily: 'Inter, sans-serif', display: 'flex' }}>
            
            {/* Sidebar */}
            <aside style={{ width: '280px', backgroundColor: '#13192b', borderRight: '1px solid #1f2937', padding: '2rem 0', minHeight: '100vh' }}>
                <div style={{ padding: '0 2rem', marginBottom: '2rem' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: '900', letterSpacing: '-0.5px' }}>
                        CINEGEEK<span style={{ color: '#00e676' }}>API</span>
                    </div>
                </div>
                
                <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ padding: '0 2rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', marginTop: '1rem', marginBottom: '0.5rem' }}>Introdução</div>
                    <a href="#inicio" style={{ padding: '0.5rem 2rem', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#1f2937', borderRight: '3px solid #00e676' }}>
                        <BookOpen size={18} /> Começando
                    </a>
                    <a href="#premium" style={{ padding: '0.5rem 2rem', color: '#9ca3af', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Key size={18} /> Planos Premium
                    </a>

                    <div style={{ padding: '0 2rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', marginTop: '2rem', marginBottom: '0.5rem' }}>Endpoints (Iframe)</div>
                    <a href="#filmes" style={{ padding: '0.5rem 2rem', color: '#9ca3af', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <MonitorPlay size={18} /> Filmes
                    </a>
                    <a href="#series" style={{ padding: '0.5rem 2rem', color: '#9ca3af', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Tv size={18} /> Séries
                    </a>
                </nav>
            </aside>

            {/* Main Content */}
            <main style={{ padding: '3rem', flex: 1, maxWidth: '900px' }}>
                <Link to="/api" style={{ color: '#00e676', textDecoration: 'none', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
                    ← Voltar para a Home
                </Link>

                <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#fff', marginBottom: '1rem' }} id="inicio">Documentação da API</h1>
                <p style={{ fontSize: '1.1rem', color: '#9ca3af', marginBottom: '2rem', lineHeight: '1.6' }}>
                    Bem-vindo à documentação oficial da CineGeek API. Nossa API permite incorporar filmes e séries no seu site usando o Iframe com base no ID do TMDB (The Movie Database).
                </p>

                <div style={{ backgroundColor: '#1e293b', borderLeft: '4px solid #00e676', padding: '1rem 1.5rem', borderRadius: '0 0.5rem 0.5rem 0', marginBottom: '3rem' }}>
                    <strong>Aviso:</strong> O uso do nosso player é 100% gratuito, porém ele contém anúncios na modalidade Free. Para remover os anúncios e ter um player totalmente limpo (White Label), você precisa adquirir uma API Key Premium.
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #1f2937', margin: '3rem 0' }} />

                <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff', marginBottom: '1.5rem' }} id="filmes">
                    <MonitorPlay style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} /> Filmes
                </h2>
                <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>Para exibir um filme, utilize a seguinte URL no seu iframe:</p>
                
                <div style={{ backgroundColor: '#13192b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #1f2937', marginBottom: '1rem', fontFamily: 'monospace', color: '#a78bfa' }}>
                    {baseUrl}/embed/filme/{"{tmdb_id}"}
                </div>
                
                <p style={{ color: '#9ca3af', marginBottom: '1rem' }}><strong>Exemplo de Integração HTML:</strong></p>
                <div style={{ backgroundColor: '#000', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto', marginBottom: '3rem' }}>
<pre style={{ margin: 0, color: '#e5e7eb' }}>
<span style={{ color: '#fca5a5' }}>&lt;iframe</span> 
  <span style={{ color: '#93c5fd' }}>src=</span><span style={{ color: '#a78bfa' }}>"{baseUrl}/embed/filme/550"</span> 
  <span style={{ color: '#93c5fd' }}>width=</span><span style={{ color: '#a78bfa' }}>"100%"</span> 
  <span style={{ color: '#93c5fd' }}>height=</span><span style={{ color: '#a78bfa' }}>"100%"</span> 
  <span style={{ color: '#93c5fd' }}>frameborder=</span><span style={{ color: '#a78bfa' }}>"0"</span> 
  <span style={{ color: '#93c5fd' }}>allowfullscreen</span>
<span style={{ color: '#fca5a5' }}>&gt;&lt;/iframe&gt;</span>
</pre>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #1f2937', margin: '3rem 0' }} />

                <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff', marginBottom: '1.5rem' }} id="series">
                    <Tv style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} /> Séries
                </h2>
                <p style={{ color: '#9ca3af', marginBottom: '1rem' }}>Para exibir um episódio de uma série, você precisa informar o ID, a temporada e o episódio:</p>
                
                <div style={{ backgroundColor: '#13192b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #1f2937', marginBottom: '1rem', fontFamily: 'monospace', color: '#a78bfa' }}>
                    {baseUrl}/embed/serie/{"{tmdb_id}"}/{"{temporada}"}/{"{episodio}"}
                </div>
                
                <p style={{ color: '#9ca3af', marginBottom: '1rem' }}><strong>Exemplo de Integração HTML:</strong></p>
                <div style={{ backgroundColor: '#000', padding: '1rem', borderRadius: '0.5rem', overflowX: 'auto', marginBottom: '3rem' }}>
<pre style={{ margin: 0, color: '#e5e7eb' }}>
<span style={{ color: '#fca5a5' }}>&lt;iframe</span> 
  <span style={{ color: '#93c5fd' }}>src=</span><span style={{ color: '#a78bfa' }}>"{baseUrl}/embed/serie/1399/1/1"</span> 
  <span style={{ color: '#93c5fd' }}>width=</span><span style={{ color: '#a78bfa' }}>"100%"</span> 
  <span style={{ color: '#93c5fd' }}>height=</span><span style={{ color: '#a78bfa' }}>"100%"</span> 
  <span style={{ color: '#93c5fd' }}>frameborder=</span><span style={{ color: '#a78bfa' }}>"0"</span> 
  <span style={{ color: '#93c5fd' }}>allowfullscreen</span>
<span style={{ color: '#fca5a5' }}>&gt;&lt;/iframe&gt;</span>
</pre>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #1f2937', margin: '3rem 0' }} />

                <h2 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#fff', marginBottom: '1.5rem' }} id="premium">
                    <Key style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} /> Planos Premium (Sem Anúncios)
                </h2>
                <p style={{ color: '#9ca3af', marginBottom: '1rem', lineHeight: '1.6' }}>
                    Para quem deseja proporcionar a melhor experiência possível para seus usuários, oferecemos a possibilidade de remover todos os anúncios nativos do nosso player adquirindo uma <strong>API Key</strong>.
                </p>
                <p style={{ color: '#9ca3af', marginBottom: '1rem', lineHeight: '1.6' }}>
                    Para utilizar a sua API Key, basta adicioná-la como um parâmetro <code>apikey</code> no final da URL do seu iframe.
                </p>
                
                <div style={{ backgroundColor: '#13192b', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #1f2937', marginBottom: '2rem', fontFamily: 'monospace', color: '#10b981' }}>
                    {baseUrl}/embed/filme/550<span style={{ color: '#fff', fontWeight: 'bold' }}>?apikey=SUA_CHAVE_AQUI</span>
                </div>

                <div style={{ backgroundColor: '#1e293b', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #374151' }}>
                    <h3 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '1rem' }}>Como funciona a proteção da Key?</h3>
                    <ul style={{ color: '#9ca3af', lineHeight: '1.8', marginLeft: '1.5rem' }}>
                        <li>Sua chave é atrelada exclusivamente ao seu <strong>Domínio</strong> no momento da compra.</li>
                        <li>Se outra pessoa copiar o seu Iframe e colocar em outro site, nosso sistema irá bloquear o uso Premium e os anúncios voltarão a aparecer normalmente para o site pirata, protegendo a sua cota/chave.</li>
                    </ul>
                    <div style={{ marginTop: '1.5rem' }}>
                        <a href="https://t.me/seu_contato" target="_blank" rel="noreferrer" style={{ backgroundColor: '#00e676', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', color: '#000', textDecoration: 'none', fontWeight: 'bold', display: 'inline-block' }}>Falar com Comercial</a>
                    </div>
                </div>

                <div style={{ height: '100px' }}></div>
            </main>
        </div>
    );
}
