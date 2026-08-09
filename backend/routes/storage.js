import express from 'express';
import multer from 'multer';
import { getTelegramClient } from '../telegram.js';
import { Api } from 'telegram';
import { CustomFile } from 'telegram/client/uploads.js';
import crypto from 'crypto';
import 'dotenv/config';

export default function storageRoutes(db) {
    const router = express.Router();
    
    // Configura o multer para usar buffer na memria (enviaremos direto pro Telegram)
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

    // Middleware de Autenticaǜo (suporta token de sessǜo ou api_key)
    const authMiddleware = async (req, res, next) => {
        let user = null;
        
        // Verifica api_key no header
        const apiKey = req.headers['x-api-key'];
        if (apiKey) {
            user = await db.get(`SELECT id, role FROM users WHERE api_key = ?`, [apiKey]);
        } else {
            // Verifica JWT comum
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const token = authHeader.split(' ')[1];
                try {
                    const jwt = await import('jsonwebtoken');
                    const decoded = jwt.default.verify(token, process.env.JWT_SECRET || 'cinegeek_secret_key');
                    user = await db.get(`SELECT id, role FROM users WHERE id = ?`, [decoded.id]);
                } catch (e) {}
            }
        }

        if (!user) {
            return res.status(401).json({ error: 'Nǜo autorizado. Use token de sessǜo ou x-api-key.' });
        }
        req.user = user;
        next();
    };

    // UPLOAD: Recebe o arquivo e sobe pro Telegram
    router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        const storageChannelId = process.env.STORAGE_CHANNEL_ID;
        if (!storageChannelId) return res.status(500).json({ error: 'STORAGE_CHANNEL_ID nǜo configurado no servidor.' });

        try {
            const tgClient = await getTelegramClient();
            if (!tgClient) return res.status(500).json({ error: 'Falha ao conectar no Telegram.' });

            console.log(`[Storage] Fazendo upload de ${req.file.originalname} (${req.file.size} bytes) para o Telegram...`);

            // Converte o buffer do Multer num CustomFile pro GramJS
            const toUpload = new CustomFile(req.file.originalname, req.file.size, '', req.file.buffer);

            // Envia para o canal de storage
            let entityId = storageChannelId;
            if (!entityId.startsWith('-100')) {
                entityId = '-100' + entityId.replace('-', '');
            }

            const sentMessage = await tgClient.sendFile(entityId, {
                file: toUpload,
                caption: `Upload por User ID: ${req.user.id}`
            });

            if (!sentMessage || !sentMessage.id) {
                return res.status(500).json({ error: 'Telegram nǜo retornou a mensagem.' });
            }

            // Salva no banco de dados
            const result = await db.run(`
                INSERT INTO storage_files (user_id, message_id, file_name, mime_type, size)
                VALUES (?, ?, ?, ?, ?)
            `, [req.user.id, sentMessage.id, req.file.originalname, req.file.mimetype, req.file.size]);

            const fileId = result.lastID;
            
            res.json({
                success: true,
                file_id: fileId,
                message_id: sentMessage.id,
                url: `/s/${fileId}` // Rota pblica de proxy que criaremos no server.js
            });

        } catch (err) {
            console.error("[Storage] Erro no upload:", err);
            res.status(500).json({ error: 'Erro ao processar arquivo no Telegram.' });
        }
    });

    // LISTAR ARQUIVOS
    router.get('/my-files', authMiddleware, async (req, res) => {
        try {
            const files = await db.all(`
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
            const file = await db.get(`SELECT message_id FROM storage_files WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
            if (!file) return res.status(404).json({ error: 'Arquivo nǜo encontrado.' });

            // Tentar apagar do Telegram (opcional, pois no Storage infinito pode nǜo importar, mas ajuda a manter limpo)
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
                } catch(e) { console.log("Aviso: Nǜo apagou do TG:", e); }
            }

            await db.run(`DELETE FROM storage_files WHERE id = ?`, [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao deletar.' });
        }
    });

    // GERAR API KEY
    router.post('/generate-key', authMiddleware, async (req, res) => {
        try {
            const newKey = crypto.randomBytes(32).toString('hex');
            await db.run(`UPDATE users SET api_key = ? WHERE id = ?`, [newKey, req.user.id]);
            res.json({ success: true, api_key: newKey });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao gerar chave.' });
        }
    });

    return router;
}
