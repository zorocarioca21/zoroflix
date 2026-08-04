import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import readline from 'readline';

// Worker Global State
let isRunning = false;
let isPaused = false;

// Estado Separado para Download e Upload (Pipeline Produtor-Consumidor)
let downloadTask = null; // { id, title, progress: 0 }
let uploadTaskDocker = null; // { id, title, progress: 0 }
let uploadTaskPython = null; // { id, title, progress: 0 }

let ioInstance = null;
let dbInstance = null;

// Controladores para poder cancelar tarefas caso pause
let activeDownloadController = null;
let activeUploadControllerDocker = null;
let activeChildProcessPython = null;

// Promessas ativas dos loops para sabermos quando parar
let activeDownloadLoop = null;
let activeUploadLoop = null;

export function initSyncWorker(db, io) {
    dbInstance = db;
    ioInstance = io;
}

export function setPauseState(paused) {
    isPaused = paused;
    if (paused) {
        isRunning = false;
        // Interrompe processos ativos
        if (activeDownloadController) {
            activeDownloadController.abort();
            activeDownloadController = null;
        }
        if (activeChildProcessPython) {
            activeChildProcessPython.kill();
            activeChildProcessPython = null;
        }
        if (activeUploadControllerDocker) {
            activeUploadControllerDocker.abort();
            activeUploadControllerDocker = null;
        }
        
        // Devolve tasks pro status adequado no BD para serem retomadas depois
        if (downloadTask && downloadTask.id) {
            dbInstance.run("UPDATE sync_queue SET status = 'pending' WHERE id = ?", [downloadTask.id]);
        }
        if (uploadTaskDocker && uploadTaskDocker.id) {
            dbInstance.run("UPDATE sync_queue SET status = 'pending_upload' WHERE id = ?", [uploadTaskDocker.id]);
        }
        if (uploadTaskPython && uploadTaskPython.id) {
            dbInstance.run("UPDATE sync_queue SET status = 'pending_upload' WHERE id = ?", [uploadTaskPython.id]);
        }
        
        downloadTask = null;
        uploadTaskDocker = null;
        uploadTaskPython = null;
        broadcastState();
    } else {
        // Retoma worker
        if (!isRunning) {
            startWorker();
        }
        broadcastState();
    }
}

export function broadcastStateTo(socket) {
    socket.emit('sync_state', {
        isRunning,
        isPaused,
        downloadTask,
        uploadTaskDocker,
        uploadTaskPython
    });
}

function broadcastState() {
    if (!ioInstance) return;
    ioInstance.emit('sync_state', {
        isRunning,
        isPaused,
        downloadTask,
        uploadTaskDocker,
        uploadTaskPython
    });
}

export async function startWorker() {
    if (isRunning || isPaused) return;
    isRunning = true;
    broadcastState();

    try {
        // Recuperação de estado em caso de reinício abrupto da VPS
        await dbInstance.run("UPDATE sync_queue SET status = 'pending' WHERE status = 'downloading'");
        await dbInstance.run("UPDATE sync_queue SET status = 'pending_upload' WHERE status = 'uploading'");

        // Inicia as duas rotinas paralelamente
        activeDownloadLoop = downloadLoop();
        activeUploadLoop = uploadLoop();
        
        // Espera todas finalizarem
        await Promise.all([activeDownloadLoop, activeUploadLoop]);
        
    } catch (err) {
        console.error("Erro fatal no worker:", err);
    } finally {
        isRunning = false;
        downloadTask = null;
        uploadTaskDocker = null;
        uploadTaskPython = null;
        broadcastState();
    }
}

