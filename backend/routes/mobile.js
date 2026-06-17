import express from 'express';

const router = express.Router();

export default function mobileRoutes(db) {

    // Middleware de autenticação por API Key (valida contra o banco)
    async function authApiKey(req, res, next) {
        const key = req.headers['x-api-key'];
        if (!key) {
            return res.status(401).json({ error: 'Header x-api-key é obrigatório.' });
        }

        try {
            const apiKey = await db.get(
                "SELECT * FROM api_keys WHERE key = ? AND active = 1", [key]
            );

            if (!apiKey) {
                return res.status(401).json({ error: 'API Key inválida ou desativada.' });
            }

            // Atualiza o last_used
            await db.run("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?", [apiKey.id]);

            // Salva no request pra uso posterior
            req.apiKeyInfo = apiKey;
            next();
        } catch (err) {
            return res.status(500).json({ error: 'Erro ao validar API Key.' });
        }
    }

    // Aplica autenticação em TODAS as rotas
    router.use(authApiKey);

    // ============================================================
    //  📋 GET /tables — Lista todas as tabelas do banco
    // ============================================================
    router.get('/tables', async (req, res) => {
        try {
            const tables = await db.all(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            );
            
            const result = [];
            for (const t of tables) {
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

        try {
            const rows = await db.all(sql, params);
            res.json({ data: rows, count: rows.length });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // ============================================================
    //  ✏️ POST /execute — Executa INSERT, UPDATE, DELETE
    //  Body: { sql: "INSERT INTO users (nick, email) VALUES (?, ?)", params: ["Zoro", "z@z.com"] }
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

        if (trimmed.includes('DROP DATABASE') || trimmed.includes('DETACH')) {
            return res.status(403).json({ error: 'Operação bloqueada por segurança.' });
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
