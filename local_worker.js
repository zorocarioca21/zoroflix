import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import 'dotenv/config';

// Configurações Pessoais (Copiadas da VPS)
const VPS_URL = 'https://cinegeek.shop';
const API_KEY = 'seu-token-secreto'; // Sem restrição rígida na VPS no momento
const WORKER_ID = 'PC_LOCAL_' + Math.floor(Math.random() * 1000);
const TELEGRAM_BOT_TOKEN = '8772357947:AAEiaxvMEjQL9x-5MqOYSXdkOGuKwpPg350';
const TELEGRAM_CHANNEL_ID = '-1003839496993';
const DOWNLOAD_DIR = 'D:\\cinegeek downloads';

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
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
            '-user_agent', 'VLC/3.0.18 LibVLC/3.0.18',
            '-i', url,
            '-c', 'copy',
            '-movflags', '+faststart',
            destPath
        ];

        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
        console.log(`🚀 Iniciando download via FFmpeg...`);
        
        let totalDurationSec = 0;
        let fallbackTriggered = false;

        ffmpegProcess.stderr.on('data', (data) => {
            const str = data.toString();

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
                    console.log(`⚠️ FFmpeg falhou (código ${code}). Tentando via HTTP Nativo...`);
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
    const response = await fetch(url, {
        headers: { "User-Agent": "VLC/3.0.18 LibVLC/3.0.18", "Accept": "*/*" },
        redirect: 'follow'
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
    await new Promise(res => fileStream.on('finish', res));
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
            workers: 4, 
            caption: `**${title}**`,
            parseMode: "markdown",
            forceDocument: false,
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
        // Busca o primeiro arquivo .mp4 (que já terminou de baixar, pois enquanto baixa é .download)
        const fileToUpload = files.find(f => f.endsWith('.mp4'));
        
        if (fileToUpload) {
            const match = fileToUpload.match(/_(\d+)\.mp4$/);
            if (match) {
                const taskId = parseInt(match[1]);
                const filePath = path.join(DOWNLOAD_DIR, fileToUpload);
                const title = fileToUpload.replace(/_\d+\.mp4$/, '').replace(/_/g, ' ').toUpperCase();
                
                console.log(`\n📤 Iniciando upload de: ${fileToUpload} (Task ID: ${taskId})`);
                const stats = fs.statSync(filePath);
                
                if (stats.size < 1000000) {
                    console.log(`⚠️ Arquivo muito pequeno. Excluindo corrompido: ${fileToUpload}`);
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
                    fs.renameSync(tmpPath, finalPath);
                    console.log(`\n✅ Download Finalizado! Arquivo na fila local de upload.`);
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
uploadLoop();
downloadLoop();
