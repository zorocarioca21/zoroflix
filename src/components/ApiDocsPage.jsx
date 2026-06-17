import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Shield, Database, Code, Terminal, ArrowLeft } from 'lucide-react';

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
                            <p>Envie sua API Key no header <code>x-api-key</code> em toda requisição.</p>
                        </div>
                    </div>
                    <div className="api-info-card">
                        <Database size={24} />
                        <div>
                            <h3>Base URL</h3>
                            <p><code>{baseUrl}/api/mobile</code></p>
                        </div>
                    </div>
                    <div className="api-info-card">
                        <Code size={24} />
                        <div>
                            <h3>Content-Type</h3>
                            <p>Todas as requisições POST devem usar <code>application/json</code></p>
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

                {/* Endpoints */}
                <div className="api-docs-section">
                    <h2><Database size={22} /> Endpoints</h2>
                    
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
                        {['users', 'comments', 'reactions', 'reports', 'favorites', 'configs', 'page_views', 'live_sessions', 'api_keys'].map(t => (
                            <span key={t} className="protected-table-tag">{t}</span>
                        ))}
                    </div>
                </div>

                {/* Hybrid Endpoints */}
                <div className="api-docs-section">
                    <h2><Terminal size={22} /> Integração Híbrida (Upload de Imagens)</h2>
                    <p style={{color: '#aaa', marginBottom: '1rem'}}>
                        Para envio de arquivos (como fotos de perfil), <strong>não use</strong> o endpoint <code>/execute</code>. Em vez disso, faça uma requisição <strong>multipart/form-data</strong> diretamente para a mesma rota pública usada pelo site.
                    </p>
                    <div className="api-endpoint-card">
                        <div className="api-endpoint-header">
                            <span className="api-method" style={{ background: '#2196f3' }}>POST</span>
                            <code className="api-path">/api/profile/upload-avatar</code>
                        </div>
                        <h3>Upload de Foto de Perfil</h3>
                        <p>Recebe o arquivo de imagem binário (via FormData), salva na pasta do servidor e atualiza o banco de dados automaticamente.</p>
                        <div className="api-code-block small">
                            <div className="code-block-header">Exemplo FormData (JavaScript)</div>
                            <pre><code>{`const form = new FormData();
form.append('avatar', imageFile);
form.append('userId', 1);

const resp = await fetch('${baseUrl}/api/profile/upload-avatar', {
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

                <div className="api-docs-footer">
                    <p>As API Keys são gerenciadas pelo administrador no <strong>Painel Administrativo</strong>.</p>
                </div>
            </div>
        </div>
    );
}
