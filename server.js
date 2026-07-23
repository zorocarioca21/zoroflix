import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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

    // Serve a pasta de uploads de fotos
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

    // Servir os arquivos estáticos do Vite (após o npm run build)
    app.use(express.static(path.join(__dirname, 'dist')));

    // Qualquer outra rota manda para o index.html (suporte a SPA/React Router)
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor Zoroflix FullStack rodando em http://localhost:${PORT}`);
    });
});
