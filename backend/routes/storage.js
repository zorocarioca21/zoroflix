import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads.js';
import { getTelegramClient } from '../telegram.js';
import 'dotenv/config';

export default function storageRoutes(storageDb) {
    const router = express.Router();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

    // Middleware de Autenticação para a API do Storage (suporta token JWT do painel ou API Key pura)
    const authMiddleware = async (req, res, next) => {
        let user = null;
        
        // Verifica x-api-key no header (para uploads via bot ou pelo próprio app Zoroflix)
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            user = await storageDb.get(`SELECT id, role FROM storage_users WHERE api_key = ?`, [apiKey]);
        } else {
            // Verifica JWT comum (Pode ser do painel Storage ou do Zoroflix)
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                try {
                    const jwt = await import('jsonwebtoken');
                    const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'cinegeek_secret_key');
                    // Tenta achar no painel Storage
                    user = await storageDb.get(`SELECT id, role FROM storage_users WHERE id = ?`, [decoded.id]);
                    
                    // Se não achou no Storage, assume que é um usuário do Zoroflix usando a integração nativa
                    if (!user) {
                        user = { id: 0, role: 'zoroflix_native' }; // user_id 0 para uploads nativos do site
                    }
                } catch (e) {}
            }
        }

        if (!user) {
            return res.status(401).json({ error: 'Não autorizado. Forneça x-api-key ou token JWT válido.' });
        }
        req.user = user;
        next();
    };

    // REGISTRO NO PAINEL STORAGE (Cria conta e gera API KEY)
    router.post('/register', async (req, res) => {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });

        const newKey = crypto.randomBytes(32).toString('hex');
        try {
            await storageDb.run(`INSERT INTO storage_users (username, password, api_key) VALUES (?, ?, ?)`, [username, password, newKey]);
            const user = await storageDb.get(`SELECT id, username, api_key FROM storage_users WHERE username = ?`, [username]);
            
            // Gera JWT para sessão no frontend
            const jwt = await import('jsonwebtoken');
            const token = jwt.default.sign({ id: user.id }, process.env.JWT_SECRET || 'cinegeek_secret_key', { expiresIn: '7d' });

            res.json({ success: true, token, user });
        } catch (e) {
            res.status(500).json({ error: 'Usuário já existe ou erro interno.' });
        }
    });

    // LOGIN NO PAINEL STORAGE
    router.post('/login', async (req, res) => {
        const { username, password } = req.body;
        try {
            const user = await storageDb.get(`SELECT id, username, api_key FROM storage_users WHERE username = ? AND password = ?`, [username, password]);
            if (!user) return res.status(401).json({ error: 'Credenciais inválidas.' });

            const jwt = await import('jsonwebtoken');
            const token = jwt.default.sign({ id: user.id }, process.env.JWT_SECRET || 'cinegeek_secret_key', { expiresIn: '7d' });

            res.json({ success: true, token, user });
        } catch (e) {
            res.status(500).json({ error: 'Erro interno.' });
        }
    });

    // UPLOAD DE ARQUIVOS (Protegido)
    router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        const storageChannelId = process.env.STORAGE_CHANNEL_ID;
        if (!storageChannelId) return res.status(500).json({ error: 'STORAGE_CHANNEL_ID não configurado no servidor.' });

        try {
            const tgClient = await getTelegramClient();
            if (!tgClient) return res.status(500).json({ error: 'Falha ao conectar no Telegram.' });

            const toUpload = new CustomFile(req.file.originalname, req.file.size, '', req.file.buffer);

            let entityId = storageChannelId;
            if (!entityId.startsWith('-100')) entityId = '-100' + entityId.replace('-', '');

            const sentMessage = await tgClient.sendFile(entityId, {
                file: toUpload,
                caption: `Upload via Storage API - UserID: ${req.user.id}`
            });

            if (!sentMessage || !sentMessage.id) return res.status(500).json({ error: 'Telegram não retornou a mensagem.' });

            const result = await storageDb.run(`
                INSERT INTO storage_files (user_id, message_id, file_name, mime_type, size)
                VALUES (?, ?, ?, ?, ?)
            `, [req.user.id, sentMessage.id, req.file.originalname, req.file.mimetype, req.file.size]);

            res.json({
                success: true,
                file_id: result.lastID,
                url: `/s/${result.lastID}`
            });

        } catch (err) {
            console.error("[Storage] Erro no upload:", err);
            res.status(500).json({ error: 'Erro ao processar arquivo no Telegram.' });
        }
    });

    // LISTAR MEUS ARQUIVOS (Para o Dashboard)
    router.get('/my-files', authMiddleware, async (req, res) => {
        try {
            const files = await storageDb.all(`
                SELECT id, file_name, mime_type, size, created_at, '/s/' || id as url
                FROM storage_files
                WHERE user_id = ?
                ORDER BY created_at DESC
            `, [req.user.id]);
            res.json(files);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar arquivos' });
        }
    });

    // DELETAR ARQUIVO
    router.delete('/:id', authMiddleware, async (req, res) => {
        try {
            const file = await storageDb.get(`SELECT message_id FROM storage_files WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
            if (!file) return res.status(404).json({ error: 'Arquivo não encontrado.' });

            // Tentar apagar do Telegram para economizar espaço no canal
            const storageChannelId = process.env.STORAGE_CHANNEL_ID;
            if (storageChannelId) {
                const tgClient = await getTelegramClient();
                let entityId = storageChannelId;
                if (!entityId.startsWith('-100')) entityId = '-100' + entityId.replace('-', '');
                
                try {
                    await tgClient.invoke(new Api.channels.DeleteMessages({
                        channel: entityId,
                        id: [file.message_id]
                    }));
                } catch(e) { console.log("Aviso: Não apagou do TG:", e); }
            }

            await storageDb.run(`DELETE FROM storage_files WHERE id = ?`, [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao deletar.' });
        }
    });

    return router;
}