// ==========================================
// LOOP 1: PRODUTOR (Baixa arquivos para a VPS)
// ==========================================
async function downloadLoop() {
    const m3uPath = path.join(process.cwd(), 'iptv_list.m3u');
    if (!fs.existsSync(m3uPath)) {
        throw new Error("Arquivo iptv_list.m3u não encontrado na raiz");
    }

    const fileStream = fs.createReadStream(m3uPath, 'utf-8');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let currentTitle = null;

    for await (const line of rl) {
        if (isPaused) break; // Sai imediatamente se pausado

        const trimmed = line.trim();
        if (trimmed.startsWith('#EXTINF')) {
            const lastQuoteComma = trimmed.lastIndexOf('",');
            if (lastQuoteComma !== -1) {
                currentTitle = trimmed.substring(lastQuoteComma + 2).trim();
            } else {
                const firstComma = trimmed.indexOf(',');
                if (firstComma !== -1) {
                    currentTitle = trimmed.substring(firstComma + 1).trim();
                }
            }
        } else if (trimmed.startsWith('http') && currentTitle) {
            const title = currentTitle;
            const url = trimmed;
            currentTitle = null;

            const ext = url.split('?')[0].split('.').pop().toLowerCase();
            if (ext !== 'mp4' && ext !== 'mkv') continue;

            // Verifica se já existe e seu status atual
            const existing = await dbInstance.get("SELECT id, status FROM sync_queue WHERE url = ?", [url]);
            
            // Se já está completo ou aguardando upload, pulamos o download
            if (existing && (existing.status === 'completed' || existing.status === 'pending_upload' || existing.status === 'uploading' || existing.status === 'skipped')) {
                continue;
            }

            // Verifica o espaço atual ocupado antes de iniciar o download
            while (!isPaused) {
                const row = await dbInstance.get("SELECT SUM(file_size) as total FROM sync_queue WHERE status IN ('pending_upload', 'uploading')");
                const totalUsed = row ? (row.total || 0) : 0;
                const LIMIT = 50 * 1024 * 1024 * 1024; // 50 GB
                
                if (totalUsed < LIMIT) {
                    break;
                }
                
                downloadTask = { id: existing ? existing.id : 'N/A', title: 'PAUSADO: LIMITE 50GB ATINGIDO', progress: 'WAITING_SPACE' };
                broadcastState();
                
                await new Promise(r => setTimeout(r, 15000)); // Checa a cada 15 segundos
            }
            if (isPaused) break;

            let dbId;
            if (existing) {
                await dbInstance.run("UPDATE sync_queue SET status = 'pending' WHERE id = ?", [existing.id]);
                dbId = existing.id;
            } else {
                const res = await dbInstance.run("INSERT INTO sync_queue (title, url, status) VALUES (?, ?, 'pending')", [title, url]);
                dbId = res.lastID;
            }

            // Executa a tarefa de download (Fica travado aqui até o DOWNLOAD deste item terminar)
            const success = await processDownload({ id: dbId, title, url });
            
            if (!success || isPaused) {
                break; // Se deu erro fatal ou pausou, para o loop
            }
        }
    }
}

// ==========================================
// LOOP 2: CONSUMIDOR (Envia arquivos para o Telegram)
// ==========================================

