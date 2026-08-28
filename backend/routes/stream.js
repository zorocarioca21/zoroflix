import express from 'express';
import { getTelegramClient } from '../telegram.js';
import bigInt from "big-integer";
import 'dotenv/config';

const router = express.Router();
const channelId = process.env.TELEGRAM_CHANNEL_ID;

export default function streamRoutes(db) {
    const router = express.Router();

    async function handleStreamRequest(req, res, messageId, overrideTitle = null) {
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

            const inputTitle = overrideTitle || req.query.title;
            const downloadTitle = req.query.download === 'true' && inputTitle ? inputTitle.replace(/[^\w\s-]/g, '') : 'video';
            const originalExt = document.mimeType === 'video/x-matroska' ? 'mkv' : 'mp4';
            const disposition = req.query.download === 'true' ? `attachment; filename="${downloadTitle}.${originalExt}"` : 'inline';
            const mimeType = document.mimeType || 'video/mp4';

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const partialStart = parts[0];
                const partialEnd = parts[1];
                
                if (partialStart === "") {
                    // bytes=-500 (últimos 500 bytes)
                    start = fileSize - parseInt(partialEnd, 10);
                    end = fileSize - 1;
                } else {
                    start = parseInt(partialStart, 10);
                    end = partialEnd ? parseInt(partialEnd, 10) : fileSize - 1;
                }
                
                if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end) {
                    res.status(416).set('Content-Range', `bytes */${fileSize}`).send();
                    return;
                }
                
                res.status(206);
                res.set({
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                    'Content-Type': mimeType,
                    'X-Accel-Buffering': 'no',
                    'Content-Disposition': disposition
                });
            } else {
                res.status(200);
                res.set({
                    'Content-Length': fileSize,
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes',
                    'X-Accel-Buffering': 'no',
                    'Content-Disposition': disposition
                });
            }

            const limit = end - start + 1;
            console.log(`[Stream] Iniciando download. Start: ${start}, End: ${end}, Limit: ${limit}`);

            const chunkSize = 512 * 1024;
            const alignedOffset = Math.floor(start / chunkSize) * chunkSize;
            const skipBytes = start - alignedOffset;
            const fetchLimit = limit + skipBytes;

            // Faz o download da stream
            const iterator = tgClient.iterDownload({
                file: message.media,
                offset: bigInt(alignedOffset), 
                requestSize: chunkSize, 
                limit: fetchLimit
            });

            // Evento se o cliente fechar a conexão
            let isCancelled = false;
            req.on('close', () => {
                console.log(`[Stream] Conexão fechada pelo cliente (cancelado)`);
                isCancelled = true;
            });

            let chunkCount = 0;
            let bytesSent = 0;
            let isFirstChunk = true;

            for await (const chunk of iterator) {
                if (isCancelled) break;
                
                let chunkData = chunk;
                if (isFirstChunk) {
                    chunkData = chunk.slice(skipBytes);
                    isFirstChunk = false;
                }

                chunkCount++;
                
                // Trunca o chunk se ele for ultrapassar o limite requisitado pelo browser
                const remaining = limit - bytesSent;
                const chunkToSend = chunkData.length > remaining ? chunkData.slice(0, remaining) : chunkData;
                
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
    }

    // GET /api/stream/d/:token
    router.get('/d/:token', async (req, res) => {
        try {
            let token = req.params.token;
            
            // Restaura Base64 URL-safe para Base64 normal
            token = token.replace(/-/g, '+').replace(/_/g, '/');
            while (token.length % 4) token += '=';
            
            const textoDecodificado = Buffer.from(token, 'base64').toString('utf-8');
            
            // 2º Passo: Voltar caracteres especiais para letras
            const textoSubstituido = textoDecodificado
                .replace(/§/g, 'a')
                .replace(/¶/g, 'b')
                .replace(/©/g, 'c');
            
            // 3º Passo: Reverter a inversão
            const textoOriginal = textoSubstituido.split('').reverse().join('');
            
            const data = JSON.parse(textoOriginal);
            
            const messageId = parseInt(data.id);
            if (!messageId) return res.status(400).send("Token inválido");

            // Checa a validade (se 'exp' existir no payload)
            if (data.exp && Date.now() > data.exp) {
                return res.status(403).send("Este link expirou. Por favor, solicite um novo link de download.");
            }

            // Força modo de download na rota /d/
            req.query.download = 'true';
            
            await handleStreamRequest(req, res, messageId, data.title);
        } catch (err) {
            console.error("Erro ao decodificar token ofuscado:", err);
            return res.status(400).send("Link de download inválido ou corrompido.");
        }
    });

    // GET /api/stream/s/:token (Secure Stream com Validade)
    router.get('/s/:token', async (req, res) => {
        try {
            // Permite extensão no token (ex: token123.mp4 -> token123)
            let token = req.params.token.split('.')[0];
            
            // Restaura Base64 URL-safe para Base64 normal
            token = token.replace(/-/g, '+').replace(/_/g, '/');
            while (token.length % 4) token += '=';
            
            const textoDecodificado = Buffer.from(token, 'base64').toString('utf-8');
            const textoSubstituido = textoDecodificado.replace(/§/g, 'a').replace(/¶/g, 'b').replace(/©/g, 'c');
            const textoOriginal = textoSubstituido.split('').reverse().join('');
            const data = JSON.parse(textoOriginal);
            
            const messageId = parseInt(data.id);
            if (!messageId) return res.status(400).send("Token de stream inválido");

            // Checa a validade (se 'exp' existir no payload)
            if (data.exp && Date.now() > data.exp) {
                return res.status(403).send("Este link expirou. Por favor, solicite um novo link.");
            }

            // Proteção avançada contra acesso direto (Hotlink/Script/Navegador direto)
            if (!data.app) {
                const fetchSite = req.headers['sec-fetch-site']; // 'same-origin', 'same-site', 'cross-site', 'none'
                const referer = req.headers.referer || req.headers.origin;

                if (fetchSite) {
                    // Sec-Fetch-Site é suportado por todos os navegadores modernos.
                    // 'none': Usuário colou o link na barra de endereços ou usou um gerenciador de downloads.
                    // 'cross-site': Alguém tentou colocar a URL direto numa tag <video> em outro site.
                    if (fetchSite === 'cross-site' || fetchSite === 'none') {
                        return res.status(403).send("Acesso negado. Hotlink e reprodução direta bloqueados.");
                    }
                } else {
                    // Fallback para navegadores muito antigos ou scripts obscuros
                    if (!referer || (!referer.includes('cinegeek.shop') && !referer.includes('localhost'))) {
                        return res.status(403).send("Acesso negado. Link protegido contra download direto.");
                    }
                }
            }
            
            await handleStreamRequest(req, res, messageId, data.title);
        } catch (err) {
            console.error("Erro ao decodificar token de stream:", err);
            return res.status(403).send("Acesso negado. Token corrompido ou inválido.");
        }
    });

    return router;
}
