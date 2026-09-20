import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, MonitorPlay, Tv, Key, ArrowLeft, Send } from 'lucide-react';
import './EmbedDocsPage.css';

export default function EmbedDocsPage() {
    const baseUrl = window.location.origin;

    return (
        <div className="docs-body">
            
            {/* Sidebar */}
            <aside className="docs-sidebar">
                <div className="docs-logo">
                    CINEGEEK<span>API</span>
                </div>
                
                <nav>
                    <div className="docs-section-title">Geral</div>
                    <a href="#inicio" className="docs-nav-link active">
                        <BookOpen size={18} /> Introdução
                    </a>
                    
                    <div className="docs-section-title">Conteúdo</div>
                    <a href="#filmes" className="docs-nav-link">
                        <MonitorPlay size={18} /> Filmes
                    </a>
                    <a href="#series" className="docs-nav-link">
                        <Tv size={18} /> Séries/Animes/Doramas
                    </a>

                    <div className="docs-section-title">Avançado</div>
                    <a href="#premium" className="docs-nav-link">
                        <Key size={18} /> Planos Premium
                    </a>
                </nav>
            </aside>

            {/* Main Content */}
            <main className="docs-main">
                <Link to="/api" className="docs-back-btn">
                    <ArrowLeft size={18} /> Voltar para a Home
                </Link>

                {/* Introdução Card */}
                <div className="docs-card" id="inicio">
                    <h1>Documentação Técnica</h1>
                    <p>
                        A API do <strong>CINEGEEK</strong> foi projetada para facilitar a integração de conteúdo multimídia em qualquer plataforma. Nossa solução oferece um iframe simples, rápido e otimizado para acesso a todo o nosso acervo de filmes e séries.
                    </p>
                    
                    <div className="docs-alert" style={{ marginTop: '2rem' }}>
                        <div className="docs-alert-title">Aviso de Anúncios</div>
                        <p>O uso do nosso player é 100% gratuito, porém contém anúncios. Para remover os anúncios e ter um player totalmente limpo (White Label), você precisará de uma API Key.</p>
                    </div>
                </div>

                {/* Filmes Card */}
                <div className="docs-card" id="filmes">
                    <h2><MonitorPlay size={24} color="#00FF88" /> Filmes</h2>
                    <p>Para exibir um filme no seu site, incorpore a URL abaixo usando o ID do TMDB (The Movie Database).</p>
                    
                    <div className="docs-code-url">
                        {baseUrl}/embed/filme/{"{tmdb_id}"}
                    </div>
                    
                    <p><strong>Exemplo de Integração HTML:</strong></p>
                    <div className="docs-code-block">
<pre>
<span style={{ color: '#fca5a5' }}>&lt;iframe</span> 
  <span style={{ color: '#93c5fd' }}>src=</span><span style={{ color: '#a78bfa' }}>"{baseUrl}/embed/filme/550"</span> 
  <span style={{ color: '#93c5fd' }}>width=</span><span style={{ color: '#a78bfa' }}>"100%"</span> 
  <span style={{ color: '#93c5fd' }}>height=</span><span style={{ color: '#a78bfa' }}>"100%"</span> 
  <span style={{ color: '#93c5fd' }}>frameborder=</span><span style={{ color: '#a78bfa' }}>"0"</span> 
  <span style={{ color: '#93c5fd' }}>allowfullscreen</span>
<span style={{ color: '#fca5a5' }}>&gt;&lt;/iframe&gt;</span>
</pre>
                    </div>
                </div>

                {/* Séries/Animes Card */}
                <div className="docs-card" id="series">
                    <h2><Tv size={24} color="#00FF88" /> Séries/Animes/Doramas</h2>
                    <p>Para exibir um episódio específico de uma série, anime ou dorama, você precisa informar o ID, o número da temporada e o número do episódio.</p>
                    
                    <div className="docs-code-url">
                        {baseUrl}/embed/serie/{"{tmdb_id}"}/{"{temporada}"}/{"{episodio}"}
                    </div>
                    
                    <p><strong>Exemplo de Integração HTML:</strong></p>
                    <div className="docs-code-block">
<pre>
<span style={{ color: '#fca5a5' }}>&lt;iframe</span> 
  <span style={{ color: '#93c5fd' }}>src=</span><span style={{ color: '#a78bfa' }}>"{baseUrl}/embed/serie/1399/1/1"</span> 
  <span style={{ color: '#93c5fd' }}>width=</span><span style={{ color: '#a78bfa' }}>"100%"</span> 
  <span style={{ color: '#93c5fd' }}>height=</span><span style={{ color: '#a78bfa' }}>"100%"</span> 
  <span style={{ color: '#93c5fd' }}>frameborder=</span><span style={{ color: '#a78bfa' }}>"0"</span> 
  <span style={{ color: '#93c5fd' }}>allowfullscreen</span>
<span style={{ color: '#fca5a5' }}>&gt;&lt;/iframe&gt;</span>
</pre>
                    </div>
                </div>

                {/* Premium Card */}
                <div className="docs-card" id="premium">
                    <h2><Key size={24} color="#00FF88" /> Planos Premium (Sem Anúncios)</h2>
                    <p>
                        Para oferecer a melhor experiência para os seus usuários, você pode remover 100% dos anúncios do player usando uma <strong>API Key</strong> exclusiva para o seu site.
                    </p>
                    <p>
                        Adicione o parâmetro <code>?apikey=</code> no final da URL do iframe:
                    </p>
                    
                    <div className="docs-code-url" style={{ color: '#00FF88' }}>
                        {baseUrl}/embed/filme/550<span style={{ color: '#fff' }}>?apikey=SUA_CHAVE_AQUI</span>
                    </div>

                    <div className="docs-alert">
                        <div className="docs-alert-title">Como funciona a proteção?</div>
                        <p style={{ marginBottom: '0.5rem' }}>A sua chave fica amarrada ao seu <strong>domínio</strong> cadastrado.</p>
                        <p>Se outro site roubar o seu código e colocar na página deles, os anúncios voltam a aparecer para eles instantaneamente, protegendo o seu plano.</p>
                    </div>

                    <div style={{ marginTop: '2rem' }}>
                        <a href="https://t.me/seu_contato" target="_blank" rel="noreferrer" className="docs-btn">
                            <Send size={18} /> Adquirir Chave VIP
                        </a>
                    </div>
                </div>

                <div style={{ height: '50px' }}></div>
            </main>
        </div>
    );
}
