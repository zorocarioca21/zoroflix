import React, { useState } from 'react';
import { 
    ArrowLeft, Key, Code, Database, Shield, BookOpen, Terminal, 
    Smartphone, Copy, Check, Tv, Play, ExternalLink, Zap, 
    Layers, Cpu, Server, CheckCircle2, AlertTriangle, Info, Globe
} from 'lucide-react';
import { Link } from 'react-router-dom';
import './ApiDocsPage.css';

export default function ApiDocsPage() {
    const baseUrl = window.location.origin;
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [activeTab, setActiveTab] = useState('embed'); // 'embed' | 'mobile-native' | 'bots' | 'sql'

    const handleCopy = (text, id) => {
        if (!navigator?.clipboard) return;
        navigator.clipboard.writeText(text);
        setCopiedIndex(id);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const sqlEndpoints = [
        {
            method: 'GET',
            path: '/api/mobile/tables',
            title: 'Listar Estrutura das Tabelas',
            description: 'Retorna todas as tabelas do banco de dados com seus esquemas, colunas e tipos primitivos.',
            body: null,
            response: `{
  "tables": [
    {
      "table": "users",
      "columns": [
        { "name": "id", "type": "INTEGER", "pk": true },
        { "name": "nick", "type": "TEXT" },
        { "name": "email", "type": "TEXT" }
      ]
    }
  ]
}`
        },
        {
            method: 'GET',
            path: '/api/mobile/table/:name',
            title: 'Paginação Direta de Tabela',
            description: 'Recupera dados em lote com ordenação e limite de registros.',
            params: 'limit=50, offset=0, order=id, dir=ASC',
            body: null,
            response: `{
  "table": "sync_queue",
  "total": 32035,
  "limit": 50,
  "offset": 0,
  "data": [
    { "id": 1, "title": "Homem-Aranha (2002)", "status": "completed", "tmdb_id": 557 }
  ]
}`
        },
        {
            method: 'POST',
            path: '/api/mobile/query',
            title: 'Execução SQL SELECT (Leitura Blindada)',
            description: 'Permite rodar consultas SELECT ou PRAGMA parametrizadas de alta performance no banco SQLite.',
            body: `{
  "sql": "SELECT id, title, tmdb_id FROM sync_queue WHERE status = ? LIMIT ?",
  "params": ["completed", 5]
}`,
            response: `{
  "data": [
    { "id": 124, "title": "Grey's Anatomy S01E01", "tmdb_id": 1416 }
  ],
  "count": 1
}`
        },
        {
            method: 'POST',
            path: '/api/mobile/execute',
            title: 'Operações de Escrita (INSERT, UPDATE, DELETE)',
            description: 'Para escrita rápida de dados auxiliares do seu app. Retorna o número de linhas afetadas.',
            body: `{
  "sql": "UPDATE users SET avatar = ? WHERE id = ?",
  "params": ["avatar_url", 1]
}`,
            response: `{
  "success": true,
  "changes": 1,
  "lastID": 1
}`
        }
    ];

    return (
        <div className="api-docs-page">
            <div className="api-docs-container">

                {/* Header Superior Moderno */}
                <div className="api-docs-header-modern">
                    <div className="api-docs-header-titles">
                        <div className="api-docs-hero-badge">
                            <Zap size={14} /> Developer Portal & Streaming API
                        </div>
                        <h1>
                            <Cpu size={28} color="#00ff88" />
                            CineGeek API Documentation
                        </h1>
                        <p>Documentação técnica para incorporação (Embed Iframe), aplicativos nativos e integrações externas.</p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <Link to="/paineladm" className="api-docs-back-btn">
                            <Shield size={16} /> Painel Administrativo
                        </Link>
                        <Link to="/" className="api-docs-back-btn">
                            <ArrowLeft size={16} /> Voltar ao Site
                        </Link>
                    </div>
                </div>

                {/* Métricas Rápidas / Info Cards */}
                <div className="api-docs-info-grid">
                    <div className="api-info-card-modern">
                        <div className="api-info-icon-wrap" style={{ background: 'rgba(0, 255, 136, 0.1)', color: '#00ff88' }}>
                            <Server size={22} />
                        </div>
                        <div>
                            <h4>Servidor Base</h4>
                            <p><code>{baseUrl}</code></p>
                        </div>
                    </div>

                    <div className="api-info-card-modern">
                        <div className="api-info-icon-wrap" style={{ background: 'rgba(0, 204, 255, 0.1)', color: '#00ccff' }}>
                            <Shield size={22} />
                        </div>
                        <div>
                            <h4>Autenticação Header</h4>
                            <p><code>x-api-key: SUA_CHAVE</code></p>
                        </div>
                    </div>

                    <div className="api-info-card-modern">
                        <div className="api-info-icon-wrap" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#c084fc' }}>
                            <Layers size={22} />
                        </div>
                        <div>
                            <h4>Mapeamento TMDB</h4>
                            <p>Filmes & Séries com IDs Oficiais</p>
                        </div>
                    </div>

                    <div className="api-info-card-modern">
                        <div className="api-info-icon-wrap" style={{ background: 'rgba(251, 146, 60, 0.1)', color: '#fb923c' }}>
                            <Globe size={22} />
                        </div>
                        <div>
                            <h4>Formato Padrão</h4>
                            <p><code>application/json</code></p>
                        </div>
                    </div>
                </div>

                {/* Abas de Navegação */}
                <div className="api-docs-tabs">
                    <button 
                        className={`api-tab-btn ${activeTab === 'embed' ? 'active' : ''}`}
                        onClick={() => setActiveTab('embed')}
                    >
                        <Play size={18} /> Iframe Embed (Filmes & Séries)
                    </button>
                    <button 
                        className={`api-tab-btn ${activeTab === 'mobile-native' ? 'active' : ''}`}
                        onClick={() => setActiveTab('mobile-native')}
                    >
                        <Smartphone size={18} /> App Mobile Nativo (ExoPlayer)
                    </button>
                    <button 
                        className={`api-tab-btn ${activeTab === 'bots' ? 'active' : ''}`}
                        onClick={() => setActiveTab('bots')}
                    >
                        <Terminal size={18} /> API para Bots (WhatsApp/Telegram)
                    </button>
                    <button 
                        className={`api-tab-btn ${activeTab === 'sql' ? 'active' : ''}`}
                        onClick={() => setActiveTab('sql')}
                    >
                        <Database size={18} /> Banco de Dados & SQL
                    </button>
                </div>

                {/* CONTEÚDO DA ABA: IFRAME EMBED */}
                {activeTab === 'embed' && (
                    <div className="api-docs-section-card">
                        <div className="api-section-header">
                            <h2><Play size={22} color="#00ff88" /> Player Incorporado via Iframe</h2>
                            <p>
                                Incorpore instantaneamente filmes, séries e animes no seu site com player HTML5 responsivo, 
                                compatível com telas mobile e com suporte nativo aos IDs do TMDB.
                            </p>
                        </div>

                        <div className="api-endpoints-stack">
                            {/* Endpoint Filme */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/embed/filme/{"{tmdb_id}"}</span>
                                    </div>
                                    <span style={{ color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold' }}>🎬 FILMES</span>
                                </div>
                                <h3>Player de Filme por TMDB ID</h3>
                                <p>Carrega o reprodutor de vídeo direto do filme correspondente ao TMDB ID especificado.</p>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Exemplo de Iframe HTML</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'embed-movie' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`<iframe src="${baseUrl}/embed/filme/550" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`, 'embed-movie')}
                                        >
                                            {copiedIndex === 'embed-movie' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'embed-movie' ? 'Copiado!' : 'Copiar Código'}
                                        </button>
                                    </div>
                                    <pre><code>{`<iframe 
  src="${baseUrl}/embed/filme/550" 
  width="100%" 
  height="100%" 
  frameborder="0" 
  allowfullscreen
></iframe>`}</code></pre>
                                </div>
                            </div>

                            {/* Endpoint Série */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/embed/serie/{"{tmdb_id}"}/{"{temporada}"}/{"{episodio}"}</span>
                                    </div>
                                    <span style={{ color: '#00ccff', fontSize: '0.8rem', fontWeight: 'bold' }}>📺 SÉRIES / ANIMES</span>
                                </div>
                                <h3>Player de Episódio (Série / Anime)</h3>
                                <p>Carrega o reprodutor de vídeo para a temporada e número de episódio informados.</p>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Exemplo de Iframe HTML</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'embed-tv' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`<iframe src="${baseUrl}/embed/serie/1399/1/1" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`, 'embed-tv')}
                                        >
                                            {copiedIndex === 'embed-tv' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'embed-tv' ? 'Copiado!' : 'Copiar Código'}
                                        </button>
                                    </div>
                                    <pre><code>{`<iframe 
  src="${baseUrl}/embed/serie/1399/1/1" 
  width="100%" 
  height="100%" 
  frameborder="0" 
  allowfullscreen
></iframe>`}</code></pre>
                                </div>
                            </div>

                            {/* Planos VIP / Chave */}
                            <div className="api-callout success">
                                <Shield size={24} />
                                <div>
                                    <strong>Player White Label (Sem Anúncios):</strong>
                                    <p style={{ margin: '4px 0 0 0' }}>
                                        Para desativar 100% dos anúncios (pop-unders e banners) para os seus usuários ou clientes VIP, adicione o parâmetro <code>?apikey=SUA_CHAVE</code> ao final do endereço do iframe.
                                    </p>
                                    <div style={{ marginTop: '8px' }}>
                                        <code className="api-code-pill">{baseUrl}/embed/filme/550?apikey=SUA_API_KEY</code>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* CONTEÚDO DA ABA: APP MOBILE NATIVO */}
                {activeTab === 'mobile-native' && (
                    <div className="api-docs-section-card">
                        <div className="api-section-header">
                            <h2><Smartphone size={22} color="#00ff88" /> Integração para Aplicativos Nativos (Android / iOS)</h2>
                            <p>
                                Obtenha fluxos de vídeo diretos (.mp4) de alta performance para reprodução em <strong>ExoPlayer</strong>, 
                                <strong>AVPlayer</strong>, VLC ou IJKPlayer, com suporte a Picture-in-Picture e economia de bateria.
                            </p>
                        </div>

                        <div className="api-endpoints-stack">
                            {/* PASSO 1: Obter Vídeo por TMDB ID sem errar episódios */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/api/bot/search?tmdb_id=1416&season=2&episode=4&app=true&apikey=SUA_CHAVE</span>
                                    </div>
                                    <span style={{ color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold' }}>1️⃣ PASSO 1: RESGATAR STREAM POR TMDB ID</span>
                                </div>
                                <h3>Buscar Episódio ou Filme Exato (100% Preciso)</h3>
                                <p>
                                    <strong>Evite buscar por nomes de texto</strong> como "Série S01E03" para evitar episódios repetidos ou confusão de temporadas. 
                                    Como 100% dos 32.000+ arquivos baixados estão indexados por ID, envie diretamente os parâmetros <code>tmdb_id</code>, <code>season</code> e <code>episode</code> junto com <code>app=true</code> para desativar o bloqueio de IP.
                                </p>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Exemplos de chamadas do App:</span>
                                    <code className="api-code-pill">/api/bot/search?tmdb_id=1416&season=1&episode=3&app=true&apikey=... (Série)</code>
                                    <code className="api-code-pill">/api/bot/search?tmdb_id=550&app=true&apikey=... (Filme)</code>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Resposta da API (JSON Retornado)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'app-search-res' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "found": true,\n  "title": "Grey's Anatomy S02E04 - Negando, Negando, Negando",\n  "type": "serie",\n  "stream_url": "${baseUrl}/api/stream/s/eyJ...XYZ.mp4"\n}`, 'app-search-res')}
                                        >
                                            {copiedIndex === 'app-search-res' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'app-search-res' ? 'Copiado!' : 'Copiar Resposta'}
                                        </button>
                                    </div>
                                    <pre><code>{`{
  "found": true,
  "title": "Grey's Anatomy S02E04 - Negando, Negando, Negando",
  "type": "serie",
  "telegram_message_id": 84512,
  "stream_url": "${baseUrl}/api/stream/s/eyJhbGciOi...XYZ.mp4", // <- URL EXATA DO EPISÓDIO
  "site_url": "${baseUrl}/serie/greys-anatomy"
}`}</code></pre>
                                </div>
                            </div>

                            {/* PASSO 2: Stream Nativo no ExoPlayer */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/api/stream/s/{"{token}"}.mp4</span>
                                    </div>
                                    <span style={{ color: '#00ccff', fontSize: '0.8rem', fontWeight: 'bold' }}>2️⃣ PASSO 2: INJETAR NO PLAYER</span>
                                </div>
                                <h3>Carregar o Vídeo no Player Nativo (ExoPlayer, AVPlayer)</h3>
                                <p>
                                    Basta injetar o <code>stream_url</code> recebido no Passo 1 diretamente na fonte do seu player de vídeo.
                                </p>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Exemplo de Implementação (Kotlin / ExoPlayer)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'exoplayer' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`// 1. Pega a stream_url que a API retornou no Passo 1\nval streamUrl = movieResponse.getString("stream_url")\n\n// 2. Toca no ExoPlayer\nval mediaItem = MediaItem.fromUri(streamUrl)\nexoPlayer.setMediaItem(mediaItem)\nexoPlayer.prepare()\nexoPlayer.play()`, 'exoplayer')}
                                        >
                                            {copiedIndex === 'exoplayer' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'exoplayer' ? 'Copiado!' : 'Copiar Código'}
                                        </button>
                                    </div>
                                    <pre><code>{`// 1. Receba o stream_url retornado pela busca do Passo 1
val streamUrl = movieResponse.getString("stream_url")

// 2. Injete no ExoPlayer nativo
val mediaItem = MediaItem.fromUri(streamUrl)
exoPlayer.setMediaItem(mediaItem)
exoPlayer.prepare()
exoPlayer.play()`}</code></pre>
                                </div>
                            </div>

                            {/* Salvar Progresso (REST Seguro) */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge post">POST</span>
                                        <span className="api-path-badge">{baseUrl}/api/recents</span>
                                    </div>
                                    <span style={{ color: '#00ccff', fontSize: '0.8rem', fontWeight: 'bold' }}>⏱️ CONTINUE ASSISTINDO (SEGURO)</span>
                                </div>
                                <h3>Sincronizar Progresso do Usuário (Substituto Seguro de SQL)</h3>
                                <p>
                                    <strong>IMPORTANTE:</strong> O aplicativo nunca deve enviar queries SQL como <code>INSERT OR REPLACE INTO watch_history</code> para a rota <code>/mobile/execute</code>. 
                                    Utilize sempre este endpoint REST nativo. Ele associa automaticamente o progresso ao usuário autenticado (via Bearer JWT no header <code>Authorization</code>) ou via API Key.
                                </p>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Payload JSON (Salvar Progresso)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'progress-json' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "tmdb_id": 550,\n  "type": "filme",\n  "title": "Clube da Luta",\n  "progress_time": 1420,\n  "duration": 8340\n}`, 'progress-json')}
                                        >
                                            {copiedIndex === 'progress-json' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'progress-json' ? 'Copiado!' : 'Copiar JSON'}
                                        </button>
                                    </div>
                                    <pre><code>{`{
  "tmdb_id": 550,
  "type": "filme",
  "title": "Clube da Luta",
  "progress_time": 1420, // Segundos assistidos
  "duration": 8340,      // Duração total em segundos
  // Para episódios de séries, inclua também:
  "season": 1,
  "episode": 3
}`}</code></pre>
                                </div>
                            </div>

                            {/* Atualizar Progresso Rápido (PUT) */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge put">PUT</span>
                                        <span className="api-path-badge">{baseUrl}/api/recents/progress</span>
                                    </div>
                                    <span style={{ color: '#fb923c', fontSize: '0.8rem', fontWeight: 'bold' }}>🔄 ATUALIZAÇÃO RÁPIDA DE TEMPO</span>
                                </div>
                                <h3>Atualizar Tempo Assistido Enquanto o Vídeo Toca</h3>
                                <p>
                                    Chamada leve disparada a cada 10-15 segundos pelo player durante a reprodução.
                                </p>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Payload JSON</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'progress-put-json' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "tmdb_id": 1416,\n  "season": 2,\n  "episode": 4,\n  "progress_time": 850\n}`, 'progress-put-json')}
                                        >
                                            {copiedIndex === 'progress-put-json' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'progress-put-json' ? 'Copiado!' : 'Copiar JSON'}
                                        </button>
                                    </div>
                                    <pre><code>{`{
  "tmdb_id": 1416,
  "season": 2,
  "episode": 4,
  "progress_time": 850 // Segundos
}`}</code></pre>
                                </div>
                            </div>

                            {/* Alerta de Segurança e Boas Práticas do App */}
                            <div className="api-callout alert" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: '#ef4444' }}>
                                <AlertTriangle size={26} color="#ef4444" style={{ flexShrink: 0 }} />
                                <div>
                                    <strong style={{ color: '#ef4444' }}>DIRETRIZES OBRIGATÓRIAS DE SEGURANÇA NO APLICATIVO:</strong>
                                    <ul style={{ margin: '8px 0 0 18px', padding: 0, color: '#e2e8f0', fontSize: '0.88rem', lineHeight: '1.5' }}>
                                        <li><strong>Não envie código SQL bruto:</strong> As rotas <code>/mobile/query</code> e <code>/mobile/execute</code> bloqueiam consultas às tabelas confidenciais (<code>users</code>, <code>api_keys</code>, etc.). Sempre use as rotas REST parametrizadas.</li>
                                        <li><strong>Não armazene Tokens do TMDB no APK:</strong> O aplicativo nunca deve conter tokens de terceiros hardcoded nem em bibliotecas C++. As requisições de metadados devem ser feitas exclusivamente pelo backend <code>/api/tmdb/...</code>.</li>
                                        <li><strong>Desative Cleartext Traffic:</strong> Defina <code>android:usesCleartextTraffic="false"</code> no <code>AndroidManifest.xml</code> para forçar conexões HTTPS seguras e prevenir ataques MitM.</li>
                                        <li><strong>Validação de Planos no Servidor:</strong> Nunca decida acesso VIP através de flags locais editáveis em <code>SharedPreferences</code>. Envie o JWT do usuário autenticado no header <code>Authorization: Bearer &lt;token&gt;</code> para validação no backend.</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Atualização OTA */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/api/app-updates/latest</span>
                                    </div>
                                    <span style={{ color: '#fb923c', fontSize: '0.8rem', fontWeight: 'bold' }}>📲 OTA UPDATER</span>
                                </div>
                                <h3>Verificação Automática de Versão do APK</h3>
                                <p>Consulte essa rota na inicialização do aplicativo para notificar o usuário sobre novas versões disponíveis para download direto.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* CONTEÚDO DA ABA: BOTS WHATSAPP / TELEGRAM */}
                {activeTab === 'bots' && (
                    <div className="api-docs-section-card">
                        <div className="api-section-header">
                            <h2><Terminal size={22} color="#00ff88" /> Integração com Bots (WhatsApp, Discord, Telegram)</h2>
                            <p>
                                Conecte seus robôs de atendimento. Envie o nome ou o TMDB ID da mídia e receba instantaneamente 
                                o link direto de reprodução, download ou identificador para encaminhamento nativo no Telegram.
                            </p>
                        </div>

                        <div className="api-endpoints-stack">
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/api/bot/search?tmdb_id=1416&season=2&episode=4&apikey=SUA_CHAVE</span>
                                    </div>
                                    <span style={{ color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold' }}>🎯 BUSCA DIRETA POR TMDB ID</span>
                                </div>
                                <h3>Busca Exata por TMDB ID e Episódio</h3>
                                <p>
                                    Como 100% dos arquivos baixados já estão mapeados no banco, você pode buscar diretamente passando <code>tmdb_id</code>, <code>season</code> e <code>episode</code> (ou apenas <code>tmdb_id</code> para filmes). Isso garante precisão cirúrgica de 100% sem riscos de carregar episódios repetidos ou errados!
                                </p>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                    <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Exemplos suportados:</span>
                                    <code className="api-code-pill">/api/bot/search?tmdb_id=550&apikey=... (Filme)</code>
                                    <code className="api-code-pill">/api/bot/search?tmdb_id=1416&season=1&episode=2&apikey=... (Série)</code>
                                    <code className="api-code-pill">/api/bot/search?q=1416 S01E02&apikey=... (Legado por query)</code>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Exemplo de Resposta (JSON)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'bot-search-json' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "found": true,\n  "title": "Homem-Aranha (2002)",\n  "type": "filme",\n  "telegram_message_id": 84512,\n  "stream_url": "${baseUrl}/api/stream/s/eyJ...XYZ.mp4",\n  "direct_download_url": "${baseUrl}/api/stream/d/fXhvc...Y3ci",\n  "site_url": "${baseUrl}/filme/homem-aranha"\n}`, 'bot-search-json')}
                                        >
                                            {copiedIndex === 'bot-search-json' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'bot-search-json' ? 'Copiado!' : 'Copiar Resposta'}
                                        </button>
                                    </div>
                                    <pre><code>{`{
  "found": true,
  "title": "Homem-Aranha (2002)",
  "type": "filme",
  "telegram_message_id": 84512,
  "stream_url": "${baseUrl}/api/stream/s/eyJ...XYZ.mp4",
  "direct_download_url": "${baseUrl}/api/stream/d/fXhvc...Y3ci",
  "site_url": "${baseUrl}/filme/homem-aranha"
}`}</code></pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* CONTEÚDO DA ABA: SQL & BANCO DE DADOS */}
                {activeTab === 'sql' && (
                    <div className="api-docs-section-card">
                        <div className="api-section-header">
                            <h2><Database size={22} color="#00ff88" /> Endpoints de Acesso SQL Direto (API Mobile)</h2>
                            <p>
                                Permite consultar e manipular tabelas do sistema de forma estruturada e autenticada via HTTP.
                            </p>
                        </div>

                        <div className="api-endpoints-stack">
                            {sqlEndpoints.map((ep, idx) => (
                                <div key={idx} className="api-endpoint-box">
                                    <div className="api-endpoint-box-header">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className={`api-method-badge ${ep.method.toLowerCase()}`}>{ep.method}</span>
                                            <span className="api-path-badge">{baseUrl}{ep.path}</span>
                                        </div>
                                    </div>
                                    <h3>{ep.title}</h3>
                                    <p>{ep.description}</p>

                                    {ep.params && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginRight: '6px' }}>Query Params:</span>
                                            <code className="api-code-pill">{ep.params}</code>
                                        </div>
                                    )}

                                    {ep.body && (
                                        <div className="api-modern-code">
                                            <div className="api-code-bar">
                                                <span className="api-code-label">Request Body (JSON)</span>
                                            </div>
                                            <pre><code>{ep.body}</code></pre>
                                        </div>
                                    )}

                                    <div className="api-modern-code" style={{ marginTop: '10px' }}>
                                        <div className="api-code-bar">
                                            <span className="api-code-label" style={{ color: '#00ff88' }}>Resposta Esperada</span>
                                        </div>
                                        <pre><code>{ep.response}</code></pre>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Tabela de Códigos de Erro */}
                        <div style={{ marginTop: '2.5rem' }}>
                            <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '1rem' }}>
                                <Shield size={20} color="#00ccff" style={{ verticalAlign: 'middle', marginRight: '8px' }} />
                                Códigos de Status HTTP
                            </h3>
                            <div className="api-table-wrapper">
                                <table className="api-modern-table">
                                    <thead>
                                        <tr>
                                            <th>Status</th>
                                            <th>Significado</th>
                                            <th>Motivo Típico</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><span className="api-method-badge get">200 OK</span></td>
                                            <td>Sucesso</td>
                                            <td>Requisição processada com êxito.</td>
                                        </tr>
                                        <tr>
                                            <td><span className="api-method-badge delete">401 Unauthorized</span></td>
                                            <td>Não Autorizado</td>
                                            <td>API Key ausente no header ou desativada no painel.</td>
                                        </tr>
                                        <tr>
                                            <td><span className="api-method-badge put">400 Bad Request</span></td>
                                            <td>Parâmetros Inválidos</td>
                                            <td>Falta de campos obrigatórios no corpo da requisição.</td>
                                        </tr>
                                        <tr>
                                            <td><span className="api-method-badge delete">403 Forbidden</span></td>
                                            <td>Operação Bloqueada</td>
                                            <td>Permissões insuficientes ou domínio não autorizado para a chave.</td>
                                        </tr>
                                        <tr>
                                            <td><span className="api-method-badge delete">500 Server Error</span></td>
                                            <td>Erro Interno</td>
                                            <td>Falha de sintaxe na query SQL ou falha de conectividade.</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
