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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function syncRoutes(db, io) {
    const router = express.Router();
    
    // Inicializa o worker singleton
    initSyncWorker(db, io);
    
    // Inicia automaticamente o worker assim que o servidor ligar
    startWorker();

    // Configuração do Multer para Upload Manual
    const upload = multer({ 
        dest: path.join(os.tmpdir(), 'manual_uploads'), 
        limits: { fileSize: 20 * 1024 * 1024 * 1024 } // 20GB limit
    });

    // Rota de Upload Manual
    router.post('/manual-upload', upload.single('video'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
            
            const title = req.body.title || 'Upload Manual Sem Título';
            const originalExt = req.file.originalname.split('.').pop() || 'mp4';
            const fakeUrl = `local://manual-upload.${originalExt}`;
            
            // 1. Insere no DB para pegar o ID
            const result = await db.run(
                "INSERT INTO sync_queue (title, url, status, file_size) VALUES (?, ?, 'pending_upload', ?)",
                [title, fakeUrl, req.file.size]
            );
            const dbId = result.lastID;
            
            // 2. Renomeia e move para o tmp com o formato esperado pelo worker
            const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const finalTmpPath = path.join(os.tmpdir(), `${safeTitle}_${dbId}.${originalExt}`);
            
            // Cria diretório de destino do multer se não existir
            if (!fs.existsSync(path.dirname(req.file.path))) {
                fs.mkdirSync(path.dirname(req.file.path), { recursive: true });
            }
            
            // Move o arquivo pro destino final
            fs.renameSync(req.file.path, finalTmpPath);
            
            res.json({ success: true, message: 'Upload manual enviado para a fila!', id: dbId });
        } catch (err) {
            console.error("Erro no manual-upload:", err);
            if (req.file && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch(e){}
            }
            res.status(500).json({ error: 'Erro interno no upload.' });
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
                        currentTitle = match[1].trim();
                    }
                } else if (trimmed.startsWith('http') && currentTitle) {
                    movies.push({ title: currentTitle, url: trimmed });
                    currentTitle = null;
                }
            } // Fechar for await loop

            // Inicia o processo de inserção em lote
            await db.run("BEGIN TRANSACTION");
            let insertedCount = 0;
            
            try {
                for (const movie of movies) {
                    const ext = movie.url.split('?')[0].split('.').pop().toLowerCase();
                    if (ext !== 'mp4' && ext !== 'mkv') continue; // Filtro de extensão
                    
                    const res = await db.run(
                        "INSERT INTO sync_queue (title, url, status) SELECT ?, ?, 'pending' WHERE NOT EXISTS (SELECT 1 FROM sync_queue WHERE url = ?)",
                        [movie.title, movie.url, movie.url]
                    );
                    if (res.changes > 0) insertedCount++;
                }
                await db.run("COMMIT");
            } catch (insertErr) {
                await db.run("ROLLBACK");
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
        let insertedCount = 0;

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
                        currentTitle = match[1].trim();
                    }
                } else if (trimmed.startsWith('http') && currentTitle) {
                    movies.push({ title: currentTitle, url: trimmed });
                    currentTitle = null;
                }
            });

            rl.on('close', async () => {
                try {
                    await db.run("BEGIN TRANSACTION");
                    for (const movie of movies) {
                        // Não filtramos extensão aqui pois a lista M3U usa .ts que funciona bem, apenas garantimos inserção
                        const result = await db.run(
                            "INSERT INTO sync_queue (title, url, status) SELECT ?, ?, 'pending' WHERE NOT EXISTS (SELECT 1 FROM sync_queue WHERE url = ?)",
                            [movie.title, movie.url, movie.url]
                        );
                        if (result.changes > 0) insertedCount++;
                    }
                    await db.run("COMMIT");
                    res.json({ message: 'Sincronização remota concluída', totalFound: movies.length, inserted: insertedCount });
                } catch (dbErr) {
                    await db.run("ROLLBACK");
                    console.error("Erro no banco:", dbErr);
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

            res.json({
                items: rows,
                total: total.count,
                pending: pending.count,
                completed: completed.count,
                skipped: skipped.count,
                error_count: error.count,
                total_size_saved: totalSizeRow.total_size || 0,
                completed_today: completedTodayRow.count || 0,
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

    return router;
}
