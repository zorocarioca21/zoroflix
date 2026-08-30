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

    // Verifica a ordem dos átomos MP4: se 'moov' vem antes de 'mdat', o arquivo tem Fast Start.
    // Isso é MUITO mais confiável do que procurar a string 'moov' cegamente.
    function parseMp4Atoms(buffer) {
        const atoms = [];
        let offset = 0;
        while (offset + 8 <= buffer.length) {
            const size = buffer.readUInt32BE(offset);
            const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
            atoms.push({ type, offset, size });
            
            // Se o tamanho é 0, significa que o atom vai até o fim do arquivo
            if (size === 0) break;
            // Se o tamanho é 1, significa extended size (8 bytes extras) - raro
            if (size === 1 && offset + 16 <= buffer.length) {
                // Extended size: lemos os próximos 8 bytes como BigInt
                const highBits = buffer.readUInt32BE(offset + 8);
                const lowBits = buffer.readUInt32BE(offset + 12);
                const extSize = highBits * 0x100000000 + lowBits;
                if (extSize > buffer.length) break; // O atom é maior que nosso buffer
                offset += extSize;
            } else {
                if (size < 8) break; // Tamanho inválido, para evitar loop infinito
                offset += size;
            }
        }
        return atoms;
    }

    async function checkMoovAtom(messageId) {
        activeAbortController = new AbortController();
        const timeout = setTimeout(() => {
            if (activeAbortController) activeAbortController.abort();
        }, 15000); // Timeout de 15 segundos

        try {
            // Pede apenas os primeiros 512KB do arquivo (suficiente para ler os headers dos átomos top-level)
            const response = await fetch(`http://127.0.0.1:4000/api/stream/telegram/${messageId}`, {
                headers: {
                    'Range': 'bytes=0-524287'
                },
                signal: activeAbortController.signal
            });

            if (!response.ok && response.status !== 206 && response.status !== 200) {
                console.log(`[Audit] ⚠️ Resposta HTTP ${response.status} para msg ${messageId}`);
                return null; // null = inconclusivo (não conta como falha)
            }

            const arrayBuf = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuf);
            
            if (buffer.length < 8) {
                console.log(`[Audit] ⚠️ Buffer muito pequeno (${buffer.length} bytes) para msg ${messageId}`);
                return null;
            }

            const atoms = parseMp4Atoms(buffer);
            
            // Procura a posição de 'moov' e 'mdat' nos átomos de nível superior
            let moovIndex = -1;
            let mdatIndex = -1;
            for (let i = 0; i < atoms.length; i++) {
                if (atoms[i].type === 'moov' && moovIndex === -1) moovIndex = i;
                if (atoms[i].type === 'mdat' && mdatIndex === -1) mdatIndex = i;
            }

            // Se não encontramos nem mdat nem moov nos primeiros 512KB, é inconclusivo
            if (moovIndex === -1 && mdatIndex === -1) {
                console.log(`[Audit] ⚠️ Nenhum atom moov/mdat encontrado nos primeiros 512KB para msg ${messageId}. Atoms: ${atoms.map(a => a.type).join(', ')}`);
                return null;
            }

            // Se encontramos moov mas não mdat, significa que moov vem primeiro (BOM)
            if (moovIndex !== -1 && mdatIndex === -1) return true;
            
            // Se encontramos mdat mas não moov, significa que mdat vem primeiro (RUIM - moov está no final)
            if (mdatIndex !== -1 && moovIndex === -1) return false;

            // Se ambos foram encontrados, verifica a ordem
            return moovIndex < mdatIndex; // true = moov antes de mdat = Fast Start OK

        } catch (e) {
            if (e.name === 'AbortError') {
                console.log(`[Audit] ⏱️ Timeout ao verificar msg ${messageId}`);
            } else {
                console.error(`[Audit] ❌ Erro ao verificar msg ${messageId}:`, e.message);
            }
            return null; // Inconclusivo
        } finally {
            clearTimeout(timeout);
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

                console.log(`[Audit] Verificando [${i+1}/${items.length}] ${item.title}...`);
                const isOptimized = await checkMoovAtom(item.telegram_message_id);

                if (isOptimized === false) {
                    // Apenas se for CERTEZA que mdat vem antes de moov
                    auditState.results.failed++;
                    auditState.results.failedItems.push(item);
                    console.log(`[Audit] ❌ SEM Fast Start: ${item.title}`);
                } else {
                    // true (otimizado) ou null (inconclusivo) = conta como OK
                    auditState.results.passed++;
                    if (isOptimized === null) {
                        console.log(`[Audit] ⚠️ Inconclusivo (assumindo OK): ${item.title}`);
                    } else {
                        console.log(`[Audit] ✅ OK: ${item.title}`);
                    }
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
