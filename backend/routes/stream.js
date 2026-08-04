import express from 'express';
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import bigInt from "big-integer";
import 'dotenv/config';

const router = express.Router();

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionStr = process.env.TELEGRAM_SESSION;
const channelId = process.env.TELEGRAM_CHANNEL_ID;

let client = null;
let clientConnecting = false;
let clientConnected = false;

// Inicializa o cliente do Telegram como Singleton
async function getTelegramClient() {
    if (clientConnected) return client;
    if (clientConnecting) {
        // Aguarda conectar
        while (!clientConnected) {
            await new Promise(r => setTimeout(r, 500));
        }
        return client;
    }

    clientConnecting = true;
    try {
        const stringSession = new StringSession(sessionStr);
        client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
        });
        client.setLogLevel("none");
        await client.connect();
        
        // Carrega os diálogos para popular o cache de entidades do GramJS
        // Evita o erro: Could not find the input entity for {"channelId":"..."}
        try {
            await client.getDialogs({});
        } catch (e) {
            console.log("Aviso: Falha ao carregar dialogos", e);
        }

        clientConnected = true;
        console.log("Cliente GramJS conectado para Streaming!");
    } catch (e) {
        console.error("Erro ao conectar GramJS:", e);
    } finally {
        clientConnecting = false;
    }
    return client;
}

export default function streamRoutes(db) {
    const router = express.Router();

    // GET /api/stream/telegram/:message_id
    router.get('/telegram/:message_id', async (req, res) => {
        const messageId = parseInt(req.params.message_id);
        if (!messageId) return res.status(400).send("Message ID inválido");

        const tgClient = await getTelegramClient();
        if (!tgClient) return res.status(500).send("Erro interno ao conectar ao Telegram");

        try {
            let entityId = channelId;
            if (!entityId.startsWith('-100')) {
                entityId = '-100' + entityId.replace('-', '');
            }

            console.log(`[Stream] Buscando mensagem ${messageId} na entidade ${entityId}...`);
            
            // Busca a mensagem (força BigInt para canais se possível)
            let resolvedEntity;
            try {
                resolvedEntity = await tgClient.getInputEntity(entityId);
                console.log("[Stream] Entidade resolvida com sucesso!");
            } catch (e) {
                console.log("[Stream] Aviso: getInputEntity falhou (normal se for string direta). Tentando direto...");
                resolvedEntity = entityId; // Fallback
            }

            const result = await tgClient.getMessages(resolvedEntity, { ids: messageId });
            console.log(`[Stream] Busca concluída. Resultado: ${result ? result.length : 'null'}`);

            if (!result || result.length === 0 || !result[0] || result[0].className === "MessageEmpty") {
                console.log(`[Stream] ERRO: Mensagem ${messageId} não encontrada no Telegram. Isso pode ser falha de cache do GramJS ou a mensagem foi apagada.`);
                return res.status(404).send("Mensagem não encontrada");
            }

            const message = result[0];
            if (!message.media || !message.media.document) {
                console.log(`[Stream] ERRO: Mensagem ${messageId} não contém um documento de vídeo.`);
                return res.status(404).send("A mensagem não contém um documento de vídeo");
            }

        const document = message.media.document;
        console.log(`[Stream] Documento encontrado! Tamanho: ${document.size}`);
        const fileSize = document.size.toJSNumber ? document.size.toJSNumber() : Number(document.size);

        // Suporte a Range Headers (Essencial para o player de vídeo pular partes)
        const range = req.headers.range;
        
        let start = 0;
        let end = fileSize - 1;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            start = parseInt(parts[0], 10);
            end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            
            if (start >= fileSize || end >= fileSize) {
                res.status(416).set('Content-Range', `bytes */${fileSize}`).send();
                return;
            }
            
            res.status(206);
            res.set({
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': end - start + 1,
                'Content-Type': 'video/mp4',
                'X-Accel-Buffering': 'no'
            });
        } else {
            res.status(200);
            res.set({
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
                'Accept-Ranges': 'bytes',
                'X-Accel-Buffering': 'no'
            });
        }

        const limit = end - start + 1;
        console.log(`[Stream] Iniciando download. Start: ${start}, End: ${end}, Limit: ${limit}`);

        // Faz o download da stream
        const iterator = tgClient.iterDownload({
            file: message.media,
            offset: bigInt(start), 
            requestSize: 512 * 1024, 
            limit: limit
        });

        // Evento se o cliente fechar a conexão
        let isCancelled = false;
        req.on('close', () => {
            console.log(`[Stream] Conexão fechada pelo cliente (cancelado)`);
            isCancelled = true;
        });

        let chunkCount = 0;
        let bytesSent = 0;
        for await (const chunk of iterator) {
            if (isCancelled) break;
            
            chunkCount++;
            
            // Trunca o chunk se ele for ultrapassar o limite requisitado pelo browser
            const remaining = limit - bytesSent;
            const chunkToSend = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
            
            bytesSent += chunkToSend.length;
            
            if (chunkCount === 1) console.log(`[Stream] Primeiro chunk recebido! Tamanho original: ${chunk.length}, Enviado: ${chunkToSend.length}`);
            
            // Grava o pedaço no buffer HTTP
            const canWrite = res.write(chunkToSend);
            if (!canWrite) {
                // Aguarda o drain se o buffer estiver cheio
                await new Promise(resolve => res.once('drain', resolve));
            }
            
            if (bytesSent >= limit) break;
        }
        
        console.log(`[Stream] Fim da stream. Chunks enviados: ${chunkCount}, isCancelled: ${isCancelled}`);

        if (!isCancelled) {
            res.end();
        }

    } catch (err) {
        console.error("Erro no stream:", err);
        if (!res.headersSent) {
            res.status(500).send("Erro interno ao transmitir");
        }
    }
});

return router;
}
