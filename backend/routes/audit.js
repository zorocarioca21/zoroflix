import express from 'express';

export default function auditRoutes(db) {
    const router = express.Router();

    let auditState = {
        isRunning: false,
        isPaused: false,
        progress: 0,
        total: 0,
        currentIndex: 0,
        currentItem: null,
        results: {
            passed: 0,
            failed: 0,
            failedItems: [] // { id, title, telegram_message_id }
        }
    };

    let activeAbortController = null;

    async function checkMoovAtom(messageId) {
        activeAbortController = new AbortController();
        try {
            // Pede apenas os primeiros 2 Megabytes do arquivo
            const response = await fetch(`http://127.0.0.1:4000/api/stream/telegram/${messageId}`, {
                headers: {
                    'Range': 'bytes=0-2097151'
                },
                signal: activeAbortController.signal
            });

            if (!response.ok && response.status !== 206 && response.status !== 200) {
                return false; // Falha na rede ou não encontrado
            }

            const arrayBuf = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            const moovBuffer = Buffer.from('moov');
            const hasMoov = buffer.indexOf(moovBuffer) !== -1;
            
            return hasMoov;
        } catch (e) {
            console.error(`Erro ao verificar moov atom para msg ${messageId}:`, e.message);
            return false;
        } finally {
            activeAbortController = null;
        }
    }

    async function runAuditLoop() {
        try {
            const items = await db.all("SELECT id, title, telegram_message_id FROM sync_queue WHERE status = 'completed' AND telegram_message_id IS NOT NULL");
            auditState.total = items.length;
            auditState.currentIndex = 0;
            auditState.results.passed = 0;
            auditState.results.failed = 0;
            auditState.results.failedItems = [];

            for (let i = 0; i < items.length; i++) {
                if (!auditState.isRunning) break;
                while (auditState.isPaused && auditState.isRunning) {
                    await new Promise(r => setTimeout(r, 1000));
                }
                if (!auditState.isRunning) break;

                const item = items[i];
                auditState.currentIndex = i;
                auditState.currentItem = item.title;
                auditState.progress = Math.round((i / items.length) * 100);

                console.log(`[Audit] Verificando ${item.title}...`);
                const isOptimized = await checkMoovAtom(item.telegram_message_id);

                if (isOptimized) {
                    auditState.results.passed++;
                } else {
                    auditState.results.failed++;
                    auditState.results.failedItems.push(item);
                }

                // Aguarda um pouco para não dar spam na própria API / Telegram
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (e) {
            console.error("Erro no loop de auditoria:", e);
        } finally {
            auditState.isRunning = false;
            auditState.progress = 100;
            auditState.currentItem = null;
        }
    }

    router.get('/audit/state', (req, res) => {
        res.json(auditState);
    });

    router.post('/audit/start', (req, res) => {
        if (auditState.isRunning) {
            return res.status(400).json({ error: 'Auditoria já está rodando.' });
        }
        auditState.isRunning = true;
        auditState.isPaused = false;
        runAuditLoop();
        res.json({ success: true });
    });

    router.post('/audit/pause', (req, res) => {
        auditState.isPaused = !auditState.isPaused;
        res.json({ success: true, isPaused: auditState.isPaused });
    });

    router.post('/audit/stop', (req, res) => {
        auditState.isRunning = false;
        if (activeAbortController) {
            activeAbortController.abort();
        }
        res.json({ success: true });
    });

    router.post('/audit/reupload', async (req, res) => {
        try {
            const { ids } = req.body; // Array de IDs da tabela sync_queue
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'Nenhum ID fornecido.' });
            }

            const placeholders = ids.map(() => '?').join(',');
            // Joga de volta pra pending com prioridade alta e zera o message id
            await db.run(
                `UPDATE sync_queue SET status = 'pending', priority = 999, telegram_message_id = NULL, error_message = 'Re-upload solicitado pela Auditoria' WHERE id IN (${placeholders})`,
                ids
            );

            // Remove da lista de falhas da interface
            auditState.results.failedItems = auditState.results.failedItems.filter(item => !ids.includes(item.id));
            auditState.results.failed -= ids.length;

            res.json({ success: true });
        } catch (e) {
            console.error("Erro ao reupar itens:", e);
            res.status(500).json({ error: 'Erro ao solicitar re-upload.' });
        }
    });

    return router;
}
