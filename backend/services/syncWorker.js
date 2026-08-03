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
let uploadTask = null; // { id, title, progress: 0 }

let ioInstance = null;
let dbInstance = null;

// Controladores para poder cancelar tarefas caso pause
let activeDownloadController = null;
let activeChildProcess = null;

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
        if (activeChildProcess) {
            activeChildProcess.kill();
            activeChildProcess = null;
        }
        
        // Devolve tasks pro status adequado no BD para serem retomadas depois
        if (downloadTask && downloadTask.id) {
            dbInstance.run("UPDATE sync_queue SET status = 'pending' WHERE id = ?", [downloadTask.id]);
        }
        if (uploadTask && uploadTask.id) {
            dbInstance.run("UPDATE sync_queue SET status = 'pending_upload' WHERE id = ?", [uploadTask.id]);
        }
        
        downloadTask = null;
        uploadTask = null;
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
        uploadTask
    });
}

function broadcastState() {
    if (!ioInstance) return;
    ioInstance.emit('sync_state', {
        isRunning,
        isPaused,
        downloadTask,
        uploadTask
    });
}

export async function startWorker() {
    if (isRunning || isPaused) return;
    isRunning = true;
    broadcastState();

    try {
        // Inicia as duas rotinas (loops) paralelamente
        activeDownloadLoop = downloadLoop();
        activeUploadLoop = uploadLoop();
        
        // Espera as duas finalizarem (se der pause, elas quebram o loop)
        await Promise.all([activeDownloadLoop, activeUploadLoop]);
        
    } catch (err) {
        console.error("Erro fatal no worker:", err);
    } finally {
        isRunning = false;
        downloadTask = null;
        uploadTask = null;
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
            if (existing && (existing.status === 'completed' || existing.status === 'pending_upload' || existing.status === 'uploading')) {
                continue;
            }

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

            // Tem item! Processa o upload
            const success = await processUpload(item);
            
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

async function processUpload(movie) {
    const safeTitle = movie.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ext = movie.url.split('?')[0].split('.').pop() || 'mp4';
    const tmpPath = path.join(os.tmpdir(), `${safeTitle}_${movie.id}.${ext}`);

    try {
        if (!fs.existsSync(tmpPath)) {
            // Se o arquivo sumiu, joga de volta pra pending pra tentar baixar de novo
            await dbInstance.run("UPDATE sync_queue SET status = 'pending', error_message = 'Arquivo temp não encontrado. Rebaixando.', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
            return true; // não é erro fatal, o loop 1 pode pegar ele depois
        }

        await dbInstance.run("UPDATE sync_queue SET status = 'uploading', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
        
        uploadTask = { id: movie.id, title: movie.title, progress: 0 };
        broadcastState();

        // Envia pelo Python
        await uploadViaPython(movie.title, tmpPath, movie.id);

        if (isPaused) return false;

        // Concluído
        await dbInstance.run("UPDATE sync_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
        
    } catch (err) {
        console.error(`Erro no upload de ${movie.title}:`, err);
        if (!isPaused) {
            await dbInstance.run("UPDATE sync_queue SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [err.message, movie.id]);
        }
    } finally {
        uploadTask = null;
        broadcastState();
        // Limpeza do temp após o envio com sucesso ou falha fatal (exceto pause)
        if (!isPaused && fs.existsSync(tmpPath)) {
            try { fs.unlinkSync(tmpPath); } catch (e) {}
        }
        return true;
    }
}

async function downloadFile(url, destPath, dbId) {
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
                    downloadTask.progress = (downloadedBytes / totalBytes) * 100;
                    broadcastState();
                    lastEmit = now;
                }
            }
        }
        
        fileStream.end();
        await new Promise(res => fileStream.on('finish', res));
        
    } finally {
        activeDownloadController = null;
    }
}

function uploadViaPython(title, filePath, dbId) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(process.cwd(), 'backend', 'scripts', 'telegramUploadOnly.py');
        
        activeChildProcess = spawn('python3', [scriptPath, filePath, title]);
        
        activeChildProcess.stdout.on('data', (data) => {
            const output = data.toString();
            // Pega o progresso: "Upload progresso: 45.20%"
            const match = output.match(/Upload progresso:\s*([\d.]+)%/);
            if (match && match[1] && uploadTask) {
                uploadTask.progress = parseFloat(match[1]);
                broadcastState();
            }
        });

        activeChildProcess.stderr.on('data', (data) => {
            console.error(`[Python Uploader Error]: ${data}`);
        });

        activeChildProcess.on('close', (code) => {
            activeChildProcess = null;
            if (code === 0) resolve();
            else reject(new Error(`Processo python falhou com código ${code}`));
        });
    });
}
