import React, { useState } from 'react';
import { 
    ArrowLeft, Key, Code, Database, Shield, BookOpen, Terminal, 
    Smartphone, Copy, Check, Tv, Play, ExternalLink, Zap, 
    Layers, Cpu, Server, CheckCircle2, AlertTriangle, Info, Globe, Bug,
    MessageSquare, ThumbsUp
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

                        {/* NOVO BLOCO: BLINDAGEM DE SEGURANÇA E ZERO CHAVES NO CÓDIGO */}
                        <div className="api-callout alert" style={{ background: 'rgba(0, 255, 136, 0.05)', borderColor: '#00ff88', marginBottom: '1.5rem', display: 'block' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                <Shield size={24} color="#00ff88" />
                                <h3 style={{ margin: 0, color: '#00ff88', fontSize: '1.1rem' }}>
                                    NOVA DIRETRIZ DE SEGURANÇA: REMOÇÃO DE API KEYS E SESSÃO SEGURA (HMAC)
                                </h3>
                            </div>
                            <p style={{ color: '#cbd5e1', fontSize: '0.88rem', lineHeight: '1.6', margin: '0 0 10px 0' }}>
                                <strong>Atenção Desenvolvedor:</strong> Não mantenha strings de API Keys estáticas (como <code>zfx_...</code>) gravadas no código Kotlin/Java do app, pois ferramentas de descompilação (JADX) e sniffers extraem facilmente.
                                Em vez disso, o app deve inicializar com o <strong>Handshake Criptográfico HMAC</strong> abaixo para receber um Token de Sessão temporário e dinâmico.
                            </p>
                        </div>

                        <div className="api-endpoints-stack">
                            {/* PASSO ZERO: Handshake de Sessão Criptográfica */}
                            <div className="api-endpoint-box" style={{ border: '1px solid rgba(0, 255, 136, 0.3)', background: 'rgba(0, 255, 136, 0.02)' }}>
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge post" style={{ background: '#00ff88', color: '#000', fontWeight: 'bold' }}>POST</span>
                                        <span className="api-path-badge">{baseUrl}/api/mobile/session</span>
                                    </div>
                                    <span style={{ color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold' }}>🛡️ HANDSHAKE DE INICIALIZAÇÃO</span>
                                </div>
                                <h3>1. Obter Token de Sessão Efêmero (Sem API Key Exposta)</h3>
                                <p>
                                    Ao abrir o aplicativo, execute esta chamada para validar a integridade do app e receber um token JWT com validade de 12 horas.
                                    Todas as requisições seguintes devem enviar <code>Authorization: Bearer &lt;session_token&gt;</code>.
                                </p>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Body JSON Enviado no Handshake</span>
                                        <button 
                                            className="api-copy-code-btn"
                                            onClick={() => handleCopy(`{\n  "device_id": "8a3f912c4b78e100",\n  "timestamp": 1729638400000,\n  "nonce": "k92mZb81A9sL0x91",\n  "signature": "c88f12b694f4a3e79...",\n  "app_version": "1.0.4"\n}`, 'hmac-body')}
                                        >
                                            {copiedIndex === 'hmac-body' ? <Check size={14} color="#00ff88"/> : <Copy size={14}/>}
                                        </button>
                                    </div>
                                    <pre><code>{`{
  "device_id": "8a3f912c4b78e100",    // Settings.Secure.ANDROID_ID
  "timestamp": 1729638400000,          // System.currentTimeMillis() (Janela de 60s)
  "nonce": "k92mZb81A9sL0x91",          // String aleatória de 16 caracteres únicos
  "signature": "c88f12b694f4a3e79...",  // HMAC-SHA256("\${device_id}:\${timestamp}:\${nonce}")
  "app_version": "1.0.4"
}`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Resposta da Sessão (HTTP 200)</span>
                                    </div>
                                    <pre><code>{`{
  "success": true,
  "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 43200, // 12 horas
  "issued_at": "2026-10-22T23:15:00.000Z"
}`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Implementação em Kotlin (OkHttp / Interceptor Automático)</span>
                                        <button 
                                            className="api-copy-code-btn"
                                            onClick={() => handleCopy(`object SecurityManager {
    // Segredo fatiado em runtime para impedir busca por strings puras no DEX
    private val PART_A = "cg_mob_sec_"
    private val PART_B = "99a8f27e61b44c8da09d85421"
    private fun getSecret(): String = PART_A + PART_B

    fun generateHmac(message: String): String {
        val mac = javax.crypto.Mac.getInstance("HmacSHA256")
        mac.init(javax.crypto.spec.SecretKeySpec(getSecret().toByteArray(), "HmacSHA256"))
        return mac.doFinal(message.toByteArray()).joinToString("") { "%02x".format(it) }
    }
}

// Ao abrir o app:
val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
val timestamp = System.currentTimeMillis()
val nonce = UUID.randomUUID().toString().replace("-", "").take(16)
val signature = SecurityManager.generateHmac("\$deviceId:\$timestamp:\$nonce")

// Chame POST /api/mobile/session e salve o session_token no SharedPreferences / DataStore!`, 'sec-kotlin')}
                                        >
                                            {copiedIndex === 'sec-kotlin' ? <Check size={14} color="#00ff88"/> : <Copy size={14}/>}
                                        </button>
                                    </div>
                                    <pre><code>{`object SecurityManager {
    // Segredo fatiado em runtime para impedir busca simples de strings no DEX
    private val PART_A = "cg_mob_sec_"
    private val PART_B = "99a8f27e61b44c8da09d85421"
    private fun getSecret(): String = PART_A + PART_B

    fun generateHmac(message: String): String {
        val mac = javax.crypto.Mac.getInstance("HmacSHA256")
        mac.init(javax.crypto.spec.SecretKeySpec(getSecret().toByteArray(), "HmacSHA256"))
        return mac.doFinal(message.toByteArray()).joinToString("") { "%02x".format(it) }
    }
}

// No onCreate / SplashScreen:
val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
val timestamp = System.currentTimeMillis()
val nonce = java.util.UUID.randomUUID().toString().replace("-", "").take(16)
val signature = SecurityManager.generateHmac("\$deviceId:\$timestamp:\$nonce")

// POST /api/mobile/session -> Salve session_token e use em todas as requisições:
// Request Header: Authorization: Bearer <session_token>`}</code></pre>
                                </div>
                            </div>

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

                            {/* Sistema de Pontos & Pedidos */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/api/points/*</span>
                                    </div>
                                    <span style={{ color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold' }}>🏆 PONTOS &amp; PEDIDOS</span>
                                </div>
                                <h3>Sistema de Pontos e Pedidos de Conteúdo</h3>
                                <p>
                                    Usuários <strong>logados</strong> ganham <strong>+20 pontos</strong> ao assistir pelo menos <strong>80%</strong> de um filme/episódio (1x por conteúdo) e gastam <strong>100 pontos</strong> para pedir um título que ainda não existe no catálogo. Todas as rotas exigem o header <code>Authorization: Bearer &lt;JWT&gt;</code> (exceto as listagens públicas marcadas).
                                </p>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                    <code className="api-code-pill">GET /api/points/balance (Saldo, histórico e meus pedidos)</code>
                                    <code className="api-code-pill">POST /api/points/watch-reward (+20 pts ao atingir 80%)</code>
                                    <code className="api-code-pill">GET /api/points/search?query=nome (Busca só do que NÃO temos)</code>
                                    <code className="api-code-pill">POST /api/points/request-content (Pedir por 100 pts)</code>
                                    <code className="api-code-pill">GET /api/points/requests?filter=all|movie|tv|anime (Mais pedidos - público)</code>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">1) GET /api/points/balance → Resposta</span>
                                    </div>
                                    <pre><code>{`{
  "points": 140,                // Saldo atual do usuário
  "history": [                  // Últimos ganhos por assistir
    { "tmdb_id": "550", "media_type": "movie", "season": null,
      "episode": null, "points": 20, "source": "app_player",
      "created_at": "2026-10-22 18:00:00" }
  ],
  "myRequests": [               // Pedidos que o usuário já fez
    { "id": 7, "title": "Dexter", "media_type": "tv", "votes": 12,
      "status": "pending", "points_spent": 100, "poster_path": "/abc.jpg" }
  ]
}`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">2) POST /api/points/watch-reward → Chamar UMA vez quando currentPosition/duration ≥ 0.80</span>
                                        <button
                                            className={`api-copy-btn ${copiedIndex === 'points-reward' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "tmdb_id": "1416",\n  "media_type": "tv",\n  "season": 2,\n  "episode": 4,\n  "source": "app_player"\n}`, 'points-reward')}
                                        >
                                            {copiedIndex === 'points-reward' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'points-reward' ? 'Copiado!' : 'Copiar JSON'}
                                        </button>
                                    </div>
                                    <pre><code>{`// Body (filmes: omita season/episode)
{
  "tmdb_id": "1416",
  "media_type": "tv",     // "movie" | "tv"
  "season": 2,
  "episode": 4,
  "source": "app_player"
}

// Resposta - ganhou:
{ "success": true, "pointsAwarded": 20, "totalPoints": 160 }
// Resposta - já ganhou antes por este conteúdo:
{ "success": false, "alreadyAwarded": true }`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">3) GET /api/points/search?query=one piece → Resposta (já sem o que temos)</span>
                                    </div>
                                    <pre><code>{`{
  "results": [
    { "tmdb_id": 37854, "media_type": "tv", "title": "One Piece",
      "year": "1999", "poster_url": "https://image.tmdb.org/t/p/w300/abc.jpg",
      "poster_path": "/abc.jpg", "is_anime": true }
  ]
}`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">4) POST /api/points/request-content → Fazer pedido (-100 pts)</span>
                                        <button
                                            className={`api-copy-btn ${copiedIndex === 'points-request' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "tmdb_id": "37854",\n  "media_type": "tv",\n  "season": 1,\n  "episode": 5,\n  "title": "One Piece",\n  "poster_path": "/abc.jpg",\n  "year": "1999",\n  "is_anime": 1\n}`, 'points-request')}
                                        >
                                            {copiedIndex === 'points-request' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'points-request' ? 'Copiado!' : 'Copiar JSON'}
                                        </button>
                                    </div>
                                    <pre><code>{`// Body (season/episode opcionais: use para pedir temporada ou episódio específico)
{
  "tmdb_id": "37854",
  "media_type": "tv",
  "season": 1,
  "episode": 5,
  "title": "One Piece",
  "poster_path": "/abc.jpg",
  "year": "1999",
  "is_anime": 1
}

// Sucesso: { "success": true, "remainingPoints": 60, "message": "..." }
// Erro (400): { "error": "Pontos insuficientes..." } ou { "error": "Você já fez ou votou neste pedido!" }`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">5) GET /api/points/requests?filter=all&amp;limit=50 → Ranking "Mais pedidos"</span>
                                    </div>
                                    <pre><code>{`[
  { "id": 7, "tmdb_id": "37854", "media_type": "tv", "season": null,
    "episode": null, "title": "One Piece", "poster_path": "/abc.jpg",
    "year": "1999", "is_anime": 1, "votes": 8387, "status": "pending" }
]
// status: "pending" | "completed" (já adicionado) | "rejected"
// Ordenado por votos (#1, #2, #3...). Cada item = "N Solicitações".`}</code></pre>
                                </div>
                            </div>

                            {/* Catálogo TMDB Proxy do Servidor */}
                            <div className="api-endpoint-box">
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/api/tmdb/*</span>
                                    </div>
                                    <span style={{ color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold' }}>🎬 CATÁLOGO TMDB (PROXY SEGURO)</span>
                                </div>
                                <h3>Rotas de Catálogo, Lançamentos e Busca (Sem expor chaves no APK)</h3>
                                <p>
                                    O aplicativo não precisa conter tokens do TMDB. Todas as chamadas para alimentar a Home, carrosséis, telas de detalhes e buscas devem bater nestes endpoints protegidos com cache de 30 minutos:
                                </p>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', marginTop: '0.5rem' }}>
                                    <code className="api-code-pill">GET /api/tmdb/trending/movie/week (Banner Principal)</code>
                                    <code className="api-code-pill">GET /api/tmdb/movie/now_playing (Filmes Lançamentos)</code>
                                    <code className="api-code-pill">GET /api/tmdb/tv/popular (Séries em Alta)</code>
                                    <code className="api-code-pill">GET /api/tmdb/movie/popular (Filmes Populares)</code>
                                    <code className="api-code-pill">GET /api/tmdb/discover/movie (Destaques)</code>
                                    <code className="api-code-pill">GET /api/tmdb/search?query=nome (Busca TMDB)</code>
                                    <code className="api-code-pill">GET /api/tmdb/movie/:id (Detalhes, Áudios, Qualidades e Versões)</code>
                                    <code className="api-code-pill">GET /api/tmdb/movie/:id/credits (Elenco do Filme)</code>
                                    <code className="api-code-pill">GET /api/tmdb/tv/:id (Detalhes da Série)</code>
                                    <code className="api-code-pill">GET /api/tmdb/tv/:id/credits (Elenco da Série)</code>
                                    <code className="api-code-pill">GET /api/tmdb/tv/:id/season/:season_number (Episódios, Áudios e Fontes)</code>
                                    <code className="api-code-pill">GET /api/tmdb/movie/:id/recommendations (Talvez você goste - Filme)</code>
                                    <code className="api-code-pill">GET /api/tmdb/tv/:id/recommendations (Talvez você goste - Série)</code>
                                    <code className="api-code-pill">GET /api/tmdb/movie/:id/videos (Trailers do Filme)</code>
                                    <code className="api-code-pill">GET /api/tmdb/tv/:id/videos (Trailers da Série)</code>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Exemplo de Resposta: GET /api/tmdb/movie/:id (com Suporte a Áudios, Qualidades e Versões)</span>
                                    </div>
                                    <pre><code>{`{
  "id": 634649,
  "title": "Homem-Aranha: Sem Volta Para Casa",
  "overview": "Peter Parker tem a sua identidade secreta revelada...",
  "poster_path": "/fVzXp3NwM04n1wh5f4Tj0b9wA6P.jpg",
  "backdrop_path": "/14QbnygCuTO0vl7CAFmPf1fgZfV.jpg",
  "vote_average": 8.0,
  "hasDub": true,
  "hasLeg": true,
  "available_qualities": ["4K", "FHD", "HD"],
  "stream_url": "https://www.cinegeek.shop/api/stream/s/token_padrao.mp4",
  "media_sources": {
    "4K": {
      "dub": [
        { "version": 1, "title": "Homem-Aranha 4K Dublado", "quality": "4K", "language": "Dublado", "audio": "dub", "stream_url": "https://www.cinegeek.shop/api/stream/s/..." }
      ],
      "leg": [
        { "version": 1, "title": "Homem-Aranha 4K Legendado", "quality": "4K", "language": "Legendado", "audio": "leg", "stream_url": "https://www.cinegeek.shop/api/stream/s/..." }
      ]
    },
    "FHD": {
      "dub": [
        { "version": 1, "title": "Homem-Aranha FHD Dublado (Opção 1)", "quality": "FHD", "language": "Dublado", "audio": "dub", "stream_url": "https://www.cinegeek.shop/api/stream/s/..." },
        { "version": 2, "title": "Homem-Aranha FHD Dublado (Opção 2 - Versão Estendida)", "quality": "FHD", "language": "Dublado", "audio": "dub", "stream_url": "https://www.cinegeek.shop/api/stream/s/..." }
      ],
      "leg": []
    }
  }
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

                            {/* Reporte Automático de Erros / Falhas do App */}
                            <div className="api-endpoint-box" style={{ border: '1px solid rgba(255, 153, 0, 0.4)', background: 'rgba(255, 153, 0, 0.03)' }}>
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge post" style={{ background: '#ff9900', color: '#000', fontWeight: '900' }}>POST</span>
                                        <span className="api-path-badge">{baseUrl}/api/app-reports</span>
                                    </div>
                                    <span style={{ color: '#ff9900', fontSize: '0.8rem', fontWeight: 'bold' }}>🐛 REPORTAR ERRO / CRASH (1 CLIQUE)</span>
                                </div>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Bug size={18} color="#ff9900" /> Relatório Automático de Erros, Reprodução & Crashes
                                </h3>
                                <p>
                                    Permite que o aplicativo envie automaticamente para o servidor qualquer erro ou falha que ocorra no dispositivo 
                                    (falha de reprodução no ExoPlayer, erro 404, falha de conexão de rede, clique com erro, etc.). 
                                    O usuário <strong>não precisa digitar nada</strong>: basta clicar em <em>"Reportar Erro"</em> e o app dispara o relatório com o modelo do celular, versão do Android, log da falha e horário oficial de São Paulo.
                                </p>

                                <div className="api-callout tip" style={{ background: 'rgba(0, 255, 136, 0.08)', borderColor: '#00ff88', marginBottom: '1rem' }}>
                                    <CheckCircle2 size={20} color="#00ff88" style={{ flexShrink: 0 }} />
                                    <div style={{ fontSize: '0.88rem' }}>
                                        <strong>Dica de Integração:</strong> Esse endpoint aceita tanto requisições de usuários logados (via <code>Authorization: Bearer &lt;token&gt;</code>) 
                                        quanto anônimas/com API Key (<code>x-api-key</code>). Possui proteção anti-flood no servidor para não sobrecarregar com cliques repetidos.
                                    </div>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Headers da Requisição</span>
                                    </div>
                                    <pre><code>{`Content-Type: application/json
Authorization: Bearer <SEU_JWT_SE_LOGADO>   // Opcional se logado
x-api-key: <CHAVE_API_MOBILE>               // Opcional`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Payload JSON Enviado pelo App (Body)</span>
                                        <button 
                                            className="api-copy-code-btn"
                                            onClick={() => handleCopy(`{\n  "app_version": "1.0.4",\n  "device_model": "Xiaomi Redmi Note 12",\n  "android_version": "13",\n  "error_type": "playback_error",\n  "error_message": "ExoPlayer failed: BehindLiveWindowException",\n  "error_stack": "com.google.android.exoplayer2.ExoPlaybackException: BehindLiveWindowException\\n    at com.cinegeek.player.PlayerEngine.onPlayerError(PlayerEngine.kt:89)",\n  "content_id": "94605",\n  "content_title": "Arcane",\n  "season": 2,\n  "episode": 1\n}`, 'app-report-body')}
                                        >
                                            {copiedIndex === 'app-report-body' ? <Check size={14} color="#00ff88"/> : <Copy size={14}/>}
                                        </button>
                                    </div>
                                    <pre><code>{`{
  "app_version": "1.0.4",                   // Versão atual do aplicativo
  "device_model": "Xiaomi Redmi Note 12",   // Modelo do aparelho (ex: Build.MODEL)
  "android_version": "13",                  // Versão do Android (Build.VERSION.RELEASE)
  "error_type": "playback_error",           // "playback_error" | "network_error" | "crash" | "ui_error"
  "error_message": "ExoPlayer Source Error", // Resumo legível da falha (obrigatório)
  "error_stack": "ExoPlaybackException...",  // Stack trace completo do Kotlin/Java para depuração
  "content_id": "94605",                    // TMDB ID do filme ou série em reprodução
  "content_title": "Arcane",                // Nome do filme/série no momento do erro
  "season": 2,                              // Opcional (se for série)
  "episode": 1                              // Opcional (se for série)
}`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Exemplo de Resposta do Servidor (HTTP 201)</span>
                                    </div>
                                    <pre><code>{`{
  "success": true,
  "message": "Relatório de erro registrado com sucesso.",
  "report_id": 42
}`}</code></pre>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Implementação Prática no App (Kotlin / Android)</span>
                                        <button 
                                            className="api-copy-code-btn"
                                            onClick={() => handleCopy(`fun sendErrorReport(
    errorMessage: String,
    errorStack: String? = null,
    errorType: String = "playback_error",
    contentId: String? = null,
    contentTitle: String? = null,
    season: Int? = null,
    episode: Int? = null
) {
    val json = JSONObject().apply {
        put("app_version", BuildConfig.VERSION_NAME)
        put("device_model", "\${Build.MANUFACTURER} \${Build.MODEL}")
        put("android_version", Build.VERSION.RELEASE)
        put("error_type", errorType)
        put("error_message", errorMessage)
        put("error_stack", errorStack ?: "")
        put("content_id", contentId)
        put("content_title", contentTitle)
        put("season", season)
        put("episode", episode)
    }

    val request = Request.Builder()
        .url("${baseUrl}/api/app-reports")
        .addHeader("Content-Type", "application/json")
        .post(json.toString().toRequestBody("application/json".toMediaType()))
        .build()

    httpClient.newCall(request).enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            // Sucesso silencioso ou exibir Toast rápido: "Erro reportado com sucesso!"
        }
        override fun onFailure(call: Call, e: IOException) {}
    })
}`, 'app-report-code')}
                                        >
                                            {copiedIndex === 'app-report-code' ? <Check size={14} color="#00ff88"/> : <Copy size={14}/>}
                                        </button>
                                    </div>
                                    <pre><code>{`fun sendErrorReport(
    errorMessage: String,
    errorStack: String? = null,
    errorType: String = "playback_error",
    contentId: String? = null,
    contentTitle: String? = null,
    season: Int? = null,
    episode: Int? = null
) {
    val json = JSONObject().apply {
        put("app_version", BuildConfig.VERSION_NAME)
        put("device_model", "\${Build.MANUFACTURER} \${Build.MODEL}")
        put("android_version", Build.VERSION.RELEASE)
        put("error_type", errorType)
        put("error_message", errorMessage)
        put("error_stack", errorStack ?: "")
        put("content_id", contentId)
        put("content_title", contentTitle)
        put("season", season)
        put("episode", episode)
    }

    val request = Request.Builder()
        .url("${baseUrl}/api/app-reports")
        .addHeader("Content-Type", "application/json")
        .post(json.toString().toRequestBody("application/json".toMediaType()))
        .build()

    httpClient.newCall(request).enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            // Sucesso silencioso ou exibir Toast: "Erro reportado com sucesso aos administradores!"
        }
        override fun onFailure(call: Call, e: IOException) {}
    })
}`}</code></pre>
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

                            {/* Canais Ao Vivo (Catálogo JSON do Painel) */}
                            <div className="api-endpoint-box" style={{ border: '1px solid rgba(0, 255, 136, 0.3)', background: 'rgba(0, 255, 136, 0.02)' }}>
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get">GET</span>
                                        <span className="api-path-badge">{baseUrl}/api/embed/canais</span>
                                    </div>
                                    <span style={{ color: '#00ff88', fontSize: '0.8rem', fontWeight: 'bold' }}>📺 CANAIS AO VIVO (JSON)</span>
                                </div>
                                <h3>Catálogo de Canais de TV Cadastrados no Painel</h3>
                                <p>
                                    Retorna a lista completa dos canais de televisão ativos salvos nas listas M3U do nosso painel administrativo. 
                                    Cada canal contém seu identificador único, nome, categoria, selo VIP (se aplicável), URL do logotipo e a URL segura de reprodução para o aplicativo.
                                </p>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', marginTop: '0.5rem' }}>
                                    <code className="api-code-pill">GET /api/embed/canais (Todos os canais)</code>
                                    <code className="api-code-pill">GET /api/embed/canais?category=Esportes (Filtro por categoria)</code>
                                    <code className="api-code-pill">GET /api/embed/canal/:id (Detalhes e stream seguro do canal)</code>
                                </div>

                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Exemplo de Resposta JSON (HTTP 200)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'channels-json' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "total": 486,\n  "channels": [\n    {\n      "id": 1,\n      "name": "ESPN Brasil HD",\n      "category": "Esportes",\n      "badge": "VIP",\n      "logo": "https://.../espn.png",\n      "embed_url": "${baseUrl}/embed/canal/1"\n    }\n  ]\n}`, 'channels-json')}
                                        >
                                            {copiedIndex === 'channels-json' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'channels-json' ? 'Copiado!' : 'Copiar Resposta'}
                                        </button>
                                    </div>
                                    <pre><code>{`{
  "total": 486,
  "channels": [
    {
      "id": 1,
      "name": "ESPN Brasil HD",
      "category": "Esportes",
      "badge": "VIP",
      "logo": "https://.../espn.png",
      "embed_url": "${baseUrl}/embed/canal/1"
    },
    {
      "id": 2,
      "name": "HBO Plus FHD",
      "category": "Filmes e Séries",
      "badge": "VIP",
      "logo": "https://.../hbo.png",
      "embed_url": "${baseUrl}/embed/canal/2"
    }
  ]
}`}</code></pre>
                                </div>
                            </div>

                            {/* Sistema de Comentários Sincronizados (Site & APK) */}
                            <div className="api-endpoint-box" style={{ border: '1px solid rgba(168, 85, 247, 0.4)', background: 'rgba(168, 85, 247, 0.03)' }}>
                                <div className="api-endpoint-box-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="api-method-badge get" style={{ background: '#a855f7', color: '#fff' }}>GET / POST</span>
                                        <span className="api-path-badge">{baseUrl}/api/comments/*</span>
                                    </div>
                                    <span style={{ color: '#c084fc', fontSize: '0.8rem', fontWeight: 'bold' }}>💬 COMENTÁRIOS SINCRONIZADOS (SITE &amp; APK)</span>
                                </div>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <MessageSquare size={18} color="#c084fc" /> Sistema Unificado de Comentários, Respostas &amp; Curtidas
                                </h3>
                                <p>
                                    Tanto o site quanto o aplicativo compartilham exatamente os <strong>mesmos comentários em tempo real</strong>. 
                                    Qualquer usuário pode <strong>ler comentários livremente</strong> (rota pública), mas para <strong>comentar, responder ou reagir (like/dislike)</strong>, 
                                    o aplicativo <strong>deve enviar o usuário logado</strong> através do header <code>Authorization: Bearer &lt;JWT&gt;</code>. Usuários não autenticados receberão <code>401 Unauthorized</code>.
                                </p>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.2rem', marginTop: '0.5rem' }}>
                                    <code className="api-code-pill">GET /api/comments/:mediaType/:contentId (Público - Listar)</code>
                                    <code className="api-code-pill">POST /api/comments (Requer Login - Postar/Responder)</code>
                                    <code className="api-code-pill">POST /api/comments/react (Requer Login - Curtir/Descurtir)</code>
                                    <code className="api-code-pill">POST /api/comments/report (Requer Login - Denunciar)</code>
                                    <code className="api-code-pill">POST /api/comments/upload-sticker (Figurinhas/Imagens)</code>
                                </div>

                                {/* 1. Listar comentários */}
                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">1) GET /api/comments/:mediaType/:contentId?episodeId=... (Público)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'comments-get' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`${baseUrl}/api/comments/movie/550\n${baseUrl}/api/comments/tv/1416?episodeId=ep_s01e01`, 'comments-get')}
                                        >
                                            {copiedIndex === 'comments-get' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'comments-get' ? 'Copiado!' : 'Copiar URLs'}
                                        </button>
                                    </div>
                                    <pre><code>{`// Parâmetros de rota:
// :mediaType -> "movie" | "tv" | "anime" | "manga"
// :contentId -> TMDB ID ou ID da obra
// ?episodeId -> (Opcional) Identificador do episódio/capítulo se quiser comentários específicos por episódio

// Exemplo de Retorno JSON (HTTP 200):
[
  {
    "id": 105,
    "user_id": 12,
    "nick": "ZoroSolos",
    "avatar": "https://...",
    "role": "vip",               // "free" | "vip" | "admin"
    "parent_id": null,           // null = comentário raiz, número = resposta a outro comentário
    "content_id": "550",
    "media_type": "movie",
    "episode_id": null,
    "text": "Filme sensacional! A reviravolta no final é surreal 🔥",
    "status": "visible",         // "visible" | "moderated"
    "created_at": "2026-10-25 21:40:12",
    "likes": 14,                 // Total de curtidas
    "dislikes": 1                // Total de dislikes
  }
]`}</code></pre>
                                </div>

                                {/* 2. Postar Comentário */}
                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">2) POST /api/comments (Apenas Usuários Logados)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'comments-post' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "contentId": "550",\n  "mediaType": "movie",\n  "text": "Muito bom esse filme!",\n  "parentId": null,\n  "episodeId": null\n}`, 'comments-post')}
                                        >
                                            {copiedIndex === 'comments-post' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'comments-post' ? 'Copiado!' : 'Copiar JSON'}
                                        </button>
                                    </div>
                                    <pre><code>{`// Headers Obrigatórios:
// Content-Type: application/json
// Authorization: Bearer <JWT_DO_USUARIO_LOGADO>

// Payload JSON (Body):
{
  "contentId": "550",           // TMDB ID da obra
  "mediaType": "movie",         // "movie" | "tv" | "anime" | "manga"
  "text": "Muito bom esse filme!",
  "parentId": null,             // Envie o ID do comentário se for uma RESPOSTA
  "episodeId": null             // Envie o ID do episódio se for comentário de episódio
}

// Resposta de Sucesso (HTTP 200):
{
  "id": 106,
  "message": "Comentário postado com sucesso!"
}

// Resposta de Erro (HTTP 401 - Não logado):
{
  "error": "Você precisa estar logado para comentar."
}`}</code></pre>
                                </div>

                                {/* 3. Curtir / Descurtir */}
                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">3) POST /api/comments/react (Apenas Usuários Logados)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'comments-react' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`{\n  "commentId": 105,\n  "type": "like"\n}`, 'comments-react')}
                                        >
                                            {copiedIndex === 'comments-react' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'comments-react' ? 'Copiado!' : 'Copiar JSON'}
                                        </button>
                                    </div>
                                    <pre><code>{`// Headers:
// Authorization: Bearer <JWT_DO_USUARIO_LOGADO>
// Content-Type: application/json

// Payload JSON:
{
  "commentId": 105,
  "type": "like"    // "like" ou "dislike"
}

// Resposta (HTTP 200):
{
  "message": "Reação salva!"
}`}</code></pre>
                                </div>

                                {/* Exemplo Kotlin / Retrofit */}
                                <div className="api-modern-code">
                                    <div className="api-code-bar">
                                        <span className="api-code-label">Implementação no Android APK (Retrofit / Kotlin)</span>
                                        <button 
                                            className={`api-copy-btn ${copiedIndex === 'comments-kotlin' ? 'copied' : ''}`}
                                            onClick={() => handleCopy(`interface CommentsService {
    @GET("api/comments/{mediaType}/{contentId}")
    suspend fun getComments(
        @Path("mediaType") mediaType: String,
        @Path("contentId") contentId: String,
        @Query("episodeId") episodeId: String? = null
    ): List<CommentItem>

    @POST("api/comments")
    suspend fun postComment(
        @Header("Authorization") token: String, // "Bearer " + jwtToken
        @Body body: PostCommentRequest
    ): PostCommentResponse

    @POST("api/comments/react")
    suspend fun reactComment(
        @Header("Authorization") token: String,
        @Body body: ReactCommentRequest
    ): GenericResponse
}`, 'comments-kotlin')}
                                        >
                                            {copiedIndex === 'comments-kotlin' ? <Check size={14} /> : <Copy size={14} />}
                                            {copiedIndex === 'comments-kotlin' ? 'Copiado!' : 'Copiar Kotlin'}
                                        </button>
                                    </div>
                                    <pre><code>{`interface CommentsService {
    // 1) Listagem pública de comentários
    @GET("api/comments/{mediaType}/{contentId}")
    suspend fun getComments(
        @Path("mediaType") mediaType: String,
        @Path("contentId") contentId: String,
        @Query("episodeId") episodeId: String? = null
    ): List<CommentItem>

    // 2) Postar comentário (exige login)
    @POST("api/comments")
    suspend fun postComment(
        @Header("Authorization") token: String, // "Bearer $jwtToken"
        @Body body: PostCommentRequest
    ): PostCommentResponse

    // 3) Reagir com Like / Dislike (exige login)
    @POST("api/comments/react")
    suspend fun reactComment(
        @Header("Authorization") token: String, // "Bearer $jwtToken"
        @Body body: ReactCommentRequest
    ): GenericResponse
}`}</code></pre>
                                </div>
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
