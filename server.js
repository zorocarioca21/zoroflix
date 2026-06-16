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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4000;

app.use(cors());
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

    // Serve a pasta de uploads de fotos
    app.use('/uploads', express.static(UPLOADS_PATH));

    // Rota de Proxy (Mantida)
    app.get('/api-proxy', async (req, res) => {
        const targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send('URL não fornecida.');

        try {
            const response = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            res.json(response.data);
        } catch (error) {
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
