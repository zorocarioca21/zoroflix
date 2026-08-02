import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram";
import { CustomFile } from "telegram/client/uploads.js";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import 'dotenv/config';
import os from "os";
import readline from "readline";

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionStr = process.env.TELEGRAM_SESSION;
const channelId = process.env.TELEGRAM_CHANNEL_ID;

if (!apiId || !apiHash || !sessionStr || !channelId) {
    console.error("Faltam variáveis no .env (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, TELEGRAM_CHANNEL_ID)");
    process.exit(1);
}

const stringSession = new StringSession(sessionStr);

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        console.log(`Baixando IPTV -> ${url} ...`);
        
        const client = url.startsWith('https:') ? https : http;
        
        client.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                 // handle redirect if needed (basic)
                 return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                return reject(new Error(`Falha no download. Status: ${response.statusCode}`));
            }
            
            const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
            let downloadedBytes = 0;
            
            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                const percent = totalBytes ? ((downloadedBytes / totalBytes) * 100).toFixed(2) : '?';
                process.stdout.write(`\rDownload progresso: ${percent}% (${(downloadedBytes/1024/1024).toFixed(2)} MB)`);
            });

            response.pipe(file);
            
            file.on('finish', () => {
                process.stdout.write('\n');
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {}); // apaga o arquivo em caso de erro
            reject(err);
        });
    });
}

function parseM3uAndSearch(filePath, query) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let results = [];
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF')) {
            const titleMatch = lines[i].match(/,(.+)/);
            if (titleMatch && titleMatch[1].toLowerCase().includes(query.toLowerCase())) {
                const url = lines[i + 1] ? lines[i + 1].trim() : null;
                if (url && url.startsWith('http')) {
                    results.push({
                        title: titleMatch[1].trim(),
                        url: url
                    });
                }
            }
        }
    }
    return results;
}

(async () => {
    const searchTerm = process.argv[2];
    if (!searchTerm) {
        console.error("Uso: node telegramUploader.js \"NOME DO FILME\"");
        process.exit(1);
    }

    console.log("Conectando ao Telegram...");
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });
    
    await client.connect();
    console.log("Conectado com sucesso ao Telegram!");

    console.log(`Buscando por "${searchTerm}" no iptv_list.m3u...`);
    
    // Caminho da lista IPTV resolvido via import.meta.url para evitar bugs do cwd
    const scriptDir = path.dirname(new URL(import.meta.url).pathname);
    // No linux import.meta.url.pathname começa com /, no windows começa com /C:/
    const m3uPath = path.join(scriptDir, '..', '..', 'iptv_list.m3u'); 
    
    // Fallback absoluto via cwd
    const m3uPath2 = path.join(process.cwd(), 'iptv_list.m3u'); 
    
    let filePathToUse = null;
    if (fs.existsSync(m3uPath)) filePathToUse = m3uPath;
    else if (fs.existsSync(m3uPath2)) filePathToUse = m3uPath2;
    
    if (!filePathToUse) {
         console.error("Arquivo iptv_list.m3u não encontrado! Verifique se ele está na pasta raiz do zoroflix e com esse nome exato.");
         console.log("Caminhos procurados:");
         console.log("1:", m3uPath);
         console.log("2:", m3uPath2);
         process.exit(1);
    }
    
    const results = parseM3uAndSearch(filePathToUse, searchTerm);
    
    if (results.length === 0) {
        console.log("Nenhum filme encontrado com esse nome na lista IPTV.");
        process.exit(0);
    }
    
    console.log(`\nEncontrados ${results.length} resultados:`);
    results.forEach((r, idx) => console.log(`[${idx}] ${r.title}`));
    
    // Configura readline pra perguntar qual baixar
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(`\nDigite o número do arquivo que deseja baixar e upar pro Telegram (0 a ${results.length - 1}): `, async (answer) => {
        const choice = parseInt(answer);
        if (isNaN(choice) || choice < 0 || choice >= results.length) {
            console.log("Escolha inválida.");
            process.exit(1);
        }
        
        const selected = results[choice];
        console.log(`\nVocê escolheu: ${selected.title}`);
        
        // Define pasta temporária
        const tmpDir = os.tmpdir();
        const extension = selected.url.split('?')[0].split('.').pop() || 'mp4';
        const safeTitle = selected.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const destPath = path.join(tmpDir, `${safeTitle}.${extension}`);
        
        try {
            // Fase 1: Baixar
            await downloadFile(selected.url, destPath);
            console.log("Download concluído com sucesso!");
            
            // Fase 2: Upload para o Telegram
            console.log("Iniciando Upload para o Canal do Telegram...");
            
            // Corrige ID do canal (O Telegram precisa que seja BigInt no gram.js)
            let entityId = channelId;
            if (!entityId.startsWith('-100')) {
                entityId = '-100' + entityId.replace('-', '');
            }

            await client.sendFile(entityId, {
                file: destPath,
                caption: `**${selected.title}**\nUpload via Zoroflix Bot`,
                parseMode: "markdown",
                progressCallback: (progress) => {
                    process.stdout.write(`\rUpload progresso: ${(progress * 100).toFixed(2)}%`);
                }
            });
            
            process.stdout.write('\n');
            console.log("Upload concluído com sucesso pro Canal!");
            
            // Fase 3: Limpar VPS
            console.log("Apagando arquivo da VPS para liberar espaço...");
            fs.unlinkSync(destPath);
            console.log("Processo Finalizado com Sucesso! 🎉");
            
        } catch (err) {
            console.error("Ocorreu um erro:", err);
        } finally {
            rl.close();
            process.exit(0);
        }
    });

})();
