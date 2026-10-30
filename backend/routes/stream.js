import express from 'express';
import { getTelegramClient } from '../telegram.js';
import bigInt from "big-integer";
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';
const router = express.Router();
const channelId = process.env.TELEGRAM_CHANNEL_ID;

// === CONTROLE DE RATE LIMIT E CONCORRÊNCIA EM MEMÓRIA ===
// 1. Rate Limit: máximo 5 acessos a mídias a cada 30 segundos
const rateLimitMap = new Map(); // clientKey -> [timestamps]

// 2. Telas Ativas: 1 tela por vez para usuários Free / Não logados
const activeSessions = new Map(); // clientKey -> { mediaId, lastPing, title }

// 3. Downloads Ativos: 1 download por vez para Free / Não logados
const activeDownloads = new Map(); // clientKey -> timestamp

// Função auxiliar para identificar o cliente (por Usuário JWT ou IP)
function getClientIdentifier(req) {
    let clientKey = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace(/^.*:/, '');
    let isVip = false;
    let userId = null;

    try {
        const auth = req.headers.authorization;
        if (auth && auth.startsWith('Bearer ')) {
            const token = auth.split(' ')[1];
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded) {
                userId = decoded.id;
                clientKey = `user_${decoded.id}`;
                if (decoded.role === 'vip' || decoded.role === 'admin') {
                    isVip = true;
                }
            }
        }
    } catch (e) { }

    return { clientKey, isVip, userId };
}

// Limpeza automática de sessões inativas (a cada 1 minuto)
setInterval(() => {
    const now = Date.now();
    for (const [key, sess] of activeSessions.entries()) {
        if (now - sess.lastPing > 45000) { // Sem ping há 45s = fechou aba
            activeSessions.delete(key);
        }
    }
    for (const [key, ts] of activeDownloads.entries()) {
        if (now - ts > 14400000) { // Mais de 4h = remove download fantasma
            activeDownloads.delete(key);
        }
    }
}, 60000);

