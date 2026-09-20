import fs from 'fs';
import path from 'path';

const DRIVE_URL = 'https://api.zorobot.shop/drive/api/bot/upload';
const EMAIL = process.env.DRIVE_EMAIL || 'sharminou@gmail.com';
const PASS = process.env.DRIVE_PASSWORD || 'FA3Genh*egz7ww&yF8xN';

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

        const response = await fetch(DRIVE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            if (data && data.sucesso && data.url) {
                return data.url;
            } else {
                console.error('[ZORO DRIVE] Resposta sem sucesso:', data);
                return null;
            }
        } else {
            const text = await response.text();
            console.error(`[ZORO DRIVE] Resposta não-JSON (${response.status}):`, text.substring(0, 150));
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

        const res = await fetch(url);
        if (!res.ok) {
            console.error(`[ZORO DRIVE] Falha ao baixar URL remota (${res.status}): ${url}`);
            return null;
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
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