async function uploadLoop() {
    while (!isPaused) {
        try {
            // Busca o próximo item pronto para ser enviado (pending_upload)
            const item = await dbInstance.get("SELECT id, title, url FROM sync_queue WHERE status = 'pending_upload' ORDER BY id ASC LIMIT 1");
            
            if (!item) {
                // Se não tem nada para upar, dorme 5 segundos e tenta de novo
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            // Tem item! Processa o upload.
            // Para decidir se é docker ou python, olhamos o tamanho
            const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const ext = item.url.split('?')[0].split('.').pop() || 'mp4';
            const tmpPath = path.join(os.tmpdir(), `${safeTitle}_${item.id}.${ext}`);
            
            let workerType = 'python';
            if (fs.existsSync(tmpPath)) {
                const stats = fs.statSync(tmpPath);
                if (stats.size <= 2147483648) {
                    workerType = 'docker';
                }
            }

            // Trava o item (opcional se houver 1 loop só, mas seguro)
            await dbInstance.run("UPDATE sync_queue SET status = 'uploading', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [item.id]);

            const success = await processUpload(item, workerType);
            
            if (!success || isPaused) {
                break; // Se deu erro fatal ou pausou, sai do loop
            }
        } catch (err) {
            console.error("Erro no loop de upload:", err);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// ==========================================
// FUNÇÕES AUXILIARES DE EXECUÇÃO
// ==========================================

async function processDownload(movie) {
    const safeTitle = movie.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ext = movie.url.split('?')[0].split('.').pop() || 'mp4';
    const tmpPath = path.join(os.tmpdir(), `${safeTitle}_${movie.id}.${ext}`);

    try {
        await dbInstance.run("UPDATE sync_queue SET status = 'downloading', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
        
        downloadTask = { id: movie.id, title: movie.title, progress: 0 };
        broadcastState();
        
        await downloadFile(movie.url, tmpPath, movie.id);
        
        if (isPaused) return false; 

        const stats = fs.statSync(tmpPath);
        const fileSize = stats.size;
        
        // Finaliza download: altera para pending_upload para que o loop 2 assuma
        await dbInstance.run("UPDATE sync_queue SET file_size = ?, status = 'pending_upload', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [fileSize, movie.id]);
        downloadTask = null;
        broadcastState();
        return true;
        
    } catch (err) {
        console.error(`Erro no download de ${movie.title}:`, err);
        if (!isPaused) {
            await dbInstance.run("UPDATE sync_queue SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [err.message, movie.id]);
        }
        downloadTask = null;
        broadcastState();
        return true; // Continua para o próximo filme apesar do erro deste
    }
}

async function processUpload(movie, workerType) {
    const safeTitle = movie.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ext = movie.url.split('?')[0].split('.').pop() || 'mp4';
    const tmpPath = path.join(os.tmpdir(), `${safeTitle}_${movie.id}.${ext}`);

    try {
        if (!fs.existsSync(tmpPath)) {
            await dbInstance.run("UPDATE sync_queue SET status = 'pending', error_message = 'Arquivo temp não encontrado. Rebaixando.', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
            return true; 
        }
        
        if (workerType === 'docker') {
            uploadTaskDocker = { id: movie.id, title: movie.title, progress: 0 };
        } else {
            uploadTaskPython = { id: movie.id, title: movie.title, progress: 0 };
        }
        broadcastState();

        let messageId = null;

        if (workerType === 'docker') {
            messageId = await uploadViaDocker(movie.title, tmpPath, movie.id);
        } else {
            messageId = await uploadViaPython(movie.title, tmpPath, movie.id);
        }

        if (isPaused) return false;

        // Concluído
        if (messageId) {
            await dbInstance.run("UPDATE sync_queue SET status = 'completed', telegram_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [messageId, movie.id]);
        } else {
            await dbInstance.run("UPDATE sync_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
        }
        
    } catch (err) {
        console.error(`Erro no upload de ${movie.title} via ${workerType}:`, err);
        if (!isPaused) {
            await dbInstance.run("UPDATE sync_queue SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [err.message, movie.id]);
        }
    } finally {
        if (workerType === 'docker') uploadTaskDocker = null;
        else uploadTaskPython = null;
        broadcastState();
        
        if (!isPaused && fs.existsSync(tmpPath)) {
            try { fs.unlinkSync(tmpPath); } catch (e) {}
        }
        return true;
    }
}

async function downloadFile(url, destPath, dbId) {
    activeDownloadController = new AbortController();
    
    return new Promise((resolve, reject) => {
        // Opção 1: Usar FFmpeg para baixar e consertar o moov atom (Fast Start)
        // Isso previne que vídeos com conexão interrompida ou m3u8 fiquem corrompidos
        const ffmpegArgs = [
            '-y',
            '-user_agent', 'VLC/3.0.18 LibVLC/3.0.18',
            '-i', url,
            '-c', 'copy',
            '-movflags', '+faststart',
            destPath
        ];

        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
        
        let totalDurationSec = 0;

        ffmpegProcess.stderr.on('data', (data) => {
            const str = data.toString();

            // Pega a duração total na primeira vez (ex: "Duration: 01:15:23.64")
            if (totalDurationSec === 0) {
                const durMatch = str.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
                if (durMatch) {
                    totalDurationSec = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                }
            }

            // Extrai progresso de tempo do FFmpeg (ex: "time=00:12:34.56")
            const timeMatch = str.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (timeMatch && downloadTask) {
                const currentSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                
                if (totalDurationSec > 0) {
                    // Porcentagem real baseada no tempo
                    downloadTask.progress = Math.min((currentSec / totalDurationSec) * 100, 99.9);
                } else {
                    // Fallback: mostra MB baixados como porcentagem fake crescente
                    try {
                        const stats = fs.statSync(destPath);
                        downloadTask.progress = Math.min((stats.size / (1024 * 1024 * 1024)) * 10, 99); // Fake %
                    } catch (e) {
                        downloadTask.progress = 1;
                    }
                }
                broadcastState();
            }
        });

        // Caso o usuário cancele a task pelo painel ou VPS pause
        let wasAborted = false;
        activeDownloadController.signal.addEventListener('abort', () => {
            wasAborted = true;
            ffmpegProcess.kill('SIGKILL');
            if (fs.existsSync(destPath)) {
                try { fs.unlinkSync(destPath); } catch (e) {}
            }
            // NÃO reject aqui — deixa o 'close' handler cuidar
        });

        ffmpegProcess.on('close', (code) => {
            activeDownloadController = null;
            if (wasAborted || code === null) {
                // Usuário pausou ou abortou — NÃO cai no fallback fetch
                reject(new Error('Download cancelado pelo usuário.'));
            } else if (code === 0) {
                // Download via FFmpeg foi um sucesso!
                resolve();
            } else {
                // FFmpeg falhou genuinamente (ex: codec não suportado)
                // Nesse caso sim, tenta o fallback via fetch
                console.warn(`[FFmpeg] Falhou com código ${code}. Tentando via Node Fetch fallback...`);
                if (fs.existsSync(destPath)) {
                    try { fs.unlinkSync(destPath); } catch (e) {}
                }
                fallbackDownloadNodeFetch(url, destPath).then(resolve).catch(reject);
            }
        });

        ffmpegProcess.on('error', (err) => {
            if (wasAborted) return; // Já tratado pelo close
            console.warn(`[FFmpeg] Não instalado ou erro grave (${err.message}). Tentando fallback Fetch...`);
            fallbackDownloadNodeFetch(url, destPath).then(resolve).catch(reject);
        });
    });
}

// Fallback nativo
async function fallbackDownloadNodeFetch(url, destPath) {
    activeDownloadController = new AbortController();
    
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "VLC/3.0.18 LibVLC/3.0.18",
                "Accept": "*/*"
            },
            redirect: 'follow',
            signal: activeDownloadController.signal
        });

        if (!response.ok) throw new Error(`Status HTTP ${response.status}`);

        const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
        let downloadedBytes = 0;
        const fileStream = fs.createWriteStream(destPath);
        const reader = response.body.getReader();
        
        let lastEmit = Date.now();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            downloadedBytes += value.length;
            fileStream.write(value);
            
            if (totalBytes > 0 && downloadTask) {
                const now = Date.now();
                if (now - lastEmit > 500) { 
                    downloadTask.progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);
                    broadcastState();
                    lastEmit = now;
                }
            } else if (downloadTask) {
                // Sem content-length (ex: M3U8 chunked)
                const now = Date.now();
                if (now - lastEmit > 1000) { 
                    downloadTask.progress = `Baixando... (${(downloadedBytes / (1024*1024)).toFixed(1)} MB)`;
                    broadcastState();
                    lastEmit = now;
                }
            }
        }
        
        fileStream.end();
        await new Promise(res => fileStream.on('finish', res));

        // Valida se o arquivo baixado está completo (apenas se soubermos o totalBytes)
        if (totalBytes > 0 && downloadedBytes < totalBytes) {
            if (fs.existsSync(destPath)) {
                fs.unlinkSync(destPath);
            }
            throw new Error(`Download interrompido. Baixado: ${downloadedBytes} / Total: ${totalBytes}`);
        }
    } finally {
        activeDownloadController = null;
    }
}

function uploadViaPython(title, filePath, dbId) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(process.cwd(), 'backend', 'scripts', 'telegramUploadOnly.py');
        
        activeChildProcessPython = spawn('python3', [scriptPath, filePath, title]);
        
        let foundMessageId = null;

        activeChildProcessPython.stdout.on('data', (data) => {
            const output = data.toString();
            // Pega o progresso: "Upload progresso: 45.20%"
            const match = output.match(/Upload progresso:\s*([\d.]+)%/);
            if (match && match[1] && uploadTaskPython) {
                uploadTaskPython.progress = parseFloat(match[1]);
                broadcastState();
            }
            
            // Pega o message id: "MESSAGE_ID: 12345"
            const msgMatch = output.match(/MESSAGE_ID:\s*(\d+)/);
            if (msgMatch && msgMatch[1]) {
                foundMessageId = parseInt(msgMatch[1]);
            }
        });

        activeChildProcessPython.stderr.on('data', (data) => {
            console.error(`[Python Uploader Error]: ${data}`);
        });

        activeChildProcessPython.on('close', (code) => {
            activeChildProcessPython = null;
            if (code === 0) resolve(foundMessageId);
            else reject(new Error(`Processo python falhou com código ${code}`));
        });
    });
}

async function uploadViaDocker(title, filePath, dbId) {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID;
    
    if (!BOT_TOKEN || !CHAT_ID) {
        throw new Error("TELEGRAM_BOT_TOKEN ou TELEGRAM_CHANNEL_ID não configurados no .env");
    }

    if (uploadTaskDocker) {
        uploadTaskDocker.progress = 'MOTOR TURBO (Aguarde o envio...)';
        broadcastState();
    }

    activeUploadControllerDocker = new AbortController();

    try {
        const LOCAL_API_URL = `http://127.0.0.1:8081/bot${BOT_TOKEN}/sendVideo`;
        
        const payload = {
            chat_id: CHAT_ID,
            video: `file://${filePath}`,
            caption: `<b>${title}</b>`,
            parse_mode: 'HTML',
            supports_streaming: true
        };

        const response = await fetch(LOCAL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: activeUploadControllerDocker.signal
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Erro na API Local: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        if (data && data.result && data.result.message_id) {
            return data.result.message_id;
        }
        
        return null;
    } finally {
        activeUploadControllerDocker = null;
    }
}

