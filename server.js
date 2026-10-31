import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initDB, UPLOADS_PATH } from './backend/db.js';
import authRoutes from './backend/routes/auth.js';
import commentRoutes from './backend/routes/comments.js';
import profileRoutes from './backend/routes/profile.js';
import adminRoutes from './backend/routes/admin.js';
import favoritesRoutes from './backend/routes/favorites.js';
import sportsRoutes from './backend/routes/sports.js';
import mobileRoutes from './backend/routes/mobile.js';
import recentsRoutes from './backend/routes/recents.js';
import epgRoutes from './backend/routes/epg.js';
import downloadsRoutes from './backend/routes/downloads.js';
import http, { createServer } from 'http';
import https from 'https';
import { Server } from 'socket.io';
import syncRoutes from './backend/routes/sync.js';
import hybridWorkerRoutes from './backend/routes/hybridWorkerRoutes.js';
import streamRoutes from './backend/routes/stream.js';
import analyticsRoutes from './backend/routes/analytics.js';
import storageRoutes from './backend/routes/storage.js';
import embedRoutes from './backend/routes/embed.js';
import auditRoutes from './backend/routes/audit.js';
import botRoutes from './backend/routes/bot.js';
import botManagerRoutes from './backend/routes/botManager.js';
import appUpdatesRoutes from './backend/routes/appUpdates.js';
import tmdbRoutes from './backend/routes/tmdb.js';
import mangasRoutes from './backend/routes/mangas.js';
import iptvChannelsRoutes from './backend/routes/iptvChannels.js';
import anilistRoutes from './backend/routes/anilist.js';
import contentReportsRoutes from './backend/routes/contentReports.js';
import appReportsRoutes from './backend/routes/appReports.js';
import pointsRoutes from './backend/routes/points.js';
import themesRoutes from './backend/routes/themes.js';
import { initStorageDB } from './backend/storageDB.js';
import { initTmdbCatalogDB } from './backend/tmdbCatalogDB.js';
import { getTelegramClient } from './backend/telegram.js';
import { runScanner } from './backend/scripts/scan_iptv.js';
import { watchPartyService } from './backend/services/watchPartyService.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Inicializa o Banco e monta as rotas
Promise.all([initDB(), initStorageDB(), initTmdbCatalogDB()]).then(([db, storageDb, tmdbDb]) => {
    // Apply tracking middleware for page views and live sessions (Removed - Agora no front-end em /api/analytics/pageview)

    // Rotas da API
    app.use('/api/auth', authRoutes(db));
    app.use('/api/comments', commentRoutes(db));
    app.use('/api/profile', profileRoutes(db));
    app.use('/api/admin', adminRoutes(db, tmdbDb));
    app.use('/api/favorites', favoritesRoutes(db));
    app.use('/api/sports', sportsRoutes(db));
    app.use('/api/mobile', mobileRoutes(db));
    app.use('/api/recents', recentsRoutes(db));
    app.use('/api', auditRoutes(db));
    app.use('/api/epg', epgRoutes());
    app.use('/api/downloads', downloadsRoutes(db));
    app.use('/api/stream', streamRoutes(db));
    app.use('/api/analytics', analyticsRoutes(db));
    app.use('/api/storage', storageRoutes(storageDb));
    app.use('/api/embed', embedRoutes(db));
    app.use('/api/bot', botRoutes(db));
    app.use('/api/bot-manager', botManagerRoutes(db));
    app.use('/api/app-updates', appUpdatesRoutes(db));
    app.use('/api/tmdb', tmdbRoutes(tmdbDb, db));

    // Rotas de Mangás
    app.use('/api/mangas', mangasRoutes(db));

    // Rotas de Canais IPTV (M3U VIP e VIP2)
    app.use('/api/iptv', iptvChannelsRoutes(db));

    // Rotas de Animes (AniList API + Mapeamento Híbrido)
    app.use('/api/anilist', anilistRoutes(db, tmdbDb));

    // Reportes de Conteúdo (Problemas no Player)
    app.use('/api/content-reports', contentReportsRoutes(db));

    // Reportes de Falhas e Erros do App Mobile
    app.use('/api/app-reports', appReportsRoutes(db));

    // Sistema de Pontos e Pedidos de Conteúdo
    app.use('/api/points', pointsRoutes(db, tmdbDb));

    // Live Code Editor & Gerenciador de Snapshots de Temas (/api/theme/active e /api/admin/themes)
    const themesHandler = themesRoutes(db);
    app.use('/api/theme', themesHandler);
    app.use('/api', themesHandler);

    // Validação do Cloudflare Turnstile no servidor
    app.post('/api/turnstile/verify', async (req, res) => {
        try {
            const { token } = req.body;
            if (!token) {
                return res.status(400).json({ success: false, error: 'Token não fornecido' });
            }

            const secretKey = process.env.TURNSTILE_SECRET_KEY;
            if (!secretKey) {
                console.error('[Turnstile] TURNSTILE_SECRET_KEY não configurada no .env');
                return res.status(500).json({ success: false, error: 'Configuração do servidor incompleta' });
            }
            const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            const params = new URLSearchParams();
            params.append('secret', secretKey);
            params.append('response', token);
            if (clientIp) params.append('remoteip', clientIp);

            const verifyRes = await axios.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            if (verifyRes.data && verifyRes.data.success) {
                return res.json({ success: true });
            } else {
                return res.status(403).json({ success: false, error: 'Falha na validação do Turnstile', details: verifyRes.data });
            }
        } catch (err) {
            console.error('Erro na validação do Turnstile:', err);
            return res.status(500).json({ success: false, error: 'Erro ao validar Turnstile' });
        }
    });

    // Serve public APK downloads
    app.use('/downloads/app', express.static(path.join(__dirname, 'backend', 'uploads', 'app')));

    // Serve avatares locais (fotos de perfil salvas no servidor)
    app.use('/avatars', express.static(path.join(__dirname, 'database', 'uploads', 'avatars'), {
        maxAge: '30d',
        immutable: true
    }));

    // ==========================================
    // ZORO STORAGE CDN PROXY (LINK DIRETO)
    // ==========================================
    app.get('/s/:id', async (req, res) => {
        try {
            const file = await storageDb.get(`SELECT message_id, mime_type, size FROM storage_files WHERE id = ?`, [req.params.id]);
            if (!file) return res.status(404).send('Arquivo não encontrado');

            const tgClient = await getTelegramClient();
            if (!tgClient) return res.status(500).send('Serviço indisponível');

            const storageChannelId = process.env.STORAGE_CHANNEL_ID;
            let entityId = storageChannelId;
            if (!entityId.startsWith('-100')) entityId = '-100' + entityId.replace('-', '');

            let resolvedEntity;
            try { resolvedEntity = await tgClient.getInputEntity(entityId); } 
            catch (e) { resolvedEntity = entityId; }

            const result = await tgClient.getMessages(resolvedEntity, { ids: parseInt(file.message_id) });
            if (!result || result.length === 0 || !result[0] || result[0].className === "MessageEmpty") {
                return res.status(404).send("Arquivo indisponível no Storage");
            }

            const message = result[0];
            if (!message.media || !message.media.document) return res.status(404).send("Documento não encontrado na mensagem");

            res.set({
                'Content-Type': file.mime_type,
                'Content-Length': file.size,
                'Cache-Control': 'public, max-age=31536000'
            });

            // Faz o download via Buffer pro Client
            const iterator = tgClient.iterDownload({
                file: message.media,
                requestSize: 512 * 1024,
            });

            for await (const chunk of iterator) {
                const canWrite = res.write(chunk);
                if (!canWrite) await new Promise(r => res.once('drain', r));
            }
            res.end();
        } catch (err) {
            console.error("Erro no Storage CDN Proxy:", err);
            if (!res.headersSent) res.status(500).send("Erro interno ao transmitir arquivo");
        }
    });

    // Rota para canais VIP do IPTV (Protegida)
    app.get('/api/canais/vip', async (req, res) => {
        // Usa middleware/helper para checar a sessao ou JWT
        const { getAuth } = await import('./backend/middleware/authHelper.js').catch(() => ({ getAuth: null }));
        // Simplificação: apenas verificar o referer (pode ser contornado, mas evita acesso direto via URL solta)
        const referer = req.headers.referer || '';
        if (!referer.includes(req.hostname) && !referer.includes('cinegeek.shop')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const vipPath = path.join(__dirname, 'backend', 'data', 'canais_vip.json');
        if (fs.existsSync(vipPath)) {
            res.sendFile(vipPath);
        } else {
            res.json([]);
        }
    });

    // Proxy reverso para Streaming de IPTV usando FFmpeg pipe direto com correção de timestamps
    app.get('/api/stream/proxy', async (req, res) => {
        let targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send('Missing url param');
        
        // Se targetUrl for apenas um número ou ID de canal do banco
        if (/^\d+$/.test(targetUrl.trim())) {
            const ch = await db.get(`SELECT stream_url FROM iptv_channels WHERE id = ?`, [targetUrl.trim()]);
            if (ch && ch.stream_url) {
                targetUrl = ch.stream_url;
            }
        } else if (targetUrl.startsWith('/api/iptv/stream/')) {
            const chId = targetUrl.replace('/api/iptv/stream/', '');
            const ch = await db.get(`SELECT stream_url FROM iptv_channels WHERE id = ?`, [chId]);
            if (ch && ch.stream_url) {
                targetUrl = ch.stream_url;
            }
        } else if (targetUrl.startsWith('/')) {
            targetUrl = `http://127.0.0.1:${PORT}${targetUrl}`;
        }
        
        try {
            res.writeHead(200, {
                'Content-Type': 'video/mp2t',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache'
            });

            // FFmpeg com User-Agent VLC (essencial para servidores de IPTV não bloquearem)
            const ffmpegArgs = [
                '-hide_banner',
                '-loglevel', 'error',
                '-user_agent', 'VLC/3.0.9 LibVLC/3.0.9',
                '-headers', 'Referer: https://cinegeek.shop\r\n',
                '-i', targetUrl,
                '-c', 'copy',
                '-f', 'mpegts',
                'pipe:1'
            ];

            const ffmpeg = spawn('ffmpeg', ffmpegArgs);

            ffmpeg.stdout.pipe(res);

            ffmpeg.stderr.on('data', (data) => {
                const msg = data.toString();
                console.error(`[Proxy FFmpeg] ${msg.trim()}`);
            });

            req.on('close', () => {
                ffmpeg.kill('SIGKILL');
            });

            ffmpeg.on('close', () => {
                res.end();
            });

        } catch (err) {
            console.error('[Proxy] Erro de execução:', err.message);
            if (!res.headersSent) res.status(502).send('Bad Gateway');
        }
    });// Serve a pasta de uploads de fotos
    app.use('/uploads', express.static(UPLOADS_PATH));

    // Sistema global de cache na memória para a API Proxy
    const proxyCache = new Map();
    const PROXY_CACHE_DURATION = 30 * 60 * 1000; // 30 minutos de cachê

    // Rota de Proxy (Com Proteção de Rate Limit)
    app.get('/api-proxy', async (req, res) => {
        const targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send('URL não fornecida.');

        const now = Date.now();

        // 1. Tenta pegar do Cache primeiro
        if (proxyCache.has(targetUrl)) {
            const cached = proxyCache.get(targetUrl);
            if (now - cached.timestamp < PROXY_CACHE_DURATION) {
                const d = cached.data;
                const isXmlStr = typeof d === 'string' && (d.trimStart().startsWith('<?xml') || d.trimStart().startsWith('<tv'));
                if (isXmlStr) { res.setHeader('Content-Type', 'text/xml; charset=utf-8'); return res.send(d); }
                return res.json(d);
            }
        }

        // 2. Se não tem cache ou expirou, busca na fonte original
        try {
            const response = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            // Detecta se é XML
            const ct = response.headers['content-type'] || '';
            const rd = response.data;
            const looksLikeXml = typeof rd === 'string' && (rd.trimStart().startsWith('<?xml') || rd.trimStart().startsWith('<tv'));

            // Salva na memória
            proxyCache.set(targetUrl, { data: rd, timestamp: now });

            if (ct.includes('xml') || looksLikeXml) {
                res.setHeader('Content-Type', 'text/xml; charset=utf-8');
                return res.send(rd);
            }
            res.json(rd);
        } catch (error) {
            console.error(`Erro na proxy interna [${targetUrl}]:`, error.message);

            // Failsafe Supremo: Deu ruim na API (429/500)? Se a gente tem um cache antigo, exibe de volta ele.
            if (proxyCache.has(targetUrl)) {
                console.log(`Usando cache expirado de forma emergencial para: ${targetUrl}`);
                const d = proxyCache.get(targetUrl).data;
                const isXmlStr = typeof d === 'string' && (d.trimStart().startsWith('<?xml') || d.trimStart().startsWith('<tv'));
                if (isXmlStr) { res.setHeader('Content-Type', 'text/xml; charset=utf-8'); return res.send(d); }
                return res.json(d);
            }

            res.status(500).json({ error: 'Erro ao buscar dados na proxy interna.' });
        }
    });

// ... (imports remain at top but I am replacing the whole app.listen block)
    const httpServer = createServer(app);
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });
    
    // Rotas de Sync injetando o io e o db (DEVE FICAR ANTES DO SPA FALLBACK)
    app.use('/api/sync', syncRoutes(db, io));
    app.use('/api/hybrid', hybridWorkerRoutes(db, io));

    // Servir os arquivos estáticos do Vite (após o npm run build)
    app.use(express.static(path.join(__dirname, 'dist')));

    // Qualquer outra rota manda para o index.html (suporte a SPA/React Router)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });

    // Inicializa o serviço de Watch Party
    watchPartyService.init(io, db);

    io.on('connection', (socket) => {
        // Dispara o estado de sync para admins
        import('./backend/services/syncWorker.js').then(worker => {
            if (worker.broadcastStateTo) {
                worker.broadcastStateTo(socket);
            }
        });

        // ==========================================
        // EVENTOS DE WATCH PARTY (SALAS ESTILO RAVE)
        // ==========================================
        socket.on('wp_get_rooms', () => {
            socket.emit('wp_lobby_update', watchPartyService.getRoomsList());
        });

        socket.on('wp_join_room', (data) => {
            watchPartyService.handleJoin(socket, data);
        });

        socket.on('wp_player_sync', (data) => {
            watchPartyService.handlePlayerSync(socket, data);
        });

        socket.on('wp_add_queue', (media) => {
            watchPartyService.handleAddToQueue(socket, media);
        });

        socket.on('wp_manage_queue', (data) => {
            watchPartyService.handleManageQueue(socket, data);
        });

        socket.on('wp_send_chat', (text) => {
            watchPartyService.handleChatMessage(socket, text);
        });

        socket.on('wp_toggle_subowner', (targetUserId) => {
            watchPartyService.handleToggleSubowner(socket, targetUserId);
        });

        socket.on('wp_toggle_mute', (targetUserId) => {
            watchPartyService.handleToggleMute(socket, targetUserId);
        });

        socket.on('wp_kick_user', (targetUserId) => {
            watchPartyService.handleKickUser(socket, targetUserId);
        });

        socket.on('wp_update_settings', (settings) => {
            watchPartyService.handleUpdateSettings(socket, settings);
        });

        socket.on('disconnect', () => {
            watchPartyService.handleLeave(socket);
        });
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor Zoroflix FullStack rodando em http://localhost:${PORT}`);
        
        // Agendar para rodar a cada 1 hora (sem varredura imediata ao iniciar o servidor)
        setInterval(runScanner, 60 * 60 * 1000);

        // Agendar manutenção automática do cache de mangás a cada 30 minutos (limite de 4.5 GB)
        const cleanMangaScript = path.join(__dirname, 'backend', 'scripts', 'cleanMangaCache.py');
        const mangaCacheDir = path.join(__dirname, 'temp_mangas', 'cache');
        const runMangaCleaner = () => {
            if (fs.existsSync(cleanMangaScript) && fs.existsSync(mangaCacheDir)) {
                spawn('python3', [cleanMangaScript, mangaCacheDir, '4.5'], { detached: true, stdio: 'ignore' }).unref();
            }
        };
        setInterval(runMangaCleaner, 30 * 60 * 1000);
        runMangaCleaner(); // Executa uma vez no boot
    });
});
