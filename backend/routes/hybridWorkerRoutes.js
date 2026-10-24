import express from 'express';
import { getTelegramClient } from '../telegram.js';

export default function hybridWorkerRoutes(db, io) {
    const router = express.Router();
    
    // Middleware de autenticação básica para o worker remoto
    const authMiddleware = (req, res, next) => {
        const apiKey = req.headers['x-api-key'];
        // Em um sistema real, validaríamos essa chave com o banco ou .env
        if (!apiKey) {
            return res.status(401).json({ error: 'Missing API Key' });
        }
        next();
    };

    router.use(authMiddleware);

    // Estado remoto global (para a VPS saber o que os remotos estão fazendo)
    const remoteWorkersState = {};

    function broadcastRemoteStates() {
        // Envia para o frontend a lista de tarefas remotas ativas
        io.emit('hybrid_worker_state', remoteWorkersState);
    }

    // 1. Checkout de Tarefa de Download
    router.post('/checkout', async (req, res) => {
        try {
            const { workerId } = req.body;
            
            // Busca o próximo pendente
            const item = await db.get("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY priority DESC, id ASC LIMIT 1");
            
            if (!item) {
                return res.json({ task: null, message: 'Nenhuma tarefa pendente.' });
            }

            // Tenta dar o 'lock' no banco. Só afeta se ainda for pending.
            const updateRes = await db.run("UPDATE sync_queue SET status = 'downloading_remote', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'", [item.id]);
            
            if (updateRes.changes > 0) {
                remoteWorkersState[workerId] = {
                    id: item.id,
                    title: item.title,
                    status: 'Baixando',
                    progress: 0
                };
                broadcastRemoteStates();
                return res.json({ task: item });
            } else {
                // Alguém pegou antes (VPS ou outro worker)
                return res.json({ task: null, message: 'Conflito, tente novamente.' });
            }

        } catch (err) {
            console.error('Erro no checkout híbrido:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 1.5. Checkout de Upload (Retorna a taskId de maior prioridade dentre os arquivos locais baixados)
    router.post('/checkout-upload', async (req, res) => {
        try {
            const { taskIds } = req.body;
            if (!Array.isArray(taskIds) || taskIds.length === 0) {
                return res.json({ taskId: null });
            }

            const placeholders = taskIds.map(() => '?').join(',');
            const item = await db.get(
                `SELECT id, priority FROM sync_queue WHERE id IN (${placeholders}) ORDER BY priority DESC, id ASC LIMIT 1`,
                taskIds
            );

            return res.json({ taskId: item ? item.id : taskIds[0] });
        } catch (err) {
            console.error('Erro no checkout-upload:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 2. Reportar Progresso
    router.post('/progress', (req, res) => {
        const { workerId, taskId, status, progress } = req.body;
        if (remoteWorkersState[workerId] && remoteWorkersState[workerId].id === taskId) {
            remoteWorkersState[workerId].status = status;
            remoteWorkersState[workerId].progress = progress;
            broadcastRemoteStates();
        }
        res.json({ success: true });
    });

    // 3. Concluir Tarefa
    router.post('/complete', async (req, res) => {
        const { workerId, taskId, telegram_message_id, file_size } = req.body;
        
        try {
            if (file_size && file_size < 5242880) {
                console.warn(`[Hybrid Complete] ⚠️ Rejeitado complete para Task ${taskId}: Tamanho ${file_size} bytes é menor que 5MB.`);
                await db.run("UPDATE sync_queue SET status = 'pending', telegram_message_id = NULL, file_size = 0, error_message = 'Rejeitado: Arquivo menor que 5MB (incompleto)', priority = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [taskId]);
            } else {
                const existing = await db.get("SELECT old_telegram_message_id FROM sync_queue WHERE id = ?", [taskId]);
                const oldMsgId = existing ? existing.old_telegram_message_id : null;

                await db.run("UPDATE sync_queue SET status = 'completed', telegram_message_id = ?, old_telegram_message_id = NULL, file_size = ?, priority = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [telegram_message_id, file_size || 0, taskId]);
                
                if (oldMsgId) {
                    try {
                        console.log(`[Hybrid Cleanup] 🗑️ Apagando mensagem antiga falha ID ${oldMsgId} do Telegram...`);
                        const tgClient = await getTelegramClient();
                        if (tgClient) {
                            const channelId = process.env.TELEGRAM_CHANNEL_ID;
                            await tgClient.deleteMessages(channelId, [parseInt(oldMsgId)], { revoke: true });
                            console.log(`[Hybrid Cleanup] ✅ Mensagem antiga ID ${oldMsgId} apagada com sucesso!`);
                        }
                    } catch (delErr) {
                        console.error(`[Hybrid Cleanup] Erro ao deletar mensagem antiga ID ${oldMsgId}:`, delErr.message);
                    }
                }
            }
            
            if (remoteWorkersState[workerId]) {
                delete remoteWorkersState[workerId];
                broadcastRemoteStates();
            }
            
            res.json({ success: true });
        } catch (err) {
            console.error('Erro no complete híbrido:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 4. Reportar Erro
    router.post('/error', async (req, res) => {
        const { workerId, taskId, error_message } = req.body;
        
        try {
            await db.run("UPDATE sync_queue SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [error_message, taskId]);
            
            if (remoteWorkersState[workerId]) {
                delete remoteWorkersState[workerId];
                broadcastRemoteStates();
            }
            
            res.json({ success: true });
        } catch (err) {
            console.error('Erro no fallback do híbrido:', err);
            res.status(500).json({ error: err.message });
        }
    });

    // 5. Inserir Conteúdo Concluído Diretamente (ex: Animes & Doramas Scraper)
    router.post('/insert-custom', async (req, res) => {
        const { title, url, telegram_message_id, file_size, tmdb_id, media_type, season_number, episode_number } = req.body;
        
        if (!title || !telegram_message_id || !tmdb_id) {
            return res.status(400).json({ error: 'Faltam campos obrigatórios (title, telegram_message_id, tmdb_id).' });
        }

        try {
            // Verifica se já existe por url ou tmdb + temporada + episódio
            const existing = await db.get(
                "SELECT id, telegram_message_id FROM sync_queue WHERE url = ? OR (tmdb_id = ? AND season_number = ? AND episode_number = ? AND (media_type = ? OR media_type IS NULL))",
                [url || `custom://${tmdb_id}/${season_number || 1}/${episode_number || 1}`, String(tmdb_id), season_number || null, episode_number || null, media_type || 'tv']
            );

            if (existing) {
                // Atualiza o registro existente
                await db.run(
                    "UPDATE sync_queue SET status = 'completed', telegram_message_id = ?, file_size = COALESCE(?, file_size), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [telegram_message_id, file_size || 0, existing.id]
                );
                return res.json({ success: true, updated: true, id: existing.id });
            } else {
                // Insere novo registro já como completed
                const safeUrl = url || `custom://${tmdb_id}/${season_number || 1}/${episode_number || 1}`;
                const insertRes = await db.run(
                    "INSERT INTO sync_queue (title, url, status, file_size, telegram_message_id, tmdb_id, media_type, season_number, episode_number, priority) VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, 0)",
                    [title, safeUrl, file_size || 0, telegram_message_id, String(tmdb_id), media_type || 'tv', season_number || null, episode_number || null]
                );
                return res.json({ success: true, inserted: true, id: insertRes.lastID });
            }
        } catch (err) {
            console.error('Erro ao inserir custom sync_queue:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
