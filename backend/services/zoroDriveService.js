import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ family: 4 });
const DRIVE_URL = 'https://api.zorobot.shop/drive/api/bot/upload';
const EMAIL = process.env.ZORO_DRIVE_EMAIL || process.env.DRIVE_EMAIL || 'lucaspereirarjcontato@gmail.com';
const PASS = process.env.ZORO_DRIVE_PASSWORD || process.env.DRIVE_PASSWORD || 's1R89fr6QQHcN5Q@qpqV';

// Fila Sequencial Assíncrona (1 upload por vez com delay entre envios para não sobrecarregar o Cloudflare/Zoro Drive)
class UploadQueue {
    constructor() {
        this.queue = [];
        this.running = false;
        this.DELAY_MS = 600; // 600ms entre uploads
    }

    push(taskFn) {
        return new Promise((resolve) => {
            this.queue.push({ taskFn, resolve });
            this.process();
        });
    }

    async process() {
        if (this.running) return;
        this.running = true;

        while (this.queue.length > 0) {
            const { taskFn, resolve } = this.queue.shift();
            try {
                const result = await taskFn();
                resolve(result);
            } catch (err) {
                console.error('[ZORO DRIVE QUEUE] Erro na execução da tarefa:', err.message);
                resolve(null);
            }
            if (this.queue.length > 0) {
                await new Promise(r => setTimeout(r, this.DELAY_MS));
            }
        }

        this.running = false;
    }
}

const driveQueue = new UploadQueue();

/**
 * Upload de Base64 para a Zoro Drive API (Executado via Fila Sequencial)
 */
export async function uploadBase64ToDrive(base64Data, filename, folderName = null) {
    return driveQueue.push(async () => {
        let retries = 2;
        while (retries >= 0) {
            try {
                const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');

                const payload = {
                    email: EMAIL,
                    password: PASS,
                    nome_arquivo: filename,
                    arquivo_base64: cleanBase64
                };

                if (folderName) payload.folder_name = folderName;

                const response = await axios.post(DRIVE_URL, payload, {
                    headers: { 'Content-Type': 'application/json' },
                    httpsAgent: agent,
                    maxBodyLength: Infinity,
                    timeout: 45000
                });

                const data = response.data;
                if (data && data.sucesso && data.url) {
                    return data.url.replace(/^http:\/\//i, 'https://');
                } else {
                    console.error('[ZORO DRIVE] Resposta sem sucesso:', data);
                    return null;
                }
            } catch (err) {
                retries--;
                if (retries >= 0) {
                    console.warn(`[ZORO DRIVE] Falha (${err.message}). Tentando novamente em 1.5s...`);
                    await new Promise(r => setTimeout(r, 1500));
                } else {
                    console.error('[ZORO DRIVE] Erro no uploadBase64 após tentativas:', err.message);
                    return null;
                }
            }
        }
        return null;
    });
}

/**
 * Upload de Buffer para a Zoro Drive API
 */
export async function uploadBufferToDrive(buffer, filename, folderName = null) {
    const base64Data = buffer.toString('base64');
    return await uploadBase64ToDrive(base64Data, filename, folderName);
}

/**
 * Upload de arquivo local para a Zoro Drive API
 */
export async function uploadLocalFileToDrive(filePath, folderName = null) {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`[ZORO DRIVE] Arquivo local não encontrado: ${filePath}`);
            return null;
        }
        const buffer = fs.readFileSync(filePath);
        const filename = path.basename(filePath);
        return await uploadBufferToDrive(buffer, filename, folderName);
    } catch (err) {
        console.error('[ZORO DRIVE] Erro ao carregar arquivo local:', err.message);
        return null;
    }
}

/**
 * Baixa uma URL remota (ex: imagem do TMDB ou avatar externo) e faz upload direto para o Zoro Drive
 */
export async function uploadRemoteUrlToDrive(url, folderName = null, customFileName = null) {
    try {
        if (!url || typeof url !== 'string') return null;
        
        if (url.includes('zorobot.shop/drive/f/')) return url;

        const res = await axios.get(url, { responseType: 'arraybuffer', httpsAgent: agent, timeout: 15000 });
        if (res.status !== 200) {
            console.error(`[ZORO DRIVE] Falha ao baixar URL remota (${res.status}): ${url}`);
            return null;
        }

        const buffer = Buffer.from(res.data);
        let filename = customFileName;
        if (!filename) {
            const urlPath = new URL(url).pathname;
            filename = path.basename(urlPath);
            if (!filename || filename === '/') filename = `file_${Date.now()}.jpg`;
        }

        return await uploadBufferToDrive(buffer, filename, folderName);
    } catch (err) {
        console.error(`[ZORO DRIVE] Erro ao espelhar URL remota (${url}):`, err.message);
        return null;
    }
}
