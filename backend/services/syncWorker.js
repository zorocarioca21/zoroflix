import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import readline from 'readline';
import https from 'https';

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
    startAutoCleanup();
    startAutoM3uSync();
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
    while (true) {
        if (isPaused) {
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        // Verifica o espaço atual ocupado antes de iniciar o download
        let hasSpace = false;
        while (!isPaused) {
            const row = await dbInstance.get("SELECT SUM(file_size) as total FROM sync_queue WHERE status IN ('pending_upload', 'uploading')");
            const totalUsed = row ? (row.total || 0) : 0;
            const LIMIT = 50 * 1024 * 1024 * 1024; // 50 GB
            
            if (totalUsed < LIMIT) {
                hasSpace = true;
                break;
            }
            
            downloadTask = { id: 'N/A', title: 'PAUSADO: LIMITE 50GB ATINGIDO', progress: 'WAITING_SPACE' };
            broadcastState();
            
            await new Promise(r => setTimeout(r, 15000)); // Checa a cada 15 segundos
        }

        if (!hasSpace || isPaused || uploadTaskPython !== null) {
            if (uploadTaskPython !== null) {
                downloadTask = { id: 'N/A', title: 'AGUARDANDO UPLOAD PYTHON', progress: 'ESPERANDO...' };
                broadcastState();
            }
            await new Promise(r => setTimeout(r, 5000));
            continue;
        }

        // Busca o próximo item pendente (priorizando os com priority > 0)
        const nextItem = await dbInstance.get("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY priority DESC, id ASC LIMIT 1");
        
        if (!nextItem) {
            // Se não tem mais nada pra baixar, aguarda um pouco e tenta de novo
            downloadTask = null;
            broadcastState();
            await new Promise(r => setTimeout(r, 10000));
            continue;
        }

        // Marcar como downloading
        await dbInstance.run("UPDATE sync_queue SET status = 'downloading' WHERE id = ?", [nextItem.id]);

        try {
            // Executa a tarefa de download (Fica travado aqui até o DOWNLOAD deste item terminar)
            await processDownload(nextItem);
        } catch (err) {
            console.error(`Erro no loop de download ao processar ${nextItem.title}:`, err);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

// ==========================================
// LOOP 2: CONSUMIDOR (Envia arquivos para o Telegram)
// ==========================================

async function uploadLoop() {
    while (!isPaused) {
        try {
            // Busca o próximo item pronto para ser enviado (pending_upload), priorizando prioridades altas
            const item = await dbInstance.get("SELECT id, title, url FROM sync_queue WHERE status = 'pending_upload' ORDER BY priority DESC, id ASC LIMIT 1");
            
            if (!item) {
                // Se não tem nada para upar, dorme 5 segundos e tenta de novo
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            // Tem item! Processa o upload.
            // Para decidir se é docker ou python, olhamos o tamanho
            const safeTitle = item.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const safeId = String(item.id).replace(/[^a-z0-9]/gi, '_');
            const rawExt = item.url.split('?')[0].split('.').pop();
            const ext = (rawExt && rawExt.length <= 4 && /^[a-z0-9]+$/i.test(rawExt)) ? rawExt : 'mp4';
            const tmpPath = path.join(os.tmpdir(), `${safeTitle}_${safeId}.${ext}`);
            
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
    const safeId = String(movie.id).replace(/[^a-z0-9]/gi, '_');
    const rawExt = movie.url.split('?')[0].split('.').pop();
    const ext = (rawExt && rawExt.length <= 4 && /^[a-z0-9]+$/i.test(rawExt)) ? rawExt : 'mp4';
    const tmpPath = path.join(os.tmpdir(), `${safeTitle}_${safeId}.${ext}`);

    try {
        await dbInstance.run("UPDATE sync_queue SET status = 'downloading', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
        
        downloadTask = { id: movie.id, title: movie.title, progress: 0 };
        broadcastState();
        
        await downloadFile(movie.url, tmpPath, movie.id);
        
        if (isPaused) return false; 

        const stats = fs.statSync(tmpPath);
        const fileSize = stats.size;
        const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
        
        console.log(`[Download] ✅ Concluído: "${movie.title}" | Tamanho: ${fileSizeMB} MB | Arquivo: ${tmpPath}`);
        
        if (fileSize === 0) {
            try { fs.unlinkSync(tmpPath); } catch (e) {}
            throw new Error('O arquivo baixado tem 0 bytes (provável erro 404/indisponível na IPTV).');
        }

        // Verificação de integridade com ffprobe
        let videoDuration = 0;
        try {
            const ffprobeResult = await new Promise((resolve, reject) => {
                const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', tmpPath]);
                let output = '';
                proc.stdout.on('data', d => output += d.toString());
                proc.stderr.on('data', d => {}); // Ignora avisos
                proc.on('close', code => {
                    if (code === 0 && output.trim()) resolve(output.trim());
                    else reject(new Error(`ffprobe falhou (code ${code})`));
                });
                proc.on('error', () => reject(new Error('ffprobe não instalado')));
            });
            videoDuration = parseFloat(ffprobeResult) || 0;
            console.log(`[Download] 🔍 ffprobe validou: duração = ${videoDuration}s`);
        } catch (probeErr) {
            console.warn(`[Download] ⚠️ ffprobe não conseguiu validar o arquivo: ${probeErr.message}`);
        }

        // Finaliza download: altera para pending_upload para que o loop 2 assuma
        // Salvamos a duração no erro_message apenas temporariamente para o upload recuperar, ou não precisamos pois o upload extrai.
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
    const safeId = String(movie.id).replace(/[^a-z0-9]/gi, '_');
    const rawExt = movie.url.split('?')[0].split('.').pop();
    const ext = (rawExt && rawExt.length <= 4 && /^[a-z0-9]+$/i.test(rawExt)) ? rawExt : 'mp4';
    const tmpPath = path.join(os.tmpdir(), `${safeTitle}_${safeId}.${ext}`);

    try {
        if (!fs.existsSync(tmpPath)) {
            console.log(`[Upload] ❌ Arquivo não encontrado: ${tmpPath}`);
            await dbInstance.run("UPDATE sync_queue SET status = 'pending', error_message = 'Arquivo temp não encontrado. Rebaixando.', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
            return true; 
        }
        
        const uploadStats = fs.statSync(tmpPath);
        console.log(`[Upload] 📤 Iniciando upload: "${movie.title}" | Método: ${workerType} | Tamanho: ${(uploadStats.size / (1024*1024)).toFixed(2)} MB | Arquivo: ${tmpPath}`);
        
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
            await dbInstance.run("UPDATE sync_queue SET status = 'completed', priority = 0, telegram_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [messageId, movie.id]);
        } else {
            await dbInstance.run("UPDATE sync_queue SET status = 'completed', priority = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [movie.id]);
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
        console.log(`[FFmpeg] 🚀 Iniciando download via FFmpeg: ${url}`);
        
        let totalDurationSec = 0;
        let lastActivity = Date.now();

        const watchdog = setInterval(() => {
            if (Date.now() - lastActivity > 60000) { // 60 segundos sem receber dados
                console.warn(`[FFmpeg] ⚠️ Timeout detectado! Nenhuma resposta por 60s. Matando processo...`);
                ffmpegProcess.kill('SIGKILL');
            }
        }, 10000); // checa a cada 10s

        ffmpegProcess.stderr.on('data', (data) => {
            lastActivity = Date.now();
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
            clearInterval(watchdog);
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
        
        let duration = 0;
        let width = 1280;
        let height = 720;
        
        // Tenta extrair metadados para forçar no payload do Telegram
        try {
            const ffprobeResult = await new Promise((resolve) => {
                const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
                let output = '';
                proc.stdout.on('data', d => output += d.toString());
                proc.on('close', code => {
                    if (code === 0) resolve(output.trim().split('\n'));
                    else resolve([]);
                });
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
            caption: `<b>${title}</b>`,
            parse_mode: 'HTML',
            supports_streaming: true,
            duration: duration || undefined,
            width: width || undefined,
            height: height || undefined
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

// ==========================================
// ROTINA DE LIMPEZA AUTOMÁTICA DE CACHE
// ==========================================
function startAutoCleanup() {
    setInterval(async () => {
        try {
            if (isPaused) return; // Não apaga se o worker inteiro estiver pausado, por segurança
            
            const tempPath = os.tmpdir();
            const files = await fs.promises.readdir(tempPath);
            
            // Busca os IDs que estão ativos (baixando ou enviando)
            const activeJobs = await dbInstance.all("SELECT id FROM sync_queue WHERE status IN ('downloading', 'pending_upload', 'uploading', 'processing')");
            const activeIds = activeJobs.map(job => job.id.toString());

            for (const file of files) {
                const match = file.match(/_(\d+)\.(mp4|mkv|avi|webm)$/i);
                if (match) {
                    const fileId = match[1];
                    // Se o arquivo NÃO está na lista de ativos, apaga
                    if (!activeIds.includes(fileId)) {
                        const filePath = path.join(tempPath, file);
                        try {
                            const stats = await fs.promises.stat(filePath);
                            // Se faz mais de 5 minutos que o arquivo não é modificado (segurança extra)
                            if (Date.now() - stats.mtimeMs > 5 * 60 * 1000) {
                                await fs.promises.unlink(filePath);
                                console.log(`[Auto-Cleanup] Arquivo órfão apagado da /tmp/: ${file}`);
                            }
                        } catch (err) {}
                    }
                }
            }
        } catch (err) {
            console.error("[Auto-Cleanup] Erro na rotina de limpeza:", err);
        }
    }, 30000); // 30 segundos
}

// ==========================================
// ROTINA DE ATUALIZAÇÃO AUTOMÁTICA DA M3U
// ==========================================
function startAutoM3uSync() {
    // 3600000 = 1 hora
    setInterval(() => {
        if (isPaused) return;
        const m3uUrl = 'https://kixar.xyz/get.php?username=zorocarioca21&password=rf1st91a&type=m3u_plus&output=ts';
        console.log("[AutoSync] Iniciando varredura remota M3U automática (1h)...");
        let movies = [];
        let currentTitle = null;

        https.get(m3uUrl, (response) => {
            if (response.statusCode !== 200) {
                console.error(`[AutoSync] Erro HTTP ${response.statusCode} ao tentar baixar o M3U.`);
                return;
            }
            const rl = readline.createInterface({ input: response, crlfDelay: Infinity });

            rl.on('line', (line) => {
                const trimmed = line.trim();
                if (trimmed.startsWith('#EXTINF')) {
                    const match = trimmed.match(/,(.+)/);
                    if (match) currentTitle = match[1].trim();
                } else if (trimmed.startsWith('http') && currentTitle) {
                    movies.push({ title: currentTitle, url: trimmed });
                    currentTitle = null;
                }
            });

            rl.on('close', async () => {
                try {
                    let insertedCount = 0;
                    for (const movie of movies) {
                        const result = await dbInstance.run(
                            "INSERT INTO sync_queue (title, url, status, priority) SELECT ?, ?, 'pending', 500 WHERE NOT EXISTS (SELECT 1 FROM sync_queue WHERE url = ?) AND NOT EXISTS (SELECT 1 FROM sync_queue WHERE title = ?)",
                            [movie.title, movie.url, movie.url, movie.title]
                        );
                        if (result.changes > 0) insertedCount++;
                    }
                    if (insertedCount > 0) {
                        console.log(`[AutoSync] Varredura remota concluída! ${insertedCount} novos itens adicionados à fila de pendentes.`);
                    } else {
                        console.log(`[AutoSync] Varredura remota concluída. Nenhum item novo encontrado no momento.`);
                    }
                } catch (dbErr) {
                    console.error("[AutoSync] Erro ao salvar no banco:", dbErr);
                }
            });
        }).on('error', (err) => {
            console.error("[AutoSync] Falha ao tentar conectar na URL M3U:", err);
        });
    }, 3600000);
}
