import express from 'express';
import { initSyncWorker, startWorker, setPauseState } from '../services/syncWorker.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function syncRoutes(db, io) {
    const router = express.Router();
    
    // Inicializa o worker singleton
    initSyncWorker(db, io);

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

            // Responde imediatamente
            res.json({ message: 'Varredura concluída', totalFound: movies.length });
        } catch (err) {
            console.error("Erro no scan:", err);
            res.status(500).json({ error: 'Erro interno ao processar arquivo M3U.' });
        }
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
            const limit = 50;
            const offset = (page - 1) * limit;

            const filter = req.query.filter || 'all';

            let queryCondition = '';
            let params = [];

            if (filter !== 'all') {
                queryCondition = 'WHERE status = ?';
                params.push(filter);
            }

            params.push(limit, offset);

            const rows = await db.all(`SELECT id, title, status, file_size, created_at, telegram_message_id, error_message FROM sync_queue ${queryCondition} ORDER BY updated_at DESC LIMIT ? OFFSET ?`, ...params);
            const total = await db.get(`SELECT COUNT(*) as count FROM sync_queue`);
            const pending = await db.get(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`);
            const completed = await db.get(`SELECT COUNT(*) as count FROM sync_queue WHERE status = 'completed'`);

            res.json({
                items: rows,
                total: total.count,
                pending: pending.count,
                completed: completed.count,
                page,
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

    return router;
}
