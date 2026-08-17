import express from 'express';
import { initSyncWorker, startWorker, setPauseState } from '../services/syncWorker.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';
import multer from 'multer';
import os from 'os';
import https from 'https';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function syncRoutes(db, io) {
    const router = express.Router();
    
    // Inicializa o worker singleton
    initSyncWorker(db, io);
    
    // Inicia automaticamente o worker assim que o servidor ligar
    startWorker();

    // Configuração do Multer para Upload Manual (Chunks)
    const upload = multer({ 
        dest: path.join(os.tmpdir(), 'manual_uploads'), 
        limits: { fileSize: 150 * 1024 * 1024 } // 150MB limit per chunk just in case
    });

    // Rota para receber um pedaço do arquivo
    router.post('/manual-upload/chunk', upload.single('chunk'), async (req, res) => {
        try {
            const { fileName, chunkIndex } = req.body;
            if (!req.file || !fileName) return res.status(400).json({ error: 'Faltam dados do chunk.' });
            
            const tempDir = path.join(os.tmpdir(), 'manual_uploads_chunks');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
            
            const filePath = path.join(tempDir, fileName);
            const chunkData = fs.readFileSync(req.file.path);
            
            // Faz o append do chunk (Frontend deve mandar um por vez)
            fs.appendFileSync(filePath, chunkData);
            
            // Limpa o temp do multer
            try { fs.unlinkSync(req.file.path); } catch(e){}
            
            res.json({ success: true, message: `Chunk ${chunkIndex} recebido.` });
        } catch (err) {
            console.error("Erro no chunk:", err);
            res.status(500).json({ error: 'Erro ao processar chunk.' });
        }
    });

    // Rota para finalizar e mover para a fila
    router.post('/manual-upload/finalize', async (req, res) => {
        try {
            const { fileName, title, originalExt, totalSize } = req.body;
            if (!fileName || !title) return res.status(400).json({ error: 'Faltam dados.' });
            
            const tempDir = path.join(os.tmpdir(), 'manual_uploads_chunks');
            const sourceFilePath = path.join(tempDir, fileName);
            
            if (!fs.existsSync(sourceFilePath)) return res.status(400).json({ error: 'Arquivo temporário não encontrado.' });
            
            const fakeUrl = `local://manual-upload-${Date.now()}.${originalExt}`;
            const actualSize = totalSize || fs.statSync(sourceFilePath).size;
            
            // 1. Insere no DB para pegar o ID com prioridade máxima (999) para furar a fila
            const result = await db.run(
                "INSERT INTO sync_queue (title, url, status, file_size, priority) VALUES (?, ?, 'pending_upload', ?, 999)",
                [title, fakeUrl, actualSize]
            );
            const dbId = result.lastID;
            
            // 2. Renomeia e move para o tmp com o formato esperado pelo worker
            const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const finalTmpPath = path.join(os.tmpdir(), `${safeTitle}_${dbId}.${originalExt}`);
            
            // Move o arquivo pro destino final
            fs.renameSync(sourceFilePath, finalTmpPath);
            
            res.json({ success: true, message: 'Upload manual enviado para a fila!', id: dbId });
        } catch (err) {
            console.error("Erro ao finalizar upload:", err);
            res.status(500).json({ error: 'Erro interno ao finalizar upload.' });
        }
    });

    // Rota para exportar catálogo
    router.get('/export', async (req, res) => {
        try {
            const rows = await db.all(`SELECT id, title, status, url, file_size, telegram_message_id, created_at, updated_at FROM sync_queue ORDER BY id ASC`);
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename="zoroflix_catalog.json"');
            res.send(JSON.stringify(rows, null, 2));
        } catch (err) {
            console.error("Erro export:", err);
            res.status(500).json({ error: 'Erro ao exportar banco' });
        }
    });

    // Rota para tentar erros novamente em massa
    router.post('/retry-errors', async (req, res) => {
        try {
            await db.run("UPDATE sync_queue SET status = 'pending', error_message = NULL WHERE status = 'error'");
            res.json({ success: true });
        } catch (err) {
            console.error("Erro retry:", err);
            res.status(500).json({ error: 'Erro ao reprocessar' });
        }
    });

    // Pular / Ignorar item com defeito
    router.put('/queue/:id/skip', async (req, res) => {
        try {
            const { id } = req.params;
            await db.run("UPDATE sync_queue SET status = 'skipped', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
            res.json({ success: true });
        } catch (err) {
            console.error("Erro skip:", err);
            res.status(500).json({ error: 'Erro ao pular item' });
        }
    });

    // Rota para limpar todos os pendentes (Limpar Fila)
    router.delete('/queue/pending/clear', async (req, res) => {
        try {
            await db.run("DELETE FROM sync_queue WHERE status = 'pending'");
            res.json({ success: true });
        } catch (err) {
            console.error("Erro clear pending:", err);
            res.status(500).json({ error: 'Erro ao limpar pendentes' });
        }
    });

    // Rota para remover pendentes duplicados
    router.delete('/queue/pending/cleanup_duplicates', async (req, res) => {
        try {
            // Primeiro, limpa títulos sujos no banco (ex: títulos importados pelo remap que vieram com caption do Telegram)
            // Remove markdown bold (**) e sufixos "Upload via..." de TODOS os títulos completed
            await db.run(`
                UPDATE sync_queue SET title = REPLACE(REPLACE(REPLACE(REPLACE(TRIM(title), 
                    '**', ''), 
                    CHAR(10) || 'Upload via Zoroflix Sync (Hybrid Worker)', ''),
                    CHAR(10) || 'Upload via Zoroflix Bot (Python Turbo)', ''),
                    CHAR(10) || 'Upload via Zoroflix Bot', '')
                WHERE status = 'completed' AND (
                    title LIKE '%**%' OR 
                    title LIKE '%Upload via Zoroflix%'
                )
            `);

            // Agora compara os títulos limpos normalmente
            const result = await db.run("DELETE FROM sync_queue WHERE status = 'pending' AND TRIM(title) IN (SELECT TRIM(title) FROM sync_queue WHERE status = 'completed')");
            res.json({ success: true, removed: result.changes });
        } catch (err) {
            console.error("Erro cleanup duplicates:", err);
            res.status(500).json({ error: 'Erro ao limpar duplicados' });
        }
    });

    // Helper para limpar nomes sujos importados do M3U
    const cleanM3UTitle = (title) => {
        if (!title) return '';
        let cleaned = title.trim();
        if (cleaned.includes('tvg-logo=') || cleaned.includes('group-title=')) {
            const idx = cleaned.indexOf('",');
            if (idx !== -1) {
                cleaned = cleaned.substring(idx + 2).trim();
            } else {
                const parts = cleaned.split(',');
                cleaned = parts[parts.length - 1].trim();
            }
        }
        return cleaned;
    };

    // Nova Rota para Corrigir Títulos Sujos no DB (Painel Admin)
    router.post('/queue/clean-m3u-titles', async (req, res) => {
        try {
            const rows = await db.all("SELECT id, title FROM sync_queue WHERE title LIKE '%tvg-logo=%' OR title LIKE '%group-title=%'");
            let count = 0;
            
            for (const r of rows) {
                const newTitle = cleanM3UTitle(r.title);
                if (newTitle !== r.title && newTitle.length > 0) {
                    await db.run('UPDATE sync_queue SET title = ? WHERE id = ?', [newTitle, r.id]);
                    count++;
                }
            }
            res.json({ success: true, updated: count, message: `Foram corrigidos ${count} títulos sujos.` });
        } catch (err) {
            console.error("Erro clean-m3u-titles:", err);
            res.status(500).json({ error: 'Erro ao limpar títulos no banco.' });
        }
    });

    // Rota para iniciar varredura do M3U
    router.post('/scan', async (req, res) => {
        try {
            const m3uPath = path.join(__dirname, '..', '..', 'iptv_list.m3u');
            if (!fs.existsSync(m3uPath)) {
                return res.status(404).json({ error: 'FALHA: Coloque o arquivo iptv_list.m3u na raiz do projeto (mesma pasta do package.json)' });
            }

            const movies = [];
            const fileStream = fs.createReadStream(m3uPath, 'utf-8');
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });

            let currentTitle = null;

            for await (const line of rl) {
                const trimmed = line.trim();
                if (trimmed.startsWith('#EXTINF')) {
                    const match = trimmed.match(/,(.+)/);
                    if (match) {
                        currentTitle = cleanM3UTitle(match[1]);
                    }
                } else if (trimmed.startsWith('http') && currentTitle) {
                    movies.push({ title: currentTitle, url: trimmed });
                    currentTitle = null;
                }
            } // Fechar for await loop

            // Inicia o processo de inserção em lote
            let insertedCount = 0;
            
            try {
                for (const movie of movies) {
                    const ext = movie.url.split('?')[0].split('.').pop().toLowerCase();
                    if (ext !== 'mp4' && ext !== 'mkv') continue; // Filtro de extensão
                    
                    const res = await db.run(
                        "INSERT INTO sync_queue (title, url, status, priority) SELECT ?, ?, 'pending', 1 WHERE NOT EXISTS (SELECT 1 FROM sync_queue WHERE url = ?) AND NOT EXISTS (SELECT 1 FROM sync_queue WHERE title = ?)",
                        [movie.title, movie.url, movie.url, movie.title]
                    );
                    if (res.changes > 0) insertedCount++;
                }
            } catch (insertErr) {
                console.error("Erro na inserção em lote:", insertErr);
                throw insertErr;
            }

            // Responde imediatamente
            res.json({ message: 'Varredura e indexação concluída', totalFound: movies.length, inserted: insertedCount });
        } catch (err) {
            console.error("Erro no scan:", err);
            res.status(500).json({ error: 'Erro interno ao processar arquivo M3U.' });
        }
    });

    // Nova Rota para puxar M3U remotamente
    router.post('/fetch-remote-m3u', async (req, res) => {
        const { m3uUrl } = req.body;
        
        if (!m3uUrl) {
            return res.status(400).json({ error: 'URL do M3U não fornecida.' });
        }

        let movies = [];
        let currentTitle = null;

        https.get(m3uUrl, (response) => {
            if (response.statusCode !== 200) {
                return res.status(500).json({ error: 'Erro ao baixar o M3U. Código HTTP: ' + response.statusCode });
            }

            const rl = readline.createInterface({
                input: response,
                crlfDelay: Infinity
            });

            rl.on('line', (line) => {
                const trimmed = line.trim();
                if (trimmed.startsWith('#EXTINF')) {
                    const match = trimmed.match(/,(.+)/);
                    if (match) {
                        currentTitle = cleanM3UTitle(match[1]);
                    }
                } else if (trimmed.startsWith('http') && currentTitle) {
                    movies.push({ title: currentTitle, url: trimmed });
                    currentTitle = null;
                }
            });

            rl.on('close', async () => {
                try {
                    let insertedCount = 0;
                    for (const movie of movies) {
                        // Não filtramos extensão aqui pois a lista M3U usa .ts que funciona bem, apenas garantimos inserção
                        const result = await db.run(
                            "INSERT INTO sync_queue (title, url, status, priority) SELECT ?, ?, 'pending', 1 WHERE NOT EXISTS (SELECT 1 FROM sync_queue WHERE url = ?) AND NOT EXISTS (SELECT 1 FROM sync_queue WHERE title = ?)",
                            [movie.title, movie.url, movie.url, movie.title]
                        );
                        if (result.changes > 0) insertedCount++;
                    }
                    res.json({ message: 'Sincronização remota concluída', totalFound: movies.length, inserted: insertedCount });
                } catch (dbErr) {
                    console.error("Erro ao salvar no banco:", dbErr);
                    res.status(500).json({ error: 'Erro ao salvar no banco de dados.' });
                }
            });
        }).on('error', (err) => {
            console.error("Erro no download M3U:", err);
            res.status(500).json({ error: 'Erro na requisição da URL M3U.' });
        });
    });

    // Rota para pausar a fila
    router.post('/pause', (req, res) => {
        setPauseState(true);
        res.json({ message: 'Worker pausado' });
    });

    // Rota para retomar a fila
    router.post('/resume', (req, res) => {
        setPauseState(false);
        res.json({ message: 'Worker retomado' });
    });

    // Rota para buscar os dados atuais da fila (dashboard de histórico)
    router.get('/queue', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            const filter = req.query.filter || 'all';
            const search = req.query.search || '';
            const sortSize = req.query.sortSize || ''; // pode ser 'asc' ou 'desc'

            let queryCondition = 'WHERE 1=1';
            let params = [];

            if (filter !== 'all') {
                if (filter === 'pending') {
                    queryCondition += " AND status IN ('pending', 'pending_upload')";
                } else if (filter === 'prioritized') {
                    queryCondition += " AND priority > 0";
                } else if (filter === 'new_today') {
                    queryCondition += " AND DATE(created_at, '-3 hours') = DATE('now', '-3 hours')";
                } else {
                    queryCondition += ' AND status = ?';
                    params.push(filter);
                }
            }

            if (search) {
                if (!isNaN(search)) {
                    queryCondition += ' AND (id = ? OR title LIKE ?)';
                    params.push(search, `%${search}%`);
                } else {
                    queryCondition += ' AND title LIKE ?';
                    params.push(`%${search}%`);
                }
            }

            let orderBy = 'ORDER BY priority DESC, updated_at DESC';
            if (sortSize === 'asc') orderBy = 'ORDER BY priority DESC, file_size ASC';
            if (sortSize === 'desc') orderBy = 'ORDER BY priority DESC, file_size DESC';

            const rows = await db.all(`SELECT id, title, status, file_size, created_at, telegram_message_id, error_message, priority FROM sync_queue ${queryCondition} ${orderBy} LIMIT ? OFFSET ?`, ...params, limit, offset);
            const total = await db.get(`SELECT COUNT(*) as count FROM sync_queue`);
            const pending = await db.get(`SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'pending_upload', 'downloading', 'uploading')`);
            const completed = await db.get(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'completed'`);
            const skipped = await db.get(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'skipped'`);
            const error = await db.get(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'error'`);
            
            // Novos Dashboards
            const totalSizeRow = await db.get(`SELECT SUM(file_size) as total_size FROM sync_queue WHERE status = 'completed'`);
            const completedTodayRow = await db.get(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'completed' AND DATE(updated_at, '-3 hours') = DATE('now', '-3 hours')`);
            const addedTodayRow = await db.get(`SELECT COUNT(*) as count FROM sync_queue WHERE DATE(created_at, '-3 hours') = DATE('now', '-3 hours')`);

            res.json({
                items: rows,
                total: total.count,
                pending: pending.count,
                completed: completed.count,
                skipped: skipped.count,
                error_count: error.count,
                total_size_saved: totalSizeRow.total_size || 0,
                completed_today: completedTodayRow.count || 0,
                added_today: addedTodayRow.count || 0,
                page,
                limit,
                totalPages: Math.ceil(total.count / limit)
            });
        } catch (err) {
            console.error("Erro interno no /queue:", err);
            res.status(500).json({ error: 'Erro ao buscar fila: ' + err.message });
        }
    });

    // Deleta da fila
    router.delete('/queue/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const item = await db.get("SELECT * FROM sync_queue WHERE id = ?", [id]);
            if (!item) return res.status(404).json({ error: 'Não encontrado' });
            
            if (item.telegram_message_id) {
                // Tenta apagar do telegram
                const scriptPath = path.join(process.cwd(), 'backend', 'scripts', 'telegramManage.py');
                const py = spawn('python3', [scriptPath, 'delete', item.telegram_message_id.toString()]);
                py.stdout.on('data', data => console.log(data.toString()));
                py.stderr.on('data', data => console.error(data.toString()));
            }

            await db.run("DELETE FROM sync_queue WHERE id = ?", [id]);
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao remover' });
        }
    });

    // Refazer Download (Reseta o item)
    router.post('/queue/:id/retry', async (req, res) => {
        try {
            const { id } = req.params;
            const item = await db.get("SELECT * FROM sync_queue WHERE id = ?", [id]);
            if (!item) return res.status(404).json({ error: 'Não encontrado' });
            
            if (item.telegram_message_id) {
                // Tenta apagar do telegram
                const scriptPath = path.join(process.cwd(), 'backend', 'scripts', 'telegramManage.py');
                const py = spawn('python3', [scriptPath, 'delete', item.telegram_message_id.toString()]);
                py.stdout.on('data', data => console.log(data.toString()));
                py.stderr.on('data', data => console.error(data.toString()));
            }

            // Reseta o status para pending e limpa os dados de conclusão
            await db.run("UPDATE sync_queue SET status = 'pending', telegram_message_id = NULL, file_size = 0, error_message = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
            res.json({ success: true });
        } catch (err) {
            console.error("Erro refazer download:", err);
            res.status(500).json({ error: 'Erro ao refazer download' });
        }
    });

    // Edita o título do item
    router.put('/queue/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { title } = req.body;
            
            if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

            const item = await db.get("SELECT * FROM sync_queue WHERE id = ?", [id]);
            if (!item) return res.status(404).json({ error: 'Não encontrado' });
            
            if (item.telegram_message_id) {
                // Tenta editar no telegram
                const scriptPath = path.join(process.cwd(), 'backend', 'scripts', 'telegramManage.py');
                const py = spawn('python3', [scriptPath, 'edit', item.telegram_message_id.toString(), title]);
                py.stdout.on('data', data => console.log(data.toString()));
                py.stderr.on('data', data => console.error(data.toString()));
            }

            await db.run("UPDATE sync_queue SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [title, id]);
            res.json({ success: true, title });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao editar' });
        }
    });

    // Rota para Priorizar em Lote
    router.post('/queue/prioritize-batch', async (req, res) => {
        try {
            const { filter, search } = req.body;
            let queryCondition = "WHERE status NOT IN ('completed', 'downloading', 'uploading')";
            let params = [];

            if (filter && filter !== 'all') {
                if (filter === 'pending') {
                    queryCondition += " AND status IN ('pending', 'pending_upload')";
                } else {
                    queryCondition += ' AND status = ?';
                    params.push(filter);
                }
            }

            if (search) {
                if (!isNaN(search)) {
                    queryCondition += ' AND (id = ? OR title LIKE ?)';
                    params.push(search, `%${search}%`);
                } else {
                    queryCondition += ' AND title LIKE ?';
                    params.push(`%${search}%`);
                }
            }

            const result = await db.run(`UPDATE sync_queue SET priority = 1, updated_at = CURRENT_TIMESTAMP ${queryCondition}`, params);
            res.json({ success: true, updated: result.changes });
        } catch (err) {
            console.error("Erro prioritize-batch:", err);
            res.status(500).json({ error: 'Erro ao priorizar em lote' });
        }
    });

    // Rota para Limpar Prioridades
    router.post('/queue/clear-priorities', async (req, res) => {
        try {
            const result = await db.run("UPDATE sync_queue SET priority = 0 WHERE priority > 0");
            res.json({ success: true, updated: result.changes });
        } catch (err) {
            console.error("Erro clear-priorities:", err);
            res.status(500).json({ error: 'Erro ao limpar prioridades' });
        }
    });

    // Rota para Priorizar ("Furar Fila") um item
    router.post('/queue/:id/prioritize', async (req, res) => {
        try {
            // Aumenta a prioridade para o topo
            await db.run("UPDATE sync_queue SET priority = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
            res.json({ success: true, message: 'Filme movido para o topo da fila de downloads!' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao priorizar item' });
        }
    });

    // ==========================================
    // AUTO-PRIORITIZE: Prioriza itens baseado na demanda do usuário no front-end
    // ==========================================
    const autoPrioritizeCache = new Map(); // Para evitar spam do mesmo título
    
    router.post('/auto-prioritize', async (req, res) => {
        try {
            const { title, media_type } = req.body;
            if (!title) return res.json({ prioritized: 0 });

            // Debounce: Evita processar o mesmo título a cada clique se múltiplos usuários acessarem
            const cacheKey = title.toLowerCase();
            const now = Date.now();
            if (autoPrioritizeCache.has(cacheKey) && (now - autoPrioritizeCache.get(cacheKey) < 60000)) { // 60 segundos
                return res.json({ prioritized: 0, cached: true });
            }
            autoPrioritizeCache.set(cacheKey, now);

            // Tenta dar match parcial na fila de pendentes e com priority = 0
            const result = await db.run(`
                UPDATE sync_queue 
                SET priority = 1, updated_at = CURRENT_TIMESTAMP 
                WHERE status = 'pending' AND priority = 0 
                AND title LIKE '%' || ? || '%'
            `, [title]);

            if (result.changes > 0) {
                console.log(`[Auto-Prioritize] 🔥 Demanda alta detectada! Priorizados ${result.changes} itens para: "${title}"`);
            }

            res.json({ prioritized: result.changes });
        } catch (err) {
            console.error('[Auto-Prioritize] Erro:', err);
            // Sempre retorna 200 pra não quebrar o frontend silencioso
            res.json({ prioritized: 0, error: err.message });
        }
    });

    // ==========================================
    // LIMPAR DUPLICADOS DO TELEGRAM: Apaga vídeos duplicados do canal mantendo o mais recente
    // ==========================================
    router.post('/cleanup-telegram-duplicates', async (req, res) => {
        const apiId = parseInt(process.env.TELEGRAM_API_ID);
        const apiHash = process.env.TELEGRAM_API_HASH;
        const sessionStr = process.env.TELEGRAM_SESSION;
        const channelId = process.env.TELEGRAM_CHANNEL_ID;

        if (!apiId || !apiHash || !sessionStr || !channelId) {
            return res.status(400).json({ error: 'Variáveis de ambiente do Telegram não configuradas.' });
        }

        try {
            // Primeiro normaliza títulos sujos (mesma lógica do cleanup_duplicates)
            await db.run(`
                UPDATE sync_queue SET title = REPLACE(REPLACE(REPLACE(REPLACE(TRIM(title), 
                    '**', ''), 
                    CHAR(10) || 'Upload via Zoroflix Sync (Hybrid Worker)', ''),
                    CHAR(10) || 'Upload via Zoroflix Bot (Python Turbo)', ''),
                    CHAR(10) || 'Upload via Zoroflix Bot', '')
                WHERE status = 'completed' AND (
                    title LIKE '%**%' OR 
                    title LIKE '%Upload via Zoroflix%'
                )
            `);

            // Busca títulos duplicados com status completed que possuem telegram_message_id
            const duplicates = await db.all(`
                SELECT title, COUNT(*) as cnt 
                FROM sync_queue 
                WHERE status = 'completed' AND telegram_message_id IS NOT NULL 
                GROUP BY TRIM(title) 
                HAVING cnt > 1
            `);

            if (duplicates.length === 0) {
                return res.json({ success: true, deleted: 0, message: 'Nenhum duplicado encontrado no canal.' });
            }

            // Para cada título duplicado, pega todos os IDs e mantém apenas o com maior telegram_message_id
            let idsToDelete = []; // { dbId, telegramMsgId }
            for (const dup of duplicates) {
                const entries = await db.all(
                    `SELECT id, telegram_message_id FROM sync_queue 
                     WHERE TRIM(title) = TRIM(?) AND status = 'completed' AND telegram_message_id IS NOT NULL 
                     ORDER BY telegram_message_id DESC`,
                    [dup.title]
                );
                // Mantém o primeiro (maior message_id = mais recente), deleta os demais
                for (let i = 1; i < entries.length; i++) {
                    idsToDelete.push({ dbId: entries[i].id, telegramMsgId: entries[i].telegram_message_id });
                }
            }

            if (idsToDelete.length === 0) {
                return res.json({ success: true, deleted: 0, message: 'Nenhum duplicado para remover.' });
            }

            res.json({ success: true, deleting: idsToDelete.length, message: `Apagando ${idsToDelete.length} vídeos duplicados do Telegram em background...` });

            // Executa a deleção em background
            (async () => {
                let client;
                try {
                    console.log(`[CleanupTG] 🔌 Conectando ao Telegram para apagar ${idsToDelete.length} duplicados...`);
                    const stringSession = new StringSession(sessionStr);
                    client = new TelegramClient(stringSession, apiId, apiHash, {
                        connectionRetries: 5,
                    });
                    client.setLogLevel('none');
                    await client.connect();

                    try { await client.getDialogs({}); } catch (e) {}

                    let entityId = channelId;
                    if (channelId.startsWith('-100')) {
                        entityId = channelId.replace('-100', '');
                    }

                    let resolvedEntity;
                    try {
                        resolvedEntity = await client.getInputEntity(entityId);
                    } catch (e) {
                        resolvedEntity = entityId;
                    }

                    let deletedCount = 0;
                    // Deleta em lotes de 100 (limite do Telegram)
                    const batchSize = 100;
                    for (let i = 0; i < idsToDelete.length; i += batchSize) {
                        const batch = idsToDelete.slice(i, i + batchSize);
                        const msgIds = batch.map(b => b.telegramMsgId);
                        
                        try {
                            await client.deleteMessages(resolvedEntity, msgIds, { revoke: true });
                            
                            // Remove do banco de dados
                            for (const item of batch) {
                                await db.run('DELETE FROM sync_queue WHERE id = ?', [item.dbId]);
                            }
                            
                            deletedCount += batch.length;
                            console.log(`[CleanupTG] 🗑️ Lote deletado: ${deletedCount}/${idsToDelete.length}`);
                        } catch (e) {
                            console.error(`[CleanupTG] ❌ Erro ao deletar lote:`, e.message);
                        }
                    }

                    console.log(`[CleanupTG] ✅ CONCLUÍDO! ${deletedCount} vídeos duplicados removidos do Telegram e do banco.`);
                } catch (err) {
                    console.error('[CleanupTG] ❌ Erro durante limpeza:', err);
                } finally {
                    if (client) {
                        try { await client.disconnect(); } catch (e) {}
                    }
                }
            })();
        } catch (err) {
            console.error('[CleanupTG] Erro:', err);
            res.status(500).json({ error: 'Erro ao iniciar limpeza de duplicados do Telegram.' });
        }
    });

    // ==========================================
    // REMAPEAMENTO: Lê o canal do Telegram e recria as entradas no sync_queue
    // ==========================================
    router.post('/remap-telegram', async (req, res) => {
        const apiId = parseInt(process.env.TELEGRAM_API_ID);
        const apiHash = process.env.TELEGRAM_API_HASH;
        const sessionStr = process.env.TELEGRAM_SESSION;
        const channelId = process.env.TELEGRAM_CHANNEL_ID;

        if (!apiId || !apiHash || !sessionStr || !channelId) {
            return res.status(400).json({ error: 'Variáveis de ambiente do Telegram não configuradas.' });
        }

        try {
            res.json({ success: true, message: 'Remapeamento iniciado em background. Acompanhe o log do servidor.' });

            // Executa em background para não travar a resposta HTTP
            (async () => {
                let client;
                try {
                    console.log('[Remap] 🔌 Conectando ao Telegram...');
                    const stringSession = new StringSession(sessionStr);
                    client = new TelegramClient(stringSession, apiId, apiHash, {
                        connectionRetries: 5,
                    });
                    client.setLogLevel('none');
                    await client.connect();

                    // Carrega os diálogos para resolver a entidade do canal
                    try { await client.getDialogs({}); } catch (e) {}

                    let entityId = channelId;
                    if (channelId.startsWith('-100')) {
                        entityId = channelId.replace('-100', '');
                    }

                    let resolvedEntity;
                    try {
                        resolvedEntity = await client.getInputEntity(entityId);
                    } catch (e) {
                        resolvedEntity = entityId;
                    }

                    console.log('[Remap] 📡 Lendo mensagens do canal...');
                    let totalFound = 0;
                    let totalInserted = 0;
                    let totalSkipped = 0;
                    let offsetId = 0;
                    const batchSize = 100;

                    while (true) {
                        const fetchOpts = { limit: batchSize };
                        if (offsetId > 0) fetchOpts.offsetId = offsetId;
                        
                        const messages = await client.getMessages(resolvedEntity, fetchOpts);

                        if (!messages || messages.length === 0) break;

                        for (const msg of messages) {
                            // Só nos interessam mensagens que contêm vídeo/documento de vídeo
                            if (!msg.media) continue;
                            const isVideo = msg.media.className === 'MessageMediaDocument' || msg.media.className === 'MessageMediaVideo';
                            if (!isVideo) continue;

                            const messageId = msg.id;
                            const caption = msg.message || '';
                            // Limpa o título: remove markdown bold (**) e o sufixo "Upload via..." que os scripts Python adicionavam
                            let title = caption.trim() || `Video_${messageId}`;
                            title = title.replace(/\*\*/g, '').replace(/\nUpload via Zoroflix Sync \(Hybrid Worker\)/gi, '').replace(/\nUpload via Zoroflix Bot \(Python Turbo\)/gi, '').replace(/\nUpload via Zoroflix Bot/gi, '').trim();

                            // Limpa sujeira de M3U se tiver
                            if (title.includes('tvg-logo=') || title.includes('group-title=')) {
                                const idx = title.indexOf('",');
                                if (idx !== -1) {
                                    title = title.substring(idx + 2).trim();
                                } else {
                                    const parts = title.split(',');
                                    title = parts[parts.length - 1].trim();
                                }
                            }

                            // Extrair tamanho do arquivo
                            let fileSize = 0;
                            try {
                                if (msg.media.document) {
                                    fileSize = Number(msg.media.document.size) || 0;
                                }
                            } catch (e) {}

                            totalFound++;

                            // Verifica se já existe no banco por telegram_message_id
                            const existing = await db.get(
                                'SELECT id FROM sync_queue WHERE telegram_message_id = ?',
                                [messageId]
                            );

                            if (existing) {
                                totalSkipped++;
                                continue;
                            }

                            // Insere no banco com status completed e remove pendentes antigos com mesmo título
                            try {
                                await db.run(
                                    `DELETE FROM sync_queue WHERE title = ? AND status = 'pending'`,
                                    [title]
                                );
                                await db.run(
                                    `INSERT INTO sync_queue (title, url, status, file_size, telegram_message_id, created_at, updated_at)
                                     VALUES (?, ?, 'completed', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                                    [title, `telegram://msg/${messageId}`, fileSize, messageId]
                                );
                                totalInserted++;
                            } catch (e) {
                                // UNIQUE constraint (url duplicada) - pula
                                totalSkipped++;
                            }
                        }

                        // Avança para o próximo lote
                        offsetId = messages[messages.length - 1].id;
                        console.log(`[Remap] 📦 Processado lote... Total encontrados: ${totalFound} | Inseridos: ${totalInserted} | Já existiam: ${totalSkipped}`);
                    }

                    console.log(`[Remap] ✅ REMAPEAMENTO CONCLUÍDO! ${totalFound} vídeos encontrados no canal. ${totalInserted} inseridos no banco. ${totalSkipped} já existiam.`);
                } catch (err) {
                    console.error('[Remap] ❌ Erro durante remapeamento:', err);
                } finally {
                    if (client) {
                        try { await client.disconnect(); } catch (e) {}
                    }
                }
            })();
        } catch (err) {
            console.error('[Remap] Erro:', err);
            res.status(500).json({ error: 'Erro ao iniciar remapeamento.' });
        }
    });

    return router;
}
