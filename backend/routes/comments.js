import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import { UPLOADS_PATH } from '../db.js';
import { uploadLocalFileToDrive } from '../services/zoroDriveService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';
const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_PATH);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'sticker-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

export default function commentRoutes(db) {

    // UPLOAD DE FIGURINHA / IMAGEM DE COMENTÁRIO
    router.post('/upload-sticker', upload.single('sticker'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }

    let stickerUrl = `/uploads/${req.file.filename}`;
    try {
        const driveUrl = await uploadLocalFileToDrive(req.file.path, 'Comentarios');
        if (driveUrl) {
            stickerUrl = driveUrl;
            try { fs.unlinkSync(req.file.path); } catch (e) {}
        }
    } catch (err) {
        console.error('[COMMENTS] Erro ao enviar sticker para o Zoro Drive:', err);
    }

    res.json({ stickerUrl });
});

    // LISTAR COMENTÁRIOS (com repostas e reações)
    router.get('/:mediaType/:contentId', async (req, res) => {
        const { mediaType, contentId } = req.params;
        const { episodeId } = req.query;

        try {
            let query = `
                SELECT c.*, u.nick, u.avatar, u.role,
                (SELECT COUNT(*) FROM reactions WHERE comment_id = c.id AND type = 'like') as likes,
                (SELECT COUNT(*) FROM reactions WHERE comment_id = c.id AND type = 'dislike') as dislikes
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.media_type = ? AND c.content_id = ? AND c.status != 'hidden'
            `;
            const params = [mediaType, contentId];

            if (episodeId) {
                query += " AND c.episode_id = ?";
                params.push(episodeId);
            } else {
                query += " AND c.episode_id IS NULL";
            }

            query += " ORDER BY c.created_at DESC";

            const comments = await db.all(query, params);

            // Se o comentário estiver moderado, substitui o texto na resposta pública mas mantém no DB
            const results = comments.map(c => ({
                ...c,
                text: c.status === 'moderated' ? '[Comentário apagado por um Administrador]' : c.text
            }));

            res.json(results);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar comentários.' });
        }
    });

    // Helper para extrair o usuário autenticado (JWT no header Authorization ou userId validado)
    const getAuthenticatedUserId = async (req) => {
        let userId = null;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            try {
                const token = req.headers.authorization.split(' ')[1];
                const decoded = jwt.verify(token, JWT_SECRET);
                if (decoded && decoded.id) {
                    userId = decoded.id;
                }
            } catch (e) {
                return null;
            }
        }
        if (!userId && req.body.userId) {
            userId = req.body.userId;
        }
        if (!userId) return null;

        // Validar se o usuário realmente existe no banco
        try {
            const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
            return user ? user.id : null;
        } catch (err) {
            return null;
        }
    };

    // POSTAR COMENTÁRIO / RESPOSTA (Apenas usuários logados)
    router.post('/', async (req, res) => {
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return res.status(401).json({ error: 'Você precisa estar logado para comentar.' });
        }

        const { parentId, contentId, mediaType, episodeId, text } = req.body;

        if (!text || !contentId || !mediaType) {
            return res.status(400).json({ error: 'Dados incompletos (text, contentId e mediaType são obrigatórios).' });
        }

        try {
            const result = await db.run(
                'INSERT INTO comments (user_id, parent_id, content_id, media_type, episode_id, text) VALUES (?, ?, ?, ?, ?, ?)',
                [authUserId, parentId || null, contentId, mediaType, episodeId || null, text]
            );
            res.json({ id: result.lastID, message: 'Comentário postado com sucesso!' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao postar comentário.' });
        }
    });

    // REAGIR (LIKE/DISLIKE) (Apenas usuários logados)
    router.post('/react', async (req, res) => {
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return res.status(401).json({ error: 'Você precisa estar logado para reagir.' });
        }

        const { commentId, type } = req.body;
        if (!commentId || !type) {
            return res.status(400).json({ error: 'commentId e type são obrigatórios.' });
        }

        try {
            await db.run(
                'INSERT INTO reactions (user_id, comment_id, type) VALUES (?, ?, ?) ON CONFLICT(user_id, comment_id) DO UPDATE SET type = ?',
                [authUserId, commentId, type, type]
            );
            res.json({ message: 'Reação salva!' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao reagir.' });
        }
    });

    // DENUNCIAR (Apenas usuários logados)
    router.post('/report', async (req, res) => {
        const authUserId = await getAuthenticatedUserId(req);
        if (!authUserId) {
            return res.status(401).json({ error: 'Você precisa estar logado para denunciar.' });
        }

        const { commentId, reason } = req.body;
        if (!commentId || !reason) {
            return res.status(400).json({ error: 'commentId e reason são obrigatórios.' });
        }

        try {
            await db.run(
                'INSERT INTO reports (user_id, comment_id, reason) VALUES (?, ?, ?)',
                [authUserId, commentId, reason]
            );
            res.json({ message: 'Denúncia enviada aos administradores.' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao enviar denúncia.' });
        }
    });

    return router;
}
