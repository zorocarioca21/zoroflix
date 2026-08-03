import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import axios from 'axios';
import FormData from 'form-data';
import readline from 'readline';

// Worker Global State
let isRunning = false;
let isPaused = false;
let currentTask = null; // { id, title, type: 'download' | 'upload', progress: 0 }
let ioInstance = null;
let dbInstance = null;
let activeChildProcess = null; // Para poder matar o upload python se pausar
let activeDownloadController = null; // Para abortar o download fetch se pausar

const MAX_BOT_API_SIZE = 1950 * 1024 * 1024; // ~1.95 GB para margem de segurança

export function initSyncWorker(db, io) {
    dbInstance = db;
    ioInstance = io;
}

export function setPauseState(paused) {
    isPaused = paused;
    if (paused) {
        // Interrompe processos ativos
        if (activeDownloadController) {
            activeDownloadController.abort();
            activeDownloadController = null;
        }
        if (activeChildProcess) {
            activeChildProcess.kill();
            activeChildProcess = null;
        }
        // Devolve a task pro status pending
        if (currentTask && currentTask.id) {
            dbInstance.run("UPDATE sync_queue SET status = 'pending' WHERE id = ?", [currentTask.id]);
        }
        currentTask = null;
        broadcastState();
    } else {
        // Retoma worker
        if (!isRunning) {
            startWorker();
        }
        broadcastState();
    }
}

export async function addMoviesToQueue(movies) {
    let added = 0;
    for (const movie of movies) {
        try {
            const result = await dbInstance.run(
                "INSERT INTO sync_queue (title, url, status) VALUES (?, ?, 'pending')",
                [movie.title, movie.url]
            );
            if (result.changes > 0) added++;
        } catch (err) {
            // Ignora duplicados (UNIQUE constraint no url)
        }
    }
    if (!isRunning && !isPaused) startWorker();
    return added;
}

function broadcastState() {
    if (!ioInstance) return;
    ioInstance.emit('sync_state', {
        isRunning,
        isPaused,
        currentTask
    });
}

export async function startWorker() {
    if (isRunning || isPaused) return;
    isRunning = true;
    broadcastState();

    try {
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
            if (isPaused) {
                break;
            }

            const trimmed = line.trim();
            if (trimmed.startsWith('#EXTINF')) {
                const match = trimmed.match(/,(.+)/);
                if (match) currentTitle = match[1].trim();
            } else if (trimmed.startsWith('http') && currentTitle) {
                const title = currentTitle;
                const url = trimmed;
                currentTitle = null;

                const ext = url.split('?')[0].split('.').pop().toLowerCase();
                if (ext !== 'mp4' && ext !== 'mkv') {
                    continue;
                }

                // Verifica se já foi baixado
                const existing = await dbInstance.get("SELECT id, status FROM sync_queue WHERE url = ?", [url]);
                
                if (existing && existing.status === 'completed') {
                    continue; // Pula se já baixou com sucesso
                }

                let dbId;
                if (existing) {
                    await dbInstance.run("UPDATE sync_queue SET status = 'pending' WHERE id = ?", [existing.id]);
                    dbId = existing.id;
                } else {
                    const res = await dbInstance.run("INSERT INTO sync_queue (title, url, status) VALUES (?, ?, 'pending')", [title, url]);
                    dbId = res.lastID;
                }

                await processMovie({ id: dbId, title, url });
            }
        }
    } catch (err) {
        console.error("Erro fatal no worker:", err);
    } finally {
        isRunning = false;
        currentTask = null;
        broadcastState();
    }
}

