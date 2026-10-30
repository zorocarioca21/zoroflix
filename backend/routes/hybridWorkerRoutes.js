import express from 'express';
import fs from 'fs';
import path from 'path';
import { getTelegramClient } from '../telegram.js';

export default function hybridWorkerRoutes(db, io) {
    const router = express.Router();
    
    // Middleware de autenticação básica para o worker remoto
    const authMiddleware = (req, res, next) => {
        // Rotas públicas ou do painel admin frontend (anime-worker status/toggle)
        if (req.path.startsWith('/anime-worker')) {
            return next();
        }
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
        const { workerId, taskId, title, status, progress } = req.body;
        if (!remoteWorkersState[workerId]) {
            remoteWorkersState[workerId] = {
                id: taskId || workerId,
                title: title || workerId,
                status: status || 'Processando',
                progress: progress || 0,
                updatedAt: Date.now()
            };
        } else {
            if (taskId) remoteWorkersState[workerId].id = taskId;
            if (title) remoteWorkersState[workerId].title = title;
            remoteWorkersState[workerId].status = status;
            remoteWorkersState[workerId].progress = progress;
            remoteWorkersState[workerId].updatedAt = Date.now();
        }
        broadcastRemoteStates();
        res.json({ success: true });
    });

    // 2.5 Limpar status de worker
    router.post('/clear-status', (req, res) => {
        const { workerId } = req.body;
        if (workerId && remoteWorkersState[workerId]) {
            delete remoteWorkersState[workerId];
            broadcastRemoteStates();
        }
        res.json({ success: true });
    });

    // 2.6 Gerenciamento e Execução do Worker de Animes & Doramas diretamente pelo Painel
    let animeWorkerPaused = false;
    let animeWorkerProcess = null;

    router.get('/anime-worker/status', (req, res) => {
        const activeState = remoteWorkersState['ANIME_WORKER'] || null;
        res.json({
            isRunning: !!animeWorkerProcess && !animeWorkerProcess.killed,
            paused: animeWorkerPaused,
            active: !!activeState,
            currentTask: activeState
        });
    });

    // Helper para iniciar o processo Python do Worker de Animes
    async function startAnimeWorkerProcess() {
        if (animeWorkerProcess && !animeWorkerProcess.killed) {
            return false;
        }

        const { spawn } = await import('child_process');
        const path = await import('path');
        const scriptPath = path.resolve('backend/scripts/animeDoramaWorker.py');

        console.log(`[Anime Worker] 🚀 Iniciando processo Python no servidor: ${scriptPath}`);
        animeWorkerProcess = spawn('python3', [scriptPath], {
            cwd: path.resolve('.'),
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        animeWorkerProcess.stdout.on('data', (d) => {
            const line = d.toString().trim();
            if (line) console.log(`[Anime Worker] ${line}`);
        });

        animeWorkerProcess.stderr.on('data', (d) => {
            const line = d.toString().trim();
            if (line) console.error(`[Anime Worker ERR] ${line}`);
        });

        animeWorkerProcess.on('close', (code) => {
            console.log(`[Anime Worker] 🛑 Processo finalizado com código ${code}`);
            animeWorkerProcess = null;
            if (remoteWorkersState['ANIME_WORKER']) {
                delete remoteWorkersState['ANIME_WORKER'];
                broadcastRemoteStates();
            }
        });

        return true;
    }

    // Auto-início no boot do servidor (se configurado anime_auto_start !== '0')
    (async () => {
        try {
            const autoBootRow = await db.get("SELECT value FROM system_settings WHERE key = 'anime_auto_start'");
            const autoStartEnabled = autoBootRow ? autoBootRow.value === '1' || autoBootRow.value === 'true' : true;
            if (autoStartEnabled) {
                console.log('[Anime Worker] 🚀 Auto-início no boot ativado: iniciando worker de animes & doramas...');
                await startAnimeWorkerProcess();
            } else {
                console.log('[Anime Worker] ⏸️ Auto-início no boot desativado: worker de animes permanecerá desligado.');
            }
        } catch (e) {
            console.error('[Anime Worker] Erro ao verificar auto-início no boot:', e);
        }
    })();

    router.get('/anime-worker/auto-boot-setting', async (req, res) => {
        try {
            const row = await db.get("SELECT value FROM system_settings WHERE key = 'anime_auto_start'");
            const enabled = row ? row.value === '1' || row.value === 'true' : true;
            res.json({ success: true, enabled });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/anime-worker/auto-boot-setting', async (req, res) => {
        try {
            const { enabled } = req.body;
            const valStr = enabled ? '1' : '0';
            await db.run(
                `INSERT INTO system_settings (key, value, updated_at) VALUES ('anime_auto_start', ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
                [valStr]
            );
            res.json({ success: true, enabled: !!enabled });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/anime-worker/start', async (req, res) => {
        try {
            animeWorkerPaused = false;
            io.emit('anime_worker_pause_state', { paused: false });

            if (animeWorkerProcess && !animeWorkerProcess.killed) {
                return res.json({ success: true, message: 'Worker já está em execução no servidor.', isRunning: true });
            }

            await startAnimeWorkerProcess();
            res.json({ success: true, message: 'Worker de Animes iniciado com sucesso!', isRunning: true });
        } catch (err) {
            console.error('[Anime Worker] Erro ao iniciar processo:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/anime-worker/stop', (req, res) => {
        try {
            if (animeWorkerProcess && !animeWorkerProcess.killed) {
                console.log('[Anime Worker] 🛑 Encerrando processo Python do worker...');
                animeWorkerProcess.kill('SIGTERM');
                animeWorkerProcess = null;
            }
            if (remoteWorkersState['ANIME_WORKER']) {
                delete remoteWorkersState['ANIME_WORKER'];
                broadcastRemoteStates();
            }
            res.json({ success: true, message: 'Worker de Animes parado com sucesso.', isRunning: false });
        } catch (err) {
            console.error('[Anime Worker] Erro ao parar processo:', err);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/anime-worker/toggle', (req, res) => {
        const { pause } = req.body;
        if (typeof pause === 'boolean') {
            animeWorkerPaused = pause;
        } else {
            animeWorkerPaused = !animeWorkerPaused;
        }
        io.emit('anime_worker_pause_state', { paused: animeWorkerPaused });
        res.json({ success: true, paused: animeWorkerPaused });
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

    // 6. Upload de Anime/Dorama idêntico ao Worker da IPTV (Local telegram-bot-api / Pyrogram)
    router.post('/upload-anime', async (req, res) => {
        const { filePath, caption, title } = req.body;
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(400).json({ error: 'Arquivo não encontrado na VPS' });
        }

        const displayTitle = caption || title || path.basename(filePath);
        console.log(`[Hybrid Anime Upload] ⬆️ Enviando: ${filePath} (${displayTitle})`);

        // Método 1: Idêntico ao IPTV Worker (uploadViaDocker - telegram-bot-api local porta 8081)
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID;

        if (BOT_TOKEN && CHAT_ID) {
            try {
                const LOCAL_API_URL = `http://127.0.0.1:8081/bot${BOT_TOKEN}/sendVideo`;
                let duration = 0, width = 1280, height = 720;
                try {
                    const { spawn } = await import('child_process');
                    const ffprobeResult = await new Promise((resolve) => {
                        const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
                        let output = '';
                        proc.stdout.on('data', d => output += d.toString());
                        proc.on('close', code => resolve(code === 0 ? output.trim().split('\n') : []));
                        proc.on('error', () => resolve([]));
                    });
                    if (ffprobeResult.length >= 3) {
                        width = parseInt(ffprobeResult[0]) || 1280;
                        height = parseInt(ffprobeResult[1]) || 720;
                        duration = parseInt(parseFloat(ffprobeResult[2])) || 0;
                    } else if (ffprobeResult.length === 1) {
                        duration = parseInt(parseFloat(ffprobeResult[0])) || 0;
                    }
                } catch (e) {}

                const payload = {
                    chat_id: CHAT_ID,
                    video: `file://${filePath}`,
                    caption: `<b>${displayTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>`,
                    parse_mode: 'HTML',
                    supports_streaming: true,
                    duration: duration || undefined,
                    width: width || undefined,
                    height: height || undefined
                };

                const response = await fetch(LOCAL_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data && data.result && data.result.message_id) {
                        console.log(`[Hybrid Anime Upload] ✅ Enviado via Bot API Local! ID: ${data.result.message_id}`);
                        return res.json({ success: true, messageId: data.result.message_id });
                    }
                } else {
                    const errText = await response.text();
                    console.warn(`[Hybrid Anime Upload] ⚠️ Bot API Local retornou ${response.status}: ${errText}`);
                }
            } catch (botApiErr) {
                console.warn(`[Hybrid Anime Upload] ⚠️ Falha na Bot API Local: ${botApiErr.message}`);
            }
        }

        // Método 2: Idêntico ao IPTV Worker secundário (uploadViaPython / telegramUploadOnly.py com Pyrogram)
        try {
            const { spawn } = await import('child_process');
            const scriptPath = path.join(process.cwd(), 'backend', 'scripts', 'telegramUploadOnly.py');
            if (fs.existsSync(scriptPath)) {
                console.log(`[Hybrid Anime Upload] 🔄 Tentando upload via Pyrogram (telegramUploadOnly.py)...`);
                const pyMsgId = await new Promise((resolve, reject) => {
                    const pyProc = spawn('python3', [scriptPath, filePath, displayTitle]);
                    let msgId = null;
                    pyProc.stdout.on('data', d => {
                        const m = d.toString().match(/MESSAGE_ID:\s*(\d+)/i);
                        if (m) msgId = parseInt(m[1]);
                    });
                    pyProc.on('close', code => code === 0 ? resolve(msgId) : reject(new Error(`Pyrogram code ${code}`)));
                    pyProc.on('error', reject);
                });
                if (pyMsgId) {
                    console.log(`[Hybrid Anime Upload] ✅ Enviado via Pyrogram! ID: ${pyMsgId}`);
                    return res.json({ success: true, messageId: pyMsgId });
                }
            }
        } catch (pyErr) {
            console.warn(`[Hybrid Anime Upload] ⚠️ Falha no Pyrogram: ${pyErr.message}`);
        }

        // Método 3: Fallback GramJS compartilhado
        try {
            const tgClient = await getTelegramClient();
            if (!tgClient) throw new Error('TelegramClient indisponível');
            let entityId = process.env.TELEGRAM_CHANNEL_ID || '-1003839496993';
            if (!entityId.startsWith('-100')) entityId = '-100' + entityId.replace('-', '');
            const sentMsg = await tgClient.sendFile(entityId, {
                file: filePath,
                workers: 1,
                caption: `**${displayTitle}**`,
                parseMode: "markdown",
                forceDocument: false
            });
            console.log(`[Hybrid Anime Upload] ✅ Enviado via GramJS! ID: ${sentMsg.id}`);
            return res.json({ success: true, messageId: sentMsg.id });
        } catch (gramErr) {
            console.error(`[Hybrid Anime Upload] ❌ Todos os métodos falharam:`, gramErr);
            return res.status(500).json({ error: gramErr.message });
        }
    });

    return router;
}
