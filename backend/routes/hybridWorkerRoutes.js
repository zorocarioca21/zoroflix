import express from 'express';

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
            await db.run("UPDATE sync_queue SET status = 'completed', telegram_message_id = ?, file_size = ?, priority = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [telegram_message_id, file_size || 0, taskId]);
            
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

    return router;
}
