import express from 'express';
import { initSyncWorker, startWorker, setPauseState, addMoviesToQueue } from '../services/syncWorker.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
                return res.status(404).json({ error: 'Arquivo iptv_list.m3u não encontrado na raiz do projeto.' });
            }

            const content = fs.readFileSync(m3uPath, 'utf-8');
            const lines = content.split('\n');
            const movies = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('#EXTINF')) {
                    const match = line.match(/,(.+)/);
                    if (match) {
                        const title = match[1].trim();
                        if (i + 1 < lines.length) {
                            const url = lines[i + 1].trim();
                            if (url.startsWith('http')) {
                                movies.push({ title, url });
                            }
                        }
                    }
                }
            }

            const addedCount = await addMoviesToQueue(movies);
            res.json({ message: 'Varredura concluída', totalFound: movies.length, newAdded: addedCount });

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

            const rows = await db.all(`SELECT id, title, status, file_size, created_at, error_message FROM sync_queue ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset]);
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
            res.status(500).json({ error: 'Erro ao buscar fila' });
        }
    });

    return router;
}
