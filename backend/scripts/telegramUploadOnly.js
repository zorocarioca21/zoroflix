import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import fs from "fs";
import 'dotenv/config';

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionStr = process.env.TELEGRAM_SESSION;
const channelId = process.env.TELEGRAM_CHANNEL_ID;

if (!apiId || !apiHash || !sessionStr || !channelId) {
    console.error("Faltam variáveis no .env");
    process.exit(1);
}

const stringSession = new StringSession(sessionStr);

(async () => {
    const filePath = process.argv[2];
    if (!filePath || !fs.existsSync(filePath)) {
        console.error("Uso: node telegramUploadOnly.js /caminho/do/arquivo.mp4");
        process.exit(1);
    }

    console.log("Conectando ao Telegram...");
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 10,
    });
    
    client.setLogLevel("none");
    await client.connect();
    console.log("Conectado! Iniciando upload de", filePath);

    let entityId = channelId;
    if (!entityId.startsWith('-100')) {
        entityId = '-100' + entityId.replace('-', '');
    }

    try {
        await client.sendFile(entityId, {
            file: filePath,
            workers: 1, // Usando 1 worker para garantir 100% de estabilidade no teste
            caption: `**Upload Manual**\n${filePath}`,
            parseMode: "markdown",
            progressCallback: (progress) => {
                process.stdout.write(`\rUpload progresso: ${(progress * 100).toFixed(2)}%`);
            }
        });
        
        process.stdout.write('\n');
        console.log("Upload concluído com sucesso pro Canal!");
    } catch (err) {
        console.error("Erro no upload:", err);
    } finally {
        process.exit(0);
    }
})();
