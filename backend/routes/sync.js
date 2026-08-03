import express from 'express';
import { initSyncWorker, startWorker, setPauseState, addMoviesToQueue } from '../services/syncWorker.js';
import fs from 'fs';
import path from 'path';
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

            // Passamos os parâmetros separadamente em vez de array, por segurança em versões antigas
            const rows = await db.all(`SELECT id, title, status, file_size, created_at, error_message FROM sync_queue ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset);
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

    // Rota para deletar item do histórico (para forçar re-download)
    router.delete('/queue/:id', async (req, res) => {
        try {
            await db.run("DELETE FROM sync_queue WHERE id = ?", [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao deletar item' });
        }
    });

    return router;
}
