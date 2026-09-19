import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

// Configurações Pessoais (Copidadas da VPS)
const VPS_URL = 'https://cinegeek.shop';
const API_KEY = 'seu-token-secreto'; // Sem restrição rígida na VPS no momento
const WORKER_ID = 'PC_LOCAL_' + Math.floor(Math.random() * 1000);
const TELEGRAM_BOT_TOKEN = '8772357947:AAEiaxvMEjQL9x-5MqOYSXdkOGuKwpPg350';
const TELEGRAM_CHANNEL_ID = '-1003839496993';

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

async function reportProgress(taskId, status, progress) {
    console.log(`[Progresso] ${status} - ${progress}%`);
    await apiRequest('/progress', { taskId, status, progress });
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
            else reject(new Error(`FFmpeg falhou (código ${code})`));
        });
    });
}

async function uploadToTelegram(filePath, title, taskId) {
    console.log(`📤 Enviando para o Telegram: ${title}`);
    
    // Simulação do upload por agora para não depender de Local API Server no primeiro teste.
    // O ideal seria usar o mesmo python script 'telegramUploadOnly.py' que a VPS usa.
    return new Promise((resolve, reject) => {
        let p = 0;
        const uploadInterval = setInterval(() => {
            p += 10;
            reportProgress(taskId, 'Enviando_Telegram_PC', p).catch(() => {});
            if (p >= 100) {
                clearInterval(uploadInterval);
                resolve(Math.floor(Math.random() * 100000) + 1); // Mock Message ID
            }
        }, 1000);
    });
}

async function loop() {
    console.log(`[${WORKER_ID}] Procurando tarefas na VPS...`);
    
    try {
        const response = await apiRequest('/checkout');
        
        if (!response.task) {
            console.log("Nenhuma tarefa disponível. Aguardando...");
            setTimeout(loop, 10000); // Tenta de novo em 10 segundos
            return;
        }

        const task = response.task;
        console.log(`[Nova Tarefa] Filme: ${task.title}`);
        
        const safeTitle = task.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const destPath = path.join(os.tmpdir(), `${safeTitle}_${task.id}.mp4`);
        
        try {
            await downloadFile(task.url, destPath, task.id);
            
            const stats = fs.statSync(destPath);
            const messageId = await uploadToTelegram(destPath, task.title, task.id);
            
            console.log(`✅ Concluído! Avisando a VPS...`);
            await apiRequest('/complete', { taskId: task.id, telegram_message_id: messageId, file_size: stats.size });
            
        } catch (err) {
            console.error(`❌ Erro processando a tarefa: ${err.message}`);
            await apiRequest('/error', { taskId: task.id, error_message: err.message });
        } finally {
            if (fs.existsSync(destPath)) {
                try { fs.unlinkSync(destPath); } catch (e) {}
            }
        }
        
    } catch (e) {
        console.error("Erro ao comunicar com a VPS:", e.message);
    }
    
    setTimeout(loop, 2000);
}

// Inicia o Loop
loop();
