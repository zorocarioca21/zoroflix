import express from 'express';

const router = express.Router();

export default function commentRoutes(db) {

    // LISTAR COMENTÁRIOS (com repostas e reações)
    router.get('/:mediaType/:contentId', async (req, res) => {
        const { mediaType, contentId } = req.params;
        const { episodeId } = req.query;

        try {
            let query = `
                SELECT c.*, u.nick, u.avatar,
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

    // POSTAR COMENTÁRIO / RESPOSTA
    router.post('/', async (req, res) => {
        const { userId, parentId, contentId, mediaType, episodeId, text } = req.body;

        if (!userId || !text) return res.status(400).json({ error: 'Dados incompletos.' });

        try {
            const result = await db.run(
                'INSERT INTO comments (user_id, parent_id, content_id, media_type, episode_id, text) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, parentId || null, contentId, mediaType, episodeId || null, text]
            );
            res.json({ id: result.lastID, message: 'Comentário postado!' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao postar comentário.' });
        }
    });

    // REAGIR (LIKE/DISLIKE)
    router.post('/react', async (req, res) => {
        const { userId, commentId, type } = req.body;

        try {
            await db.run(
                'INSERT INTO reactions (user_id, comment_id, type) VALUES (?, ?, ?) ON CONFLICT(user_id, comment_id) DO UPDATE SET type = ?',
                [userId, commentId, type, type]
            );
            res.json({ message: 'Reação salva!' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao reagir.' });
        }
    });

    // DENUNCIAR
    router.post('/report', async (req, res) => {
        const { userId, commentId, reason } = req.body;

        try {
            await db.run(
                'INSERT INTO reports (user_id, comment_id, reason) VALUES (?, ?, ?)',
                [userId, commentId, reason]
            );
            res.json({ message: 'Denúncia enviada aos administradores.' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao enviar denúncia.' });
        }
    });

    return router;
}
