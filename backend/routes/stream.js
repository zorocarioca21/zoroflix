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
            const mimeType = document.mimeType || 'video/mp4';
            const fileNameAttr = document.attributes?.find(attr => attr.className === 'DocumentAttributeFilename');
            const fileName = fileNameAttr ? fileNameAttr.fileName : 'desconhecido.mp4';
            
            console.log(`[Stream] Documento encontrado! Tamanho: ${document.size} | Nome: ${fileName} | Mime: ${mimeType} (Via Worker Pool)`);
            const fileSize = document.size.toJSNumber ? document.size.toJSNumber() : Number(document.size);

            // Suporte a Range Headers (Essencial para o player de vídeo pular partes)
            const range = req.headers.range;
            
            let start = 0;
            let end = fileSize - 1;

            const inputTitle = overrideTitle || req.query.title;
            const downloadTitle = req.query.download === 'true' && inputTitle ? inputTitle.replace(/[^\w\s-]/g, '') : 'video';
            const originalExt = document.mimeType === 'video/x-matroska' ? 'mkv' : 'mp4';
            const disposition = req.query.download === 'true' ? `attachment; filename="${downloadTitle}.${originalExt}"` : 'inline';

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

            // Anti-Flood para Celulares (Safari/Chrome Mobile):
            // Navegadores de celular disparam 3 a 5 requisições Range falsas e fecham na mesma hora 
            // só para testar o arquivo. Esperamos 100ms; se o celular fechar antes, nem chamamos o Telegram.
            let isCancelled = false;
            let resClosed = false;
            req.on('close', () => {
                isCancelled = true;
                resClosed = true;
            });

            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (isCancelled) {
                console.log(`[Stream] Download abortado precocemente. Celular testou e fechou a conexão.`);
                return;
            }

            // Faz o download da stream
            const iterator = tgClient.iterDownload({
                file: message.media,
                offset: bigInt(alignedOffset), 
                requestSize: chunkSize, 
                limit: fetchLimit
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
                if (resClosed) break; // Garante que não vamos escrever numa stream fechada
                
                const canWrite = res.write(chunkToSend);
                if (!canWrite) {
                    // Aguarda o drain se o buffer estiver cheio, mas também escuta close/error 
                    // para evitar travamento eterno (memory/connection leak)!
                    await new Promise(resolve => {
                        const cleanup = () => {
                            res.removeListener('drain', onResolve);
                            res.removeListener('close', onResolve);
                            res.removeListener('error', onResolve);
                            resolve();
                        };
                        const onResolve = () => cleanup();
                        
                        res.once('drain', onResolve);
                        res.once('close', onResolve);
                        res.once('error', onResolve);
                    });
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
            
            const finalTitle = req.query.title || data.title;
            await handleStreamRequest(req, res, messageId, finalTitle);
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

            // === CHAVE SECRETA DE STREAMING (IP Binding) ===
            // Como navegadores de celular (especialmente Safari no iPhone) frequentemente removem 
            // os cookies ao tentar avançar um vídeo, o método do cookie causava carregamento infinito.
            // Solução: O IP do usuário foi salvo no próprio token pelo backend. 
            // Agora garantimos que o IP batendo na rota de stream é o mesmo dono do link!
            if (!data.app && data.ip) {
                const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                // Compara os IPs (ignora diferença de ipv4 mapeado como ipv6 '::ffff:')
                const cleanClientIp = clientIp.replace(/^.*:/, '');
                const cleanTokenIp = data.ip.replace(/^.*:/, '');
                
                if (cleanClientIp !== cleanTokenIp) {
                    return res.status(403).send("Acesso negado. Este link de streaming pertence a outro usuário ou seu IP mudou.");
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
