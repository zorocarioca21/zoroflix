import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import 'dotenv/config';

// Configurações Pessoais (Copiadas da VPS)
const VPS_URL = process.env.VPS_URL || 'https://cinegeek.shop';
const API_KEY = process.env.API_KEY || 'seu-token-secreto';
const WORKER_ID = 'PC_LOCAL_' + Math.floor(Math.random() * 1000);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '-1003839496993';
const DOWNLOAD_DIR = 'D:\\cinegeek downloads';
const MAX_FOLDER_SIZE_BYTES = 200 * 1024 * 1024 * 1024; // 200 GB max

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function getFolderSizeBytes(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) return 0;
        const files = fs.readdirSync(dirPath);
        let total = 0;
        for (const file of files) {
            try {
                const stats = fs.statSync(path.join(dirPath, file));
                total += stats.size;
            } catch (e) {}
        }
        return total;
    } catch (e) {
        return 0;
    }
}

async function apiRequest(endpoint, body = {}) {
    const res = await fetch(`${VPS_URL}/api/hybrid${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        },
        body: JSON.stringify({ workerId: WORKER_ID, ...body })
    });
    return await res.json();
}

let currentDownload = "---";
let currentUpload = "---";
let lastApiUpdate = 0;

async function reportProgress(taskId, status, progress) {
    if (status === 'Baixando_PC') currentDownload = progress;
    if (status === 'Enviando_Telegram_PC') currentUpload = progress;
    
    // Escreve na mesma linha apagando o que tinha antes, mostrando os dois lado a lado
    process.stdout.write(`\r\x1b[K[⬇️ Baixando: ${currentDownload}%]   |   [⬆️ Enviando: ${currentUpload}%]`);
    
    // Atualiza a VPS a cada 3 segundos pra não floodar a API
    const now = Date.now();
    if (now - lastApiUpdate > 3000) {
        lastApiUpdate = now;
        await apiRequest('/progress', { taskId, status, progress }).catch(()=>{});
    }
}

async function downloadFile(url, destPath, taskId) {
    return new Promise((resolve, reject) => {
        const ffmpegArgs = [
            '-y',
            '-err_detect', 'ignore_err',
            '-fflags', '+genpts+discardcorrupt+igndts',
            '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '-i', url,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            destPath
        ];

        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
        console.log(`🚀 Iniciando download via FFmpeg...`);
        console.log(`[DEBUG FFmpeg] URL: ${url.substring(0, 120)}...`);
        
        let totalDurationSec = 0;
        let fallbackTriggered = false;
        let lastStderr = '';

        ffmpegProcess.stderr.on('data', (data) => {
            const str = data.toString();
            lastStderr = str; // Guarda a última saída de erro para debug

            if (totalDurationSec === 0) {
                const durMatch = str.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d+)/);
                if (durMatch) {
                    totalDurationSec = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                }
            }

            const timeMatch = str.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
            if (timeMatch) {
                const currentSec = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                if (totalDurationSec > 0) {
                    const progress = Math.min((currentSec / totalDurationSec) * 100, 99.9).toFixed(1);
                    reportProgress(taskId, 'Baixando_PC', progress).catch(() => {});
                }
            }
        });

        ffmpegProcess.on('close', (code) => {
            if (code === 0) resolve();
            else {
                if (!fallbackTriggered) {
                    fallbackTriggered = true;
                    console.log(`⚠️ FFmpeg falhou (código ${code}). Último stderr:`);
                    console.log(`[DEBUG FFmpeg STDERR] ${lastStderr.trim().split('\n').slice(-3).join(' | ')}`);
                    console.log(`Tentando via HTTP Nativo...`);
                    fallbackDownloadFetch(url, destPath, taskId).then(resolve).catch(reject);
                }
            }
        });

        ffmpegProcess.on('error', (err) => {
            if (!fallbackTriggered) {
                fallbackTriggered = true;
                console.log(`⚠️ FFmpeg não encontrado ou falhou (${err.message}). Tentando via HTTP Nativo (Fetch)...`);
                fallbackDownloadFetch(url, destPath, taskId).then(resolve).catch(reject);
            }
        });
    });
}

async function fallbackDownloadFetch(url, destPath, taskId) {
    let safeUrl = url;
    try {
        safeUrl = new URL(url).href; // Tenta corrigir espaços ou caracteres inválidos automaticamente
    } catch(e) {}

    let response;
    try {
        response = await fetch(safeUrl, {
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", 
                "Accept": "*/*" 
            },
            redirect: 'follow'
        });
    } catch (fetchErr) {
        throw new Error(`Fetch failed (Rede/URL Inválida): ${fetchErr.cause ? fetchErr.cause.message : fetchErr.message} | URL: ${safeUrl}`);
    }

    if (!response.ok) throw new Error(`Status HTTP ${response.status}`);

    const totalBytes = parseInt(response.headers.get('content-length') || '0', 10);
    let downloadedBytes = 0;
    const fileStream = fs.createWriteStream(destPath);
    let writeError = null;

    fileStream.on('error', (err) => {
        writeError = err;
        try { fs.unlinkSync(destPath); } catch(e){}
    });

    const reader = response.body.getReader();
    let lastEmit = Date.now();

    while (true) {
        if (writeError) {
            reader.cancel();
            throw writeError;
        }

        const { done, value } = await reader.read();
        if (done) break;
        
        downloadedBytes += value.length;
        fileStream.write(value);
        
        if (totalBytes > 0) {
            const now = Date.now();
            if (now - lastEmit > 500) { 
                const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);
                reportProgress(taskId, 'Baixando_PC', progress).catch(() => {});
                lastEmit = now;
            }
        }
    }
    
    fileStream.end();
    if (writeError) throw writeError;
    await new Promise(res => fileStream.on('finish', res));
}

async function optimizeVideo(inputPath, outputPath, taskId) {
    return new Promise((resolve, reject) => {
        reportProgress(taskId, 'Otimizando_Faststart', '---').catch(()=>{});
        console.log(`\n⚙️ Otimizando vídeo para Faststart (Streaming instantâneo)...`);
        
        let lastStderr = '';
        const ffmpegProcess = spawn('ffmpeg', [
            '-y',
            '-err_detect', 'ignore_err',
            '-fflags', '+genpts+discardcorrupt+igndts',
            '-i', inputPath,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            outputPath
        ]);

        ffmpegProcess.stderr.on('data', (data) => {
            lastStderr += data.toString();
        });
        
        ffmpegProcess.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) resolve();
            else {
                reject(new Error(`Falha na otimização FFmpeg (código ${code}). Último erro: ${lastStderr.slice(-300).trim()}`));
            }
        });
        
        ffmpegProcess.on('error', reject);
    });
}

async function uploadToTelegram(filePath, title, taskId) {
    const apiId = parseInt(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH;
    const sessionStr = process.env.TELEGRAM_SESSION;
    
    if (!apiId || !apiHash || !sessionStr) {
        console.error("❌ ERRO: Para enviar arquivos grandes, o TELEGRAM_API_ID, TELEGRAM_API_HASH e TELEGRAM_SESSION precisam estar no arquivo .env");
        throw new Error("Faltam variáveis do Telegram no .env do PC");
    }

    const stringSession = new StringSession(sessionStr);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        useWSS: true,
    });
    
    client.setLogLevel("none");
    await client.connect();

    // Em sessões StringSession, o GramJS não tem cache local dos canais.
    // Precisamos buscar os dialogs uma vez para ele "lembrar" do canal antes de enviar.
    console.log("🔄 Sincronizando chats do Telegram para encontrar o canal...");
    await client.getDialogs();

    let entityId = TELEGRAM_CHANNEL_ID;
    if (!entityId.startsWith('-100')) {
        entityId = '-100' + entityId.replace('-', '');
    }
    // No GramJS, Sessions em string não armazenam cache de entidades, 
    // então precisamos passar o ID como um número exato (BigInt) para forçar o envio direto.
    const finalEntityId = BigInt(entityId);

    let messageId = 0;
    
    try {
        const result = await client.sendFile(finalEntityId, {
            file: filePath,
            workers: 1, 
            caption: `**${title}**`,
            parseMode: "markdown",
            forceDocument: false,
            attributes: [
                new Api.DocumentAttributeVideo({
                    duration: 0,
                    w: 0,
                    h: 0,
                    supportsStreaming: true,
                })
            ],
            progressCallback: (progress) => {
                const p = (progress * 100).toFixed(1);
                reportProgress(taskId, 'Enviando_Telegram_PC', p).catch(()=>{});
            }
        });

        if (result && result.id) {
            messageId = result.id;
        }
    } finally {
        await client.disconnect();
    }
    
    return messageId || Math.floor(Math.random() * 100000);
}

async function uploadLoop() {
    if (isUploading) {
        setTimeout(uploadLoop, 3000);
        return;
    }

    isUploading = true;
    try {
        const files = fs.readdirSync(DOWNLOAD_DIR);
        // Pega todos os arquivos .mp4 prontos (que não estão sendo baixados em .download)
        const mp4Files = files.filter(f => f.endsWith('.mp4'));
        
        if (mp4Files.length > 0) {
            // Mapeia para um array de objetos { taskId, fileName }
            const localTasks = [];
            for (const f of mp4Files) {
                const match = f.match(/_(\d+)\.mp4$/);
                if (match) {
                    localTasks.push({ taskId: parseInt(match[1]), fileName: f });
                }
            }

            if (localTasks.length > 0) {
                // Pergunta pra VPS qual dos arquivos presentes no disco tem a MAIOR prioridade!
                const taskIds = localTasks.map(t => t.taskId);
                const resp = await apiRequest('/checkout-upload', { taskIds }).catch(() => null);
                
                const targetTaskId = (resp && resp.taskId) ? resp.taskId : localTasks[0].taskId;
                const targetObj = localTasks.find(t => t.taskId === targetTaskId) || localTasks[0];
                
                const fileToUpload = targetObj.fileName;
                const taskId = targetObj.taskId;
                const filePath = path.join(DOWNLOAD_DIR, fileToUpload);
                const title = fileToUpload.replace(/_\d+\.mp4$/, '').replace(/_/g, ' ').toUpperCase();
                
                console.log(`\n📤 Iniciando upload de: ${fileToUpload} (Task ID: ${taskId})`);
                const stats = fs.statSync(filePath);
                
                if (stats.size < 1000000) {
                    console.log(`\n⚠️ Arquivo muito pequeno. Excluindo corrompido: ${fileToUpload}`);
                    try { fs.unlinkSync(filePath); } catch(e){}
                } else if (stats.size > 2000 * 1024 * 1024) {
                    // Maior que 2GB (Telegram Free Limit)
                    console.log(`\n🚫 ERRO: O arquivo ${fileToUpload} tem mais de 2GB! Requer Telegram Premium. Excluindo para não travar a fila.`);
                    await apiRequest('/error', { taskId, error_message: "Arquivo maior que 2GB. O envio falhou pois a conta não tem Telegram Premium." }).catch(()=>{});
                    try { fs.unlinkSync(filePath); } catch(e){}
                } else {
                    const messageId = await uploadToTelegram(filePath, title, taskId);
                    console.log(`\n✅ Upload concluído! Avisando a VPS...`);
                    await apiRequest('/complete', { taskId, telegram_message_id: messageId, file_size: stats.size });
                    
                    try { fs.unlinkSync(filePath); } catch(e){}
                }
            }
        }
    } catch (e) {
        console.error("\n❌ Erro no uploadLoop:", e.message);
    } finally {
        isUploading = false;
        setTimeout(uploadLoop, 5000);
    }
}

let isDownloading = false;
let isUploading = false;

async function downloadLoop() {
    if (isDownloading) {
        setTimeout(downloadLoop, 5000);
        return;
    }
    
    isDownloading = true;

    // Checa o tamanho total da pasta de downloads no PC
    const folderSizeBytes = getFolderSizeBytes(DOWNLOAD_DIR);
    if (folderSizeBytes >= MAX_FOLDER_SIZE_BYTES) {
        const folderSizeGB = (folderSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
        process.stdout.write(`\r\x1b[K⚠️ [Limite 200GB Atingido: ${folderSizeGB} GB] Pausando downloads temporariamente... Apenas enviando uploads.`);
        isDownloading = false;
        setTimeout(downloadLoop, 10000); // Re-avalia a cada 10 segundos
        return;
    }

    console.log(`[${WORKER_ID}] Procurando tarefas na VPS...`);
    
    try {
        const response = await apiRequest('/checkout');
        
        if (!response.task) {
            console.log("Nenhuma tarefa disponível. Aguardando...");
            setTimeout(downloadLoop, 10000); // Tenta de novo em 10 segundos
            isDownloading = false;
            return;
        }

        const task = response.task;
        try {
            console.log(`[Nova Tarefa] Filme: ${task.title}`);
            const safeTitle = task.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            
            // Usamos .download enquanto baixa, para o uploadLoop não tentar upar um arquivo incompleto
            const tmpPath = path.join(DOWNLOAD_DIR, `${safeTitle}_${task.id}.mp4.download`);
            const finalPath = path.join(DOWNLOAD_DIR, `${safeTitle}_${task.id}.mp4`);
            
            if (fs.existsSync(finalPath)) {
                console.log(`\n📦 Arquivo já existe no disco aguardando upload. Pulando download...`);
                // O uploadLoop cuidará dele em breve
            } else {
                if (fs.existsSync(tmpPath)) {
                    // Arquivo parcial de um crash anterior, deleta e recomeça
                    try { fs.unlinkSync(tmpPath); } catch(e){}
                }
                
                await downloadFile(task.url, tmpPath, task.id);
                
                // Renomeia para .mp4 para avisar o uploadLoop que está pronto
                if (fs.existsSync(tmpPath)) {
                    const optimizedPath = path.join(DOWNLOAD_DIR, `${safeTitle}_${task.id}.mp4.optimized`);
                    try {
                        // Aplica o Faststart
                        await optimizeVideo(tmpPath, optimizedPath, task.id);
                        // Se otimizou com sucesso, apaga o download bruto e renomeia o otimizado para a fila final
                        fs.unlinkSync(tmpPath);
                        fs.renameSync(optimizedPath, finalPath);
                    } catch (optErr) {
                        console.error(`⚠️ Erro no Faststart: ${optErr.message}. Usando arquivo bruto...`);
                        fs.renameSync(tmpPath, finalPath); // Fallback silencioso pro arquivo bruto
                    }
                    console.log(`\n✅ Download e Otimização Finalizados! Arquivo na fila local de upload.`);
                }
            }
            
        } catch (err) {
            console.error(`\n❌ Erro processando download: ${err.message}`);
            await apiRequest('/error', { taskId: task?.id || 0, error_message: err.message });
        }
        
        isDownloading = false;
        setTimeout(downloadLoop, 2000);
    } catch (e) {
        console.error("Erro ao comunicar com a VPS:", e.message);
        isDownloading = false;
        setTimeout(downloadLoop, 5000);
    }
}

console.log("Iniciando Worker Híbrido Concorrente (Download/Upload paralelos)...");
downloadLoop();
uploadLoop();

// Sistema de Limpeza Automática (Cleanup Loop)
function cleanupLoop() {
    try {
        const files = fs.readdirSync(DOWNLOAD_DIR);
        const now = Date.now();
        for (const file of files) {
            const filePath = path.join(DOWNLOAD_DIR, file);
            const stats = fs.statSync(filePath);
            const hoursOld = (now - stats.mtimeMs) / (1000 * 60 * 60);
            const minutesOld = (now - stats.mtimeMs) / (1000 * 60);
            
            // Se o arquivo tiver mais de 12 horas, apaga para não lotar o HD
            if (hoursOld > 12) {
                console.log(`\n🧹 Limpeza automática: Apagando arquivo velho/abandonado (${file})`);
                try { fs.unlinkSync(filePath); } catch(e){}
            } 
            // Limpeza agressiva: Se o arquivo estiver corrompido (vazio/0KB) e estiver lá parado há mais de 10 minutos
            else if (stats.size < 10000 && minutesOld > 10) {
                console.log(`\n🗑️ Limpeza de Fantasmas: Apagando arquivo corrompido de 0KB (${file})`);
                try { fs.unlinkSync(filePath); } catch(e){}
            }
        }
    } catch(e) {}
    
    // Roda a cada 5 minutos
    setTimeout(cleanupLoop, 5 * 60 * 1000);
}
cleanupLoop();
