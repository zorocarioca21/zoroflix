import React from 'react';
import { ArrowLeft, Key, Code, Database, Shield, BookOpen, Terminal, Smartphone } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ApiDocsPage() {
    const baseUrl = window.location.origin;

    const endpoints = [
        {
            method: 'GET',
            path: '/api/mobile/tables',
            title: 'Listar Tabelas',
            description: 'Retorna todas as tabelas do banco de dados com suas colunas e tipos.',
            body: null,
            response: `{
  "tables": [
    {
      "table": "users",
      "columns": [
        { "name": "id", "type": "INTEGER", "pk": true },
        { "name": "nick", "type": "TEXT" },
        ...
      ]
    }
  ]
}`
        },
        {
            method: 'GET',
            path: '/api/mobile/table/:name',
            title: 'Dados de uma Tabela',
            description: 'Retorna os dados de uma tabela específica com paginação.',
            params: 'limit=50, offset=0, order=id, dir=ASC',
            body: null,
            response: `{
  "table": "users",
  "total": 150,
  "limit": 50,
  "offset": 0,
  "data": [ ... ]
}`
        },
        {
            method: 'POST',
            path: '/api/mobile/query',
            title: 'Consulta SQL (Leitura)',
            description: 'Executa queries SELECT, PRAGMA ou WITH no banco. Ideal para consultas personalizadas.',
            body: `{
  "sql": "SELECT * FROM users WHERE role = ? LIMIT ?",
  "params": ["admin", 10]
}`,
            response: `{
  "data": [ ... ],
  "count": 10
}`
        },
        {
            method: 'POST',
            path: '/api/mobile/execute',
            title: 'Execução SQL (Escrita)',
            description: 'Executa INSERT, UPDATE ou DELETE. Retorna o número de linhas afetadas.',
            body: `{
  "sql": "INSERT INTO minha_tabela (titulo, valor) VALUES (?, ?)",
  "params": ["Teste", 42]
}`,
            response: `{
  "success": true,
  "changes": 1,
  "lastID": 5
}`
        },
        {
            method: 'POST',
            path: '/api/mobile/create-table',
            title: 'Criar Tabela',
            description: 'Cria uma nova tabela no banco de dados.',
            body: `{
  "name": "minha_tabela",
  "columns": [
    { "name": "id", "type": "INTEGER PRIMARY KEY AUTOINCREMENT" },
    { "name": "titulo", "type": "TEXT NOT NULL" },
    { "name": "valor", "type": "REAL DEFAULT 0" },
    { "name": "created_at", "type": "DATETIME DEFAULT CURRENT_TIMESTAMP" }
  ]
}`,
            response: `{
  "success": true,
  "message": "Tabela \\"minha_tabela\\" criada/verificada com sucesso."
}`
        },
        {
            method: 'POST',
            path: '/api/mobile/drop-table',
            title: 'Deletar Tabela',
            description: 'Deleta uma tabela inteira. Tabelas do sistema são protegidas e não podem ser deletadas.',
            body: `{
  "name": "minha_tabela",
  "confirm": true
}`,
            response: `{
  "success": true,
  "message": "Tabela \\"minha_tabela\\" deletada."
}`
        }
    ];

    const getMethodColor = (method) => {
        switch (method) {
            case 'GET': return '#4caf50';
            case 'POST': return '#2196f3';
            case 'DELETE': return '#f44336';
            case 'PATCH': return '#ff9800';
            default: return '#888';
        }
    };

    return (
        <div className="api-docs-page">
            <div className="api-docs-container">

                {/* Header */}
                <div className="api-docs-header">
                    <Link to="/" className="api-docs-back"><ArrowLeft size={18} /> Voltar</Link>
                    <div className="api-docs-title-wrap">
                        <BookOpen size={36} />
                        <div>
                            <h1>API Mobile - Documentação</h1>
                            <p>Acesso completo ao banco de dados via HTTP/REST</p>
                        </div>
                    </div>
                </div>

                {/* Quick Info */}
                <div className="api-docs-info-cards">
                    <div className="api-info-card">
                        <Shield size={24} />
                        <div>
                            <h3>Autenticação</h3>
                            <p>Envie sua API Key no header <code style={{ wordBreak: 'break-all' }}>x-api-key</code> em toda requisição.</p>
                        </div>
                    </div>
                    <div className="api-info-card">
                        <Database size={24} />
                        <div>
                            <h3>Base URL</h3>
                            <p><code style={{ wordBreak: 'break-all' }}>{baseUrl}/api/mobile</code></p>
                        </div>
                    </div>
                    <div className="api-info-card">
                        <Code size={24} />
                        <div>
                            <h3>Content-Type</h3>
                            <p>Todas as requisições POST devem usar <code style={{ wordBreak: 'break-all' }}>application/json</code></p>
                        </div>
                    </div>
                </div>

                {/* Quick Start */}
                <div className="api-docs-section">
                    <h2><Terminal size={22} /> Início Rápido</h2>
                    <div className="api-code-block">
                        <div className="code-block-header">Exemplo com cURL</div>
                        <pre><code>{`curl -X POST ${baseUrl}/api/mobile/query \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: SUA_API_KEY_AQUI" \\
  -d '{"sql": "SELECT * FROM users LIMIT 5"}'`}</code></pre>
                    </div>

                    <div className="api-code-block">
                        <div className="code-block-header">Exemplo com JavaScript (Fetch)</div>
                        <pre><code>{`const response = await fetch('${baseUrl}/api/mobile/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'SUA_API_KEY_AQUI'
  },
  body: JSON.stringify({
    sql: 'SELECT * FROM users LIMIT 5'
  })
});

const data = await response.json();
console.log(data);`}</code></pre>
                    </div>
                </div>

                {/* Integração e Autenticação */}
                <div className="api-docs-section">
                    <h2><BookOpen size={22} /> API Embed (Iframe)</h2>
                    <p style={{color: '#aaa', marginBottom: '1.5rem', lineHeight: '1.6'}}>
                        Você também pode usar a nossa estrutura para incorporar vídeos diretamente no navegador usando iframes com os IDs do TMDB.
                    </p>

                    <div className="api-endpoint-card">
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#4caf50' }}>GET</span>
                            <code className="api-path">/embed/filme/{"{tmdb_id}"}</code>
                        </div>
                        <h3>Incorporar Filme</h3>
                        <p>Retorna um player de vídeo pronto com o filme correspondente.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Exemplo Iframe HTML</div>
                            <pre><code>{`<iframe src="${baseUrl}/embed/filme/550" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#4caf50' }}>GET</span>
                            <code className="api-path">/embed/serie/{"{tmdb_id}"}/{"{temporada}"}/{"{episodio}"}</code>
                        </div>
                        <h3>Incorporar Episódio (Série)</h3>
                        <p>Retorna um player de vídeo para a temporada e episódio específicos.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Exemplo Iframe HTML</div>
                            <pre><code>{`<iframe src="${baseUrl}/embed/serie/1399/1/1" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <h3>Planos Premium (API Key)</h3>
                        <p style={{color: '#aaa', lineHeight: '1.6'}}>
                            Para remover os anúncios do player (Pop-unders) para seus clientes VIP, basta adicionar o parâmetro <code>apikey=SUA_CHAVE</code> na URL do iframe. <br/>
                            Exemplo: <code>{baseUrl}/embed/filme/550?apikey=SUA_CHAVE</code>
                        </p>
                    </div>
                </div>

                {/* Integração App Mobile (Nativo) */}
                <div className="api-docs-section">
                    <h2><Smartphone size={22} /> Integração App Mobile (Player Nativo)</h2>
                    <p style={{color: '#aaa', marginBottom: '1.5rem', lineHeight: '1.6'}}>
                        Instruções para desenvolvedores criarem aplicativos nativos (Android/iOS) consumindo nossos vídeos e sincronizando o histórico de onde o usuário parou (Continue Assistindo).
                    </p>

                    <div className="api-endpoint-card">
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#4caf50' }}>GET</span>
                            <code className="api-path">/api/stream/s/{"{token}"}.mp4</code>
                        </div>
                        <h3>Rodar o Vídeo no Player Nativo (ExoPlayer, AVPlayer, etc)</h3>
                        <p>
                            Para assistir aos vídeos, <strong>não</strong> é necessário se conectar diretamente ao Telegram.
                            <br/><br/>
                            A nossa API (ex: <code>/api/bot/search</code>) já retorna uma propriedade chamada <code>stream_url</code> pronta para uso. Basta colocar esse <code>stream_url</code> diretamente na propriedade "source" do seu Player Nativo de vídeo.
                            <br/><br/>
                            <strong>Sobre a Segurança (IP Lock):</strong><br/>
                            Para evitar pirataria, os links da versão Web são travados no IP do usuário final. Porém, quando você utiliza as rotas da API oficial para Bots e Apps, o token retornado é marcado com uma permissão especial (<code>app: true</code>) que desativa a checagem de IP, permitindo que seus usuários móveis assistam aos vídeos sem bloqueios, não importando a rede em que estejam!
                        </p>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/recents</code>
                        </div>
                        <h3>Salvar Progresso (Continue Assistindo)</h3>
                        <p>Para o App ficar sincronizado com o Site, sempre que o usuário pausar o vídeo ou a cada X segundos, envie o tempo atual (em segundos) para salvar no banco de dados.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Exemplo Request (JSON)</div>
                            <pre><code>{`{
  "tmdb_id": "550",
  "type": "filme",
  "title": "Clube da Luta",
  "poster_path": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
  "progress_time": 3500, // Segundos assistidos
  "duration": 7200,      // Duração total
  // Se for série, adicione:
  "season": 1,
  "episode": 3
}`}</code></pre>
                        </div>
                    </div>
                </div>

                {/* Integração com Bots */}
                <div className="api-docs-section">
                    <h2><Terminal size={22} /> Integração com Bots (WhatsApp / Telegram)</h2>
                    <p style={{color: '#aaa', marginBottom: '1.5rem', lineHeight: '1.6'}}>
                        Use esta rota para conectar seus bots (Baileys, Telegraf, etc). Você envia o nome do filme e nossa API busca no banco de dados e no TMDB para retornar o arquivo exato ou o link direto. Requer <code>apikey</code> na URL.
                    </p>

                    <div className="api-endpoint-card">
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#4caf50' }}>GET</span>
                            <code className="api-path">/api/bot/search?q={"{nome}"}&apikey={"{sua_chave}"}</code>
                        </div>
                        <h3>Buscar Filme / Série</h3>
                        <p>Retorna se o filme/série existe, o ID do Telegram (para encaminhamento nativo) e o Link Direto de Download (para WhatsApp). <br/>
                        <strong>Busca de Episódio Específico:</strong> Você pode pesquisar o nome da série junto com a temporada e episódio para obter o arquivo exato (Ex: <code>?q=Demon Slayer S02E03</code>, <code>T02E03</code>, <code>2x03</code>, ou <code>Ep 5</code>). A API filtrará a série e retornará o arquivo correspondente.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Exemplo de Resposta (Encontrado)</div>
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
                        <div className="api-code-block small" style={{marginTop: '10px'}}>
                            <div className="code-block-header">Exemplo de Resposta (Não Encontrado)</div>
                            <pre><code>{`{
  "found": false,
  "title": "Vingadores (2012)",
  "type": "filme",
  "telegram_message_id": null,
  "direct_download_url": null,
  "site_url": "${baseUrl}/filme/os-vingadores-the-avengers"
}`}</code></pre>
                        </div>
                    </div>
                </div>

                {/* Integração e Autenticação API Mobile */}
                <div className="api-docs-section">
                    <h2><Shield size={22} /> Integração Híbrida: Autenticação e Analytics</h2>
                    <p style={{color: '#aaa', marginBottom: '1.5rem', lineHeight: '1.6'}}>
                        Para garantir o correto funcionamento da criptografia de senhas e a sincronização do seu App Móvel com as estatísticas em tempo real do site, <strong>NÃO</strong> use consultas SQL brutas (<code>/execute</code>) para login ou para registrar acessos. Utilize as rotas oficiais abaixo:
                    </p>

                    <div className="api-endpoint-card">
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/auth/login</code>
                        </div>
                        <h3>Login de Usuário</h3>
                        <p>Autentica o usuário validando a criptografia bcrypt e retorna o token JWT e dados do perfil.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Body (JSON)</div>
                            <pre><code>{`{
  "email": "user@email.com",
  "password": "senha123"
}`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/auth/register</code>
                        </div>
                        <h3>Cadastro de Usuário</h3>
                        <p>Cria um usuário criptografando a senha corretamente no padrão do site.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Body (JSON)</div>
                            <pre><code>{`{
  "nick": "Geek",
  "email": "user@email.com",
  "password": "senha123"
}`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/analytics/pageview</code>
                        </div>
                        <h3>Registrar Visualização (Acessos)</h3>
                        <p>Soma uma visualização nas métricas do site. Para não cair no filtro anti-bot, garanta que o App envie o cabeçalho <code>Accept-Language</code>.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Body (JSON)</div>
                            <pre><code>{`{
  "page": "/filme/matrix",
  "contentId": 123
}`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/admin/heartbeat</code>
                        </div>
                        <h3>Ping de Usuários Online</h3>
                        <p>Chame essa rota a cada 10/15 segundos para que os usuários do seu App apareçam como "Online" no painel Admin do site.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Body (JSON)</div>
                            <pre><code>{`{
  "page": "Navegando no App",
  "title": "Home"
}`}</code></pre>
                        </div>
                    </div>
                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/profile/upload-avatar</code>
                        </div>
                        <h3>Upload de Foto de Perfil</h3>
                        <p>Para envio de arquivos de imagem, <strong>não use</strong> o endpoint <code>/execute</code>. Recebe o arquivo binário (via FormData), salva na pasta do servidor e atualiza o banco de dados automaticamente.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Exemplo FormData (JavaScript)</div>
                            <pre><code>{`const form = new FormData();
form.append('avatar', imageFile);
form.append('userId', 1);

const resp = await fetch('\${baseUrl}/api/profile/upload-avatar', {
  method: 'POST',
  body: form
});`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#ff9800' }}>PUT</span>
                            <code className="api-path">/api/profile/update-nick</code>
                        </div>
                        <h3>Mudar Nome de Usuário (Nick)</h3>
                        <p>Atualiza o nick do usuário de forma segura. <strong>Atenção:</strong> Há uma trava de segurança no backend que permite mudanças apenas 1x a cada 30 dias por usuário. Em caso de bloqueio, retorna código 400.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Body (JSON)</div>
                            <pre><code>{`{
  "userId": 1,
  "newNick": "CariocaBolado"
}`}</code></pre>
                        </div>
                    </div>
                </div>

                {/* Endpoints API Mobile */}
                <div className="api-docs-section">
                    <h2><Database size={22} /> Endpoints de Acesso SQL Direto</h2>

                    
                    {endpoints.map((ep, idx) => (
                        <div key={idx} className="api-endpoint-card">
                            <div className="api-endpoint-header">
                                <span className="api-method" style={{ background: getMethodColor(ep.method) }}>{ep.method}</span>
                                <code className="api-path">{ep.path}</code>
                            </div>
                            <h3>{ep.title}</h3>
                            <p>{ep.description}</p>
                            {ep.params && (
                                <div className="api-params">
                                    <strong>Query Params:</strong> <code>{ep.params}</code>
                                </div>
                            )}
                            {ep.body && (
                                <div className="api-code-block small">
                                    <div className="code-block-header">Body (JSON)</div>
                                    <pre><code>{ep.body}</code></pre>
                                </div>
                            )}
                            <div className="api-code-block small response">
                                <div className="code-block-header">Resposta</div>
                                <pre><code>{ep.response}</code></pre>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Integração App Nativo */}
                <div className="api-docs-section">
                    <h2><BookOpen size={22} /> Integração para App (Player Nativo)</h2>
                    <p>Ao invés de carregar um Iframe pesado no aplicativo móvel, o App pode solicitar o link puro do vídeo (.mp4/.mkv) e usar um Player Nativo (ExoPlayer/AVPlayer) para máxima performance, economia de bateria e suporte a PiP (Picture-in-Picture).</p>
                    
                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#4caf50' }}>GET</span>
                            <code className="api-path">/api/embed/search?q=:titulo</code>
                        </div>
                        <h3>1. Encontrar o messageId (Mapeamento)</h3>
                        <p>O <code>messageId</code> não é salvo nas tabelas de TMDB, ele fica na tabela de sincronização com o Telegram (<code>sync_queue</code>). Para o App achar o ID de um filme ou episódio, basta buscar pelo nome exato gerado (ex: "Homem-Aranha (2021) FHD Dublado" ou "The Boys S01 E01 HD").</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Exemplo de Requisição Pública</div>
                            <pre><code>{`// GET /api/embed/search?q=Homem-Aranha
{
  "items": [
    {
      "id": 12,
      "title": "Homem-Aranha (2021) FHD Dublado",
      "telegram_message_id": 84512,
      "status": "completed"
    }
  ]
}`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#4caf50' }}>GET</span>
                            <code className="api-path">/api/stream/:messageId</code>
                        </div>
                        <h3>2. Obter Link Direto do Vídeo</h3>
                        <p>Com o <code>telegram_message_id</code> em mãos, chame esta rota. Ela retornará o stream binário direto.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Exemplo de Uso no App (Kotlin/Swift)</div>
                            <pre><code>{`// 3. Pegar a URL blindada que já vem pronta na resposta da API
String playerUrl = movieData.getString("stream_url");

// 4. Passar para o ExoPlayer
MediaItem mediaItem = MediaItem.fromUri(playerUrl);
exoPlayer.prepare();`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/mobile/execute</code>
                        </div>
                        <h3>3. Sincronizar Progresso (Continuar Assistindo)</h3>
                        <p>Para o App manter sincronia com o site, ele deve salvar o tempo assistido (em segundos) na tabela <code>watch_history</code>. Utilize o endpoint de Acesso SQL Direto para isso.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Body (JSON) para Salvar Tempo (Ex: 145 segundos)</div>
                            <pre><code>{`{
  "sql": "INSERT OR REPLACE INTO watch_history (user_id, content_id, media_type, title, season, episode, resume_time, watched_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
  "params": [1, "12345", "filme", "Homem-Aranha", null, null, 145]
}`}</code></pre>
                        </div>
                    </div>

                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/mobile/query</code>
                        </div>
                        <h3>4. Puxar Progresso ao Abrir Filme</h3>
                        <p>Antes de reproduzir, o App deve consultar a tabela <code>watch_history</code> para saber de onde continuar (<code>resume_time</code>).</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Body (JSON) para Resgatar Tempo</div>
                            <pre><code>{`{
  "sql": "SELECT resume_time FROM watch_history WHERE user_id = ? AND content_id = ?",
  "params": [1, "12345"]
}`}</code></pre>
                        </div>
                    </div>
                </div>

                {/* Atualização OTA */}
                <div className="api-docs-section">
                    <h2><Smartphone size={22} /> Atualizações OTA (Over-The-Air)</h2>
                    <p>Ao invés de depender de lojas de aplicativos, o próprio app pode se atualizar baixando o <code>.apk</code> mais recente servido pela API.</p>
                    
                    <div className="api-endpoint-card" style={{ marginTop: '1.5rem' }}>
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#4caf50' }}>GET</span>
                            <code className="api-path">/api/app-updates/latest</code>
                        </div>
                        <h3>Checar Nova Versão Disponível</h3>
                        <p>O aplicativo deve bater nesta rota sempre que abrir (Tela de Splash). Se o <code>version_code</code> retornado for maior que o instalado, mostre um pop-up pedindo para o usuário baixar a nova versão usando o <code>download_url</code>.</p>
                        <div className="api-code-block small response">
                            <div className="code-block-header">Exemplo de Resposta (JSON)</div>
                            <pre><code>{`{
  "available": true,
  "version_name": "1.0.5",
  "version_code": 5,
  "release_notes": "Correções e melhorias de performance.",
  "force_update": false,
  "download_url": "${baseUrl}/downloads/app/cinegeek-v1.0.5.apk"
}`}</code></pre>
                        </div>
                    </div>
                </div>

                {/* Errors */}
                <div className="api-docs-section">
                    <h2><Shield size={22} /> Códigos de Erro</h2>
                    <div className="admin-table-wrap">
                        <table className="admin-table api-table">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Significado</th>
                                    <th>Causa Comum</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr><td><code>401</code></td><td>Não Autorizado</td><td>API Key ausente ou inválida</td></tr>
                                <tr><td><code>400</code></td><td>Requisição Inválida</td><td>Campos obrigatórios faltando</td></tr>
                                <tr><td><code>403</code></td><td>Proibido</td><td>Operação não permitida (ex: SELECT no /execute)</td></tr>
                                <tr><td><code>404</code></td><td>Não Encontrado</td><td>Tabela não existe</td></tr>
                                <tr><td><code>500</code></td><td>Erro Interno</td><td>Erro de SQL ou servidor</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Protected Tables */}
                <div className="api-docs-section">
                    <h2><Shield size={22} /> Tabelas Protegidas</h2>
                    <p style={{color: '#aaa'}}>As seguintes tabelas <strong>não podem ser deletadas</strong> pela API (via /drop-table), mas podem ser lidas e escritas normalmente:</p>
                    <div className="protected-tables-grid">
                        {['users', 'comments', 'reactions', 'reports', 'favorites', 'configs', 'page_views', 'live_sessions', 'api_keys', 'watch_history', 'watched_episodes'].map(t => (
                            <span key={t} className="protected-table-tag">{t}</span>
                        ))}
                    </div>
                </div>

                <div className="api-docs-footer">
                    <p>As API Keys são gerenciadas pelo administrador no <strong>Painel Administrativo</strong>.</p>
                </div>
            </div>
        </div>
    );
}
