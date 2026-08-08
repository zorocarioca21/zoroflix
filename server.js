import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import trackView from './backend/middleware/trackView.js';
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
import streamRoutes from './backend/routes/stream.js';
import analyticsRoutes from './backend/routes/analytics.js';
import { runScanner } from './backend/scripts/scan_iptv.js';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

app.use(cors());
app.use(cookieParser()); // Faltava essa ativação para podermos ler o Cookie de rastreio!
app.use(express.json()); // Necessário para ler o corpo das requisições JSON

// Inicializa o Banco e monta as rotas
initDB().then((db) => {
    // Apply tracking middleware for page views and live sessions
    app.use(trackView(db));

    // Rotas da API
    app.use('/api/auth', authRoutes(db));
    app.use('/api/comments', commentRoutes(db));
    app.use('/api/profile', profileRoutes(db));
    app.use('/api/admin', adminRoutes(db));
    app.use('/api/favorites', favoritesRoutes(db));
    app.use('/api/sports', sportsRoutes());
    app.use('/api/mobile', mobileRoutes(db));
    app.use('/api/recents', recentsRoutes(db));
    app.use('/api/epg', epgRoutes());
    app.use('/api/downloads', downloadsRoutes(db));
    app.use('/api/stream', streamRoutes(db));
    app.use('/api/analytics', analyticsRoutes(db));

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

    // Proxy reverso para Streaming de IPTV usando request http nativo para estabilidade
    app.get('/api/stream/proxy', async (req, res) => {
        const targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send('Missing url param');
        
        try {
            const axios = (await import('axios')).default;
            const proxyRes = await axios({
                method: 'get',
                url: targetUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'VLC/3.0.9 LibVLC/3.0.9',
                    'Accept': '*/*'
                }
            });

            res.writeHead(proxyRes.status, {
                'Content-Type': proxyRes.headers['content-type'] || 'video/mp2t',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache'
            });

            proxyRes.data.pipe(res);

            proxyRes.data.on('error', (err) => {
                console.error('[Proxy] Erro no stream IPTV:', err.message);
                res.end();
            });

            req.on('close', () => {
                proxyRes.data.destroy();
            });

        } catch (err) {
            console.error('[Proxy] Erro de rede:', err.message);
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

    // Servir os arquivos estáticos do Vite (após o npm run build)
    app.use(express.static(path.join(__dirname, 'dist')));

    // Qualquer outra rota manda para o index.html (suporte a SPA/React Router)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });

    io.on('connection', (socket) => {
        console.log('Admin conectado via WebSocket', socket.id);
        
        // Dispara o estado atual imediatamente para não parecer que parou ao dar F5
        import('./backend/services/syncWorker.js').then(worker => {
            if (worker.broadcastStateTo) {
                worker.broadcastStateTo(socket);
            }
        });

        socket.on('disconnect', () => {
            console.log('Admin desconectado', socket.id);
        });
    });

    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor Zoroflix FullStack rodando em http://localhost:${PORT}`);
        
        // Agendar para rodar a cada 1 hora (sem varredura imediata ao iniciar o servidor)
        setInterval(runScanner, 60 * 60 * 1000);
    });
});