export default function streamRoutes(db) {
    const router = express.Router();

    // POST /api/stream/ping (Heartbeat do Player a cada 20s para manter tela ativa)
    router.post('/ping', (req, res) => {
        const { mediaId, title } = req.body;
        const { clientKey, isVip } = getClientIdentifier(req);

        if (!isVip) {
            const existing = activeSessions.get(clientKey);
            // Se já tem outra tela tocando outro filme nos últimos 40s
            if (existing && String(existing.mediaId) !== String(mediaId) && (Date.now() - existing.lastPing < 40000)) {
                return res.status(409).json({
                    error: 'concurrency_limit',
                    message: `Você já está assistindo a "${existing.title || 'outro conteúdo'}". Seu plano permite 1 tela por vez. Faça upgrade para o plano VIP para assistir em várias telas simultâneas!`
                });
            }

            activeSessions.set(clientKey, {
                mediaId: String(mediaId),
                title: title || 'Vídeo',
                lastPing: Date.now()
            });
        }

        res.json({ ok: true });
    });

    // POST /api/stream/close-session (Quando o usuário sai da página ou pausa)
    router.post('/close-session', (req, res) => {
        const { clientKey } = getClientIdentifier(req);
        activeSessions.delete(clientKey);
        res.json({ ok: true });
    });

    // POST /api/stream/generate-download
    // Gera token seguro e assinado criptograficamente com HMAC SHA-256 e validade de 5 minutos
    router.post('/generate-download', (req, res) => {
        try {
            const { clientKey, isVip } = getClientIdentifier(req);

            // Trava de 1 Download Simultâneo por vez (Apenas VIP pode baixar vários juntos)
            if (!isVip && activeDownloads.has(clientKey)) {
                return res.status(429).json({
                    error: 'download_concurrency_limit',
                    message: 'Você já possui um download em andamento. Aguarde a conclusão ou assine o plano VIP para downloads simultâneos ilimitados!'
                });
            }
            let { messageId, streamUrl, title, channelId: targetChannelId } = req.body;
            let parsedMsgId = parseInt(messageId);

            // Se messageId não veio direto (comum para usuários não-admins), extrai do streamUrl
            if (!parsedMsgId && streamUrl) {
                try {
                    let sToken = streamUrl.split('/s/')[1]?.split('.')[0] || streamUrl;
                    sToken = sToken.replace(/-/g, '+').replace(/_/g, '/');
                    while (sToken.length % 4) sToken += '=';
                    const textoDecodificado = Buffer.from(sToken, 'base64').toString('utf-8');
                    const textoSubstituido = textoDecodificado.replace(/§/g, 'a').replace(/¶/g, 'b').replace(/©/g, 'c');
                    const textoOriginal = textoSubstituido.split('').reverse().join('');
                    const streamData = JSON.parse(textoOriginal);
                    parsedMsgId = parseInt(streamData.id);
                    if (!targetChannelId && streamData.channelId) {
                        targetChannelId = streamData.channelId;
                    }
                } catch (e) {
                    console.error('Erro ao extrair messageId de streamUrl:', e);
                }
            }

            if (!parsedMsgId) {
                return res.status(400).json({ error: 'Message ID inválido' });
            }

            const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace(/^.*:/, '');

            // Token assinado criptograficamente pelo servidor (expira em 5 minutos para iniciar o download)
            const token = jwt.sign(
                {
                    id: parsedMsgId,
                    title: title || 'Download - CineGeek',
                    channelId: targetChannelId || null,
                    ip: clientIp,
                    type: 'download'
                },
                JWT_SECRET,
                { expiresIn: '5m' }
            );

            return res.json({
                downloadUrl: `/api/stream/d/${token}?title=${encodeURIComponent(title || 'video')}`
            });
        } catch (err) {
            console.error('Erro ao gerar token seguro de download:', err);
            return res.status(500).json({ error: 'Erro ao gerar link de download' });
        }
    });

    // POST /api/stream/generate-rave
    // Gera link direto seguro e compatível com o aplicativo Rave (Watch Party) exclusivo para VIPs
    router.post('/generate-rave', (req, res) => {
        try {
            const { isVip } = getClientIdentifier(req);
            if (!isVip) {
                return res.status(403).json({
                    error: 'vip_only',
                    message: 'O recurso de Watch Party no Rave é exclusivo para assinantes VIP!'
                });
            }

            let { messageId, streamUrl, title, channelId: targetChannelId } = req.body;
            let parsedMsgId = parseInt(messageId);

            if (!parsedMsgId && streamUrl) {
                try {
                    let sToken = streamUrl.split('/s/')[1]?.split('.')[0] || streamUrl;
                    sToken = sToken.replace(/-/g, '+').replace(/_/g, '/');
                    while (sToken.length % 4) sToken += '=';
                    const textoDecodificado = Buffer.from(sToken, 'base64').toString('utf-8');
                    const textoSubstituido = textoDecodificado.replace(/§/g, 'a').replace(/¶/g, 'b').replace(/©/g, 'c');
                    const textoOriginal = textoSubstituido.split('').reverse().join('');
                    const streamData = JSON.parse(textoOriginal);
                    parsedMsgId = parseInt(streamData.id);
                    if (!targetChannelId && streamData.channelId) {
                        targetChannelId = streamData.channelId;
                    }
                } catch (e) {
                    console.error('Erro ao extrair messageId de streamUrl para Rave:', e);
                }
            }

            if (!parsedMsgId) {
                return res.status(400).json({ error: 'ID de mídia não encontrado.' });
            }

            // Gera token com app: true para que não trave em apenas 1 IP (permitindo que os amigos na sala do Rave assistam juntos)
            // Validade de 12 horas para a sessão da Watch Party
            const expiration = Date.now() + (12 * 3600 * 1000);
            const payload = JSON.stringify({
                id: parsedMsgId,
                title: title || 'Rave Watch Party',
                channelId: targetChannelId || null,
                exp: expiration,
                app: true
            });
            const textoInvertido = payload.split('').reverse().join('');
            const textoSubstituido = textoInvertido.replace(/a/g, '§').replace(/b/g, '¶').replace(/c/g, '©');
            let token = Buffer.from(textoSubstituido, 'utf-8').toString('base64');
            token = token.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

            const host = req.get('host') || 'www.cinegeek.shop';
            const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'https';
            const raveUrl = `${protocol}://${host}/api/stream/s/${token}.mp4`;

            return res.json({
                success: true,
                raveUrl,
                expiresIn: '12h'
            });
        } catch (err) {
            console.error('Erro ao gerar link para o Rave:', err);
            return res.status(500).json({ error: 'Erro ao gerar link compatível com o Rave.' });
        }
    });

    async function handleStreamRequest(req, res, messageId, overrideTitle = null, targetChannel = null) {
        if (!messageId) return res.status(400).send("Message ID inválido");

        // Headers essenciais para o app Rave e clientes externos realizarem stream CORS livre
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, Authorization',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges'
        });

        if (req.method === 'OPTIONS') {
            return res.status(204).end();
        }

        const tgClient = await getTelegramClient();
        if (!tgClient) return res.status(500).send("Erro interno ao conectar ao Telegram");

        try {
            const channelsToTry = [
                targetChannel,
                process.env.TELEGRAM_CHANNEL_ID,
                process.env.STORAGE_CHANNEL_ID,
                '-1003839496993',
                '-1004394307872'
            ].filter(Boolean);

            let message = null;

            for (let chId of channelsToTry) {
                let entityId = String(chId);
                if (!entityId.startsWith('-100')) {
                    entityId = '-100' + entityId.replace('-', '');
                }

                let resolvedEntity;
                try {
                    resolvedEntity = await tgClient.getInputEntity(entityId);
                } catch (e) {
                    resolvedEntity = entityId;
                }

                try {
                    console.log(`[Stream] Buscando mensagem ${messageId} no canal ${entityId}...`);
                    const result = await tgClient.getMessages(resolvedEntity, { ids: messageId });
                    if (result && result.length > 0 && result[0] && result[0].className !== "MessageEmpty") {
                        message = result[0];
                        console.log(`[Stream] Encontrado no canal ${entityId}!`);
                        break;
                    }
                } catch (err) {
                    console.log(`[Stream] Aviso: Mensagem ${messageId} não encontrada no canal ${entityId}, tentando próximo...`);
                }
            }

            if (!message) {
                console.log(`[Stream] ERRO: Mensagem ${messageId} não encontrada em nenhum canal Telegram cadastrado.`);
                return res.status(404).send("Mensagem não encontrada");
            }
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
            const downloadTitle = req.query.download === 'true' && inputTitle ? inputTitle.replace(/[^\w\s.-]/g, '').trim() : 'video';
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
            let messageId = null;
            let finalTitle = req.query.title || null;
            let targetChannel = null;

            // 1º Tenta validar como JWT assinado criptograficamente
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                messageId = parseInt(decoded.id);
                finalTitle = finalTitle || decoded.title;
                targetChannel = decoded.channelId;

                // Validação de IP (impede compartilhamento do link de download com terceiros)
                if (decoded.ip) {
                    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').replace(/^.*:/, '');
                    if (clientIp && decoded.ip && clientIp !== decoded.ip) {
                        return res.status(403).send("Acesso negado. Este link de download pertence a outro usuário ou seu IP mudou.");
                    }
                }
            } catch (jwtErr) {
                // Fallback para tokens legados ofuscados (garante retrocompatibilidade temporária)
                token = token.replace(/-/g, '+').replace(/_/g, '/');
                while (token.length % 4) token += '=';
                
                const textoDecodificado = Buffer.from(token, 'base64').toString('utf-8');
                const textoSubstituido = textoDecodificado
                    .replace(/§/g, 'a')
                    .replace(/¶/g, 'b')
                    .replace(/©/g, 'c');
                const textoOriginal = textoSubstituido.split('').reverse().join('');
                const data = JSON.parse(textoOriginal);

                messageId = parseInt(data.id);
                finalTitle = finalTitle || data.title;
                targetChannel = data.channelId;

                if (data.exp && Date.now() > data.exp) {
                    return res.status(403).send("Este link expirou. Por favor, solicite um novo link de download.");
                }
            }
            
            if (!messageId) return res.status(400).send("Token inválido");

            const { clientKey, isVip } = getClientIdentifier(req);
            if (!isVip) {
                activeDownloads.set(clientKey, Date.now());
                const releaseDownload = () => activeDownloads.delete(clientKey);
                req.on('close', releaseDownload);
                res.on('finish', releaseDownload);
            }

            // Força modo de download na rota /d/
            req.query.download = 'true';
            await handleStreamRequest(req, res, messageId, finalTitle, targetChannel);
        } catch (err) {
            console.error("Erro ao decodificar token de download:", err);
            return res.status(400).send("Link de download inválido ou expirado.");
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
            // Agora garantimos que O IP batendo na rota de stream é o mesmo dono do link!
            if (!data.app && data.ip) {
                const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
                // Compara os IPs (ignora diferença de ipv4 mapeado como ipv6 '::ffff:')
                const cleanClientIp = clientIp.replace(/^.*:/, '');
                const cleanTokenIp = data.ip.replace(/^.*:/, '');
                
                if (cleanClientIp !== cleanTokenIp) {
                    return res.status(403).send("Acesso negado. Este link de streaming pertence a outro usuário ou seu IP mudou.");
                }
            }
            
            await handleStreamRequest(req, res, messageId, data.title, data.channelId);
        } catch (err) {
            console.error("Erro ao decodificar token de stream:", err);
            return res.status(403).send("Acesso negado. Token corrompido ou inválido.");
        }
    });

    return router;
}