async function processMovie(movie) {
    const safeTitle = movie.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const ext = movie.url.split('?')[0].split('.').pop() || 'mp4';
    const tmpPath = path.join(os.tmpdir(), `${safeTitle}_${movie.id}.${ext}`);

    try {
        // Marca como downloading
        await dbInstance.run("UPDATE sync_queue SET status = 'downloading' WHERE id = ?", [movie.id]);
        
        // Fase 1: Download
        currentTask = { id: movie.id, title: movie.title, type: 'download', progress: 0 };
        broadcastState();
        
        await downloadFile(movie.url, tmpPath, movie.id);
        
        if (isPaused) return; // Se pausou durante o download, aborta fluxo

        const stats = fs.statSync(tmpPath);
        const fileSize = stats.size;
        
        // Atualiza tamanho no banco
        await dbInstance.run("UPDATE sync_queue SET file_size = ?, status = 'uploading' WHERE id = ?", [fileSize, movie.id]);
        
        // Fase 2: Upload
        currentTask = { id: movie.id, title: movie.title, type: 'upload', progress: 0 };
        broadcastState();

        if (fileSize < MAX_BOT_API_SIZE) {
            // Rota rápida C++ (Local Bot API)
            await uploadViaLocalBotApi(movie.title, tmpPath, movie.id);
        } else {
            // Rota Premium Python
            await uploadViaPython(movie.title, tmpPath, movie.id);
        }

        if (isPaused) return;

        // Fase 3: Concluir
        await dbInstance.run("UPDATE sync_queue SET status = 'completed' WHERE id = ?", [movie.id]);
        
    } catch (err) {
        console.error(`Erro processando ${movie.title}:`, err);
        if (!isPaused) {
            await dbInstance.run("UPDATE sync_queue SET status = 'error', error_message = ? WHERE id = ?", [err.message, movie.id]);
        }
    } finally {
        // Limpeza do temp
        if (fs.existsSync(tmpPath)) {
            try { fs.unlinkSync(tmpPath); } catch (e) {}
        }
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

        if (!response.ok) throw new Error(`Status ${response.status}`);

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
            
            if (totalBytes > 0) {
                const now = Date.now();
                if (now - lastEmit > 500) { // Atualiza front-end a cada 500ms
                    currentTask.progress = (downloadedBytes / totalBytes) * 100;
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
        
        activeChildProcess = spawn('python3', [scriptPath, filePath]);
        
        activeChildProcess.stdout.on('data', (data) => {
            const output = data.toString();
            // Tenta pescar o progresso do stdout: "Upload progresso: 45.20%"
            const match = output.match(/Upload progresso:\s*([\d.]+)%/);
            if (match && match[1]) {
                currentTask.progress = parseFloat(match[1]);
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

async function uploadViaLocalBotApi(title, filePath, dbId) {
    return new Promise(async (resolve, reject) => {
        try {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const channelId = process.env.TELEGRAM_CHANNEL_ID;
            
            if (!token) throw new Error("TELEGRAM_BOT_TOKEN não configurado no .env");

            const filename = path.basename(filePath);
            const form = new FormData();
            form.append('chat_id', channelId);
            form.append('video', fs.createReadStream(filePath));
            form.append('caption', `**${title}**\nUpload via Zoroflix Sync (Bot C++ Turbo)`);
            form.append('parse_mode', 'Markdown');
            form.append('supports_streaming', 'true');

            // A URL aponta para o servidor C++ Local (que estará rodando no Docker da VPS na porta 8081)
            const apiUrl = `http://127.0.0.1:8081/bot${token}/sendVideo`;
            
            activeDownloadController = new AbortController(); // Reutilizamos a variável de abort pra cancelar se pausar

            const response = await axios.post(apiUrl, form, {
                headers: form.getHeaders(),
                signal: activeDownloadController.signal,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total) {
                        const percentCompleted = (progressEvent.loaded / progressEvent.total) * 100;
                        currentTask.progress = percentCompleted;
                        broadcastState();
                    }
                }
            });

            if (response.data && response.data.ok) {
                resolve();
            } else {
                reject(new Error("Erro na resposta do Bot API"));
            }
        } catch (err) {
            if (axios.isCancel(err)) {
                reject(new Error("Upload cancelado pelo usuário (Pause)"));
            } else {
                reject(err);
            }
        } finally {
            activeDownloadController = null;
        }
    });
}
