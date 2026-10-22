import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';
const APP_HMAC_SECRET = process.env.APP_HMAC_SECRET || 'cg_mob_sec_99a8f27e61b44c8da09d85421';

// Armazena nonces usados recentemente na memória para prevenir ataques de replay
const usedNonces = new Map(); // nonce -> timestamp
setInterval(() => {
    const now = Date.now();
    for (const [nonce, ts] of usedNonces.entries()) {
        if (now - ts > 120000) { // Limpa nonces com mais de 2 minutos
            usedNonces.delete(nonce);
        }
    }
}, 60000);

export default function mobileRoutes(db) {

    // ============================================================
    //  🛡️ POST /session — Handshake Seguro de Inicialização do App
    // ============================================================
    // O app envia timestamp, nonce, device_id e uma assinatura HMAC-SHA256.
    // O backend valida a janela de tempo e a integridade antes de emitir um Token de Sessão JWT.
    router.post('/session', async (req, res) => {
        try {
            const { timestamp, nonce, device_id, signature, app_version, signature_hash } = req.body;

            if (!timestamp || !nonce || !device_id || !signature) {
                return res.status(400).json({ error: 'Parâmetros incompletos para handshake de segurança.' });
            }

            const now = Date.now();
            const reqTime = parseInt(timestamp, 10);

            // 1. Janela de tempo de 60 segundos (previne ataques de repetição)
            if (isNaN(reqTime) || Math.abs(now - reqTime) > 60000) {
                return res.status(401).json({ error: 'Handshake expirado ou relógio dessincronizado. Ajuste o horário do aparelho.' });
            }

            // 2. Prevenção de Replay (Nonce único)
            if (usedNonces.has(nonce)) {
                return res.status(401).json({ error: 'Requisição duplicada (replay attack detectado).' });
            }
            usedNonces.set(nonce, now);

            // 3. Validação da Assinatura HMAC-SHA256
            // A assinatura esperada é: HMAC_SHA256(APP_HMAC_SECRET, `${device_id}:${timestamp}:${nonce}`)
            const expectedSignature = crypto
                .createHmac('sha256', APP_HMAC_SECRET)
                .update(`${device_id}:${timestamp}:${nonce}`)
                .digest('hex');

            if (signature.toLowerCase() !== expectedSignature.toLowerCase()) {
                console.warn(`[SEGURANÇA] Tentativa de handshake com assinatura HMAC inválida do device: ${device_id}`);
                return res.status(403).json({ error: 'Assinatura criptográfica do aplicativo inválida ou corrompida.' });
            }

            // 4. Validação da Impressão Digital do APK (se houver APK oficial cadastrado com signature_hash)
            if (signature_hash) {
                const latestApk = await db.get(`SELECT signature_hash FROM app_updates WHERE signature_hash IS NOT NULL ORDER BY version_code DESC, id DESC LIMIT 1`);
                if (latestApk && latestApk.signature_hash) {
                    const cleanExpected = latestApk.signature_hash.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    const cleanReceived = signature_hash.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    if (cleanExpected !== cleanReceived) {
                        console.warn(`[SEGURANÇA] Bloqueio de APK Modificado! Hash recebido: ${cleanReceived} != Esperado: ${cleanExpected}`);
                        return res.status(403).json({ error: 'APK não oficial ou modificado. Baixe a versão oficial no site.' });
                    }
                }
            }

            // 4. Emissão de Token de Sessão Efêmero (duração de 12 horas)
            const sessionToken = jwt.sign(
                {
                    device_id,
                    type: 'mobile_session',
                    app_version: app_version || '1.0.0',
                    sig_hash: signature_hash || null
                },
                JWT_SECRET,
                { expiresIn: '12h' }
            );

            res.json({
                success: true,
                session_token: sessionToken,
                expires_in: 43200, // 12h em segundos
                issued_at: new Date().toISOString()
            });
        } catch (err) {
            console.error('Erro no handshake mobile:', err);
            res.status(500).json({ error: 'Erro interno no handshake de segurança.' });
        }
    });

    // Middleware de autenticação: aceita tanto o novo Token de Sessão Seguro (ou JWT do usuário)
    // quanto mantém compatibilidade com x-api-key durante a fase de transição
    async function authMobile(req, res, next) {
        // 1. Verifica se foi enviado Bearer token (Token de Sessão Seguro do App ou JWT de Usuário)
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace(/^Bearer\s+/i, '').trim();
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                req.sessionInfo = decoded;
                return next();
            } catch (err) {
                // Se falhou o JWT, tenta verificar se era uma API Key passada no Bearer (compatibilidade)
            }
        }

        // 2. Verifica se foi enviado Session Token via header dedicado x-session-token
        const sessionHeader = req.headers['x-session-token'];
        if (sessionHeader) {
            try {
                const decoded = jwt.verify(sessionHeader, JWT_SECRET);
                req.sessionInfo = decoded;
                return next();
            } catch (err) {
                return res.status(401).json({ error: 'Sessão expirada. Realize novo handshake em /api/mobile/session.' });
            }
        }

        // 3. Fallback: API Key tradicional (x-api-key ou query)
        const key = req.headers['x-api-key'] ||
                    req.headers['x-apikey'] ||
                    req.query.apikey ||
                    req.query.apiKey ||
                    req.query.api_key;

        if (key) {
            try {
                const apiKey = await db.get(
                    "SELECT * FROM api_keys WHERE key = ? AND (active = 1 OR active IS NULL)", [key]
                );

                if (apiKey) {
                    await db.run("UPDATE api_keys SET usage_count = COALESCE(usage_count, 0) + 1, last_used = datetime('now') WHERE id = ?", [apiKey.id]);
                    req.apiKeyInfo = apiKey;
                    return next();
                }
            } catch (err) {
                console.error("Erro ao validar API Key na rota mobile:", err);
            }
        }

        return res.status(401).json({ 
            error: 'Não autorizado. Envie o token de sessão seguro (Authorization: Bearer <session_token>) obtido em /api/mobile/session ou x-api-key.' 
        });
    }

    // Aplica autenticação em TODAS as rotas seguintes
    router.use(authMobile);

    // ============================================================
    //  📋 GET /tables — Lista tabelas públicas/permitidas do banco
    // ============================================================
    router.get('/tables', async (req, res) => {
        try {
            const forbiddenTables = ['users', 'api_keys', 'configs', 'system_settings', 'live_sessions', 'sessions'];
            const tables = await db.all(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            );
            
            const result = [];
            for (const t of tables) {
                if (forbiddenTables.includes(t.name.toLowerCase())) continue;
                const columns = await db.all(`PRAGMA table_info("${t.name}")`);
                result.push({
                    table: t.name,
                    columns: columns.map(c => ({
                        name: c.name,
                        type: c.type,
                        notnull: c.notnull === 1,
                        pk: c.pk === 1,
                        default: c.dflt_value
                    }))
                });
            }

            res.json({ tables: result });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    //  🔍 POST /query — Executa SELECT (somente leitura)
    //  Body: { sql: "SELECT * FROM users WHERE id = ?", params: [1] }
    // ============================================================
    router.post('/query', async (req, res) => {
        const { sql, params = [] } = req.body;

        if (!sql) {
            return res.status(400).json({ error: 'Campo "sql" é obrigatório.' });
        }

        const trimmed = sql.trim().toUpperCase();
        if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('PRAGMA') && !trimmed.startsWith('WITH')) {
            return res.status(403).json({ error: 'Rota /query só permite SELECT, PRAGMA e WITH. Use /execute para escrita.' });
        }

        // SEGURANÇA MÁXIMA: Bloqueia leitura de tabelas sensíveis via SQL direto
        const forbiddenTables = ['USERS', 'API_KEYS', 'CONFIGS', 'SYSTEM_SETTINGS', 'LIVE_SESSIONS', 'SESSIONS'];
        for (const t of forbiddenTables) {
            // Regex para capturar nome da tabela como palavra isolada ou entre aspas
            const regex = new RegExp(`(\\b|["'\`])${t}(\\b|["'\`])`, 'i');
            if (regex.test(sql)) {
                return res.status(403).json({ 
                    error: `Acesso negado: A tabela "${t.toLowerCase()}" contém credenciais confidenciais e é estritamente protegida contra consultas SQL diretas. Utilize as rotas dedicadas de autenticação e perfil.` 
                });
            }
        }

        try {
            const rows = await db.all(sql, params);
            res.json({ data: rows, count: rows.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    //  ✏️ POST /execute — Executa INSERT, UPDATE, DELETE
    //  Body: { sql: "INSERT INTO watch_history (...) VALUES (?, ?)", params: [...] }
    // ============================================================
    router.post('/execute', async (req, res) => {
        const { sql, params = [] } = req.body;

        if (!sql) {
            return res.status(400).json({ error: 'Campo "sql" é obrigatório.' });
        }

        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith('SELECT')) {
            return res.status(403).json({ error: 'Use /query para SELECT. Esta rota é para INSERT/UPDATE/DELETE.' });
        }

        if (trimmed.includes('DROP DATABASE') || trimmed.includes('DETACH') || trimmed.includes('ATTACH')) {
            return res.status(403).json({ error: 'Operação bloqueada por segurança.' });
        }

        // SEGURANÇA MÁXIMA: Bloqueia alteração de tabelas de credenciais/sistema
        const forbiddenTables = ['USERS', 'API_KEYS', 'CONFIGS', 'SYSTEM_SETTINGS', 'LIVE_SESSIONS', 'SESSIONS'];
        for (const t of forbiddenTables) {
            const regex = new RegExp(`(\\b|["'\`])${t}(\\b|["'\`])`, 'i');
            if (regex.test(sql)) {
                return res.status(403).json({ 
                    error: `Acesso negado: Modificação na tabela "${t.toLowerCase()}" bloqueada pela API mobile por razões de segurança.` 
                });
            }
        }

        try {
            const result = await db.run(sql, params);
            res.json({
                success: true,
                changes: result.changes,
                lastID: result.lastID
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    //  🏗️ POST /create-table — Cria uma tabela nova
    // ============================================================
    router.post('/create-table', async (req, res) => {
        const { name, columns } = req.body;

        if (!name || !columns || !Array.isArray(columns) || columns.length === 0) {
            return res.status(400).json({ error: 'Campos "name" e "columns" (array) são obrigatórios.' });
        }

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            return res.status(400).json({ error: 'Nome da tabela inválido. Use apenas letras, números e underscore.' });
        }

        try {
            const colDefs = columns.map(c => `${c.name} ${c.type}`).join(', ');
            const sql = `CREATE TABLE IF NOT EXISTS "${name}" (${colDefs})`;
            await db.exec(sql);
            res.json({ success: true, message: `Tabela "${name}" criada/verificada com sucesso.`, sql });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    //  📊 GET /table/:name — Retorna dados de uma tabela com paginação
    // ============================================================
    router.get('/table/:name', async (req, res) => {
        const { name } = req.params;
        const { limit = 50, offset = 0, order = 'rowid', dir = 'ASC' } = req.query;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            return res.status(400).json({ error: 'Nome da tabela inválido.' });
        }

        const forbiddenTables = ['users', 'api_keys', 'configs', 'system_settings', 'live_sessions', 'sessions'];
        if (forbiddenTables.includes(name.toLowerCase())) {
            return res.status(403).json({ error: `Acesso negado: A tabela "${name}" é restrita e protegida.` });
        }

        const direction = dir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        try {
            const exists = await db.get(
                "SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name]
            );
            if (!exists) {
                return res.status(404).json({ error: `Tabela "${name}" não encontrada.` });
            }

            const countResult = await db.get(`SELECT COUNT(*) as total FROM "${name}"`);
            const rows = await db.all(
                `SELECT * FROM "${name}" ORDER BY ${order} ${direction} LIMIT ? OFFSET ?`,
                [parseInt(limit), parseInt(offset)]
            );

            res.json({
                table: name,
                total: countResult.total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                data: rows
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    //  🗑️ POST /drop-table — Deleta uma tabela inteira (CUIDADO!)
    // ============================================================
    router.post('/drop-table', async (req, res) => {
        const { name, confirm } = req.body;

        if (!name || confirm !== true) {
            return res.status(400).json({ error: 'Envie { name: "tabela", confirm: true } para confirmar.' });
        }

        const protectedTables = ['users', 'comments', 'reactions', 'reports', 'favorites', 'configs', 'page_views', 'live_sessions', 'api_keys'];
        if (protectedTables.includes(name.toLowerCase())) {
            return res.status(403).json({ error: `Tabela "${name}" é protegida e não pode ser deletada pela API mobile.` });
        }

        try {
            await db.exec(`DROP TABLE IF EXISTS "${name}"`);
            res.json({ success: true, message: `Tabela "${name}" deletada.` });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
