import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ family: 4 });
const DRIVE_URL = 'https://api.zorobot.shop/drive/api/bot/upload';
const EMAIL = process.env.ZORO_DRIVE_EMAIL || process.env.DRIVE_EMAIL || 'lucaspereirarjcontato@gmail.com';
const PASS = process.env.ZORO_DRIVE_PASSWORD || process.env.DRIVE_PASSWORD || 's1R89fr6QQHcN5Q@qpqV';

/**
 * Upload de Base64 para a Zoro Drive API
 */
export async function uploadBase64ToDrive(base64Data, filename, folderName = null) {
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
            timeout: 15000
        });

        const data = response.data;
        if (data && data.sucesso && data.url) {
            // Força protocolo HTTPS para evitar bloqueio de Mixed Content no navegador
            return data.url.replace(/^http:\/\//i, 'https://');
        } else {
            console.error('[ZORO DRIVE] Resposta sem sucesso:', data);
            return null;
        }
    } catch (err) {
        console.error('[ZORO DRIVE] Erro no uploadBase64:', err.message);
        return null;
    }
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
