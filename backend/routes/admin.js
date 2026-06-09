import express from 'express';
const router = express.Router();

export default function adminRoutes(db) {
    // Ver todas as denúncias pendentes
    router.get('/reports', async (req, res) => {
        try {
            const reports = await db.all(`
                SELECT r.*, u.nick as reporter_nick, c.text as comment_text, c.content_id, c.media_type
                FROM reports r
                JOIN users u ON r.user_id = u.id
                JOIN comments c ON r.comment_id = c.id
                WHERE r.status = 'pending'
                ORDER BY r.created_at DESC
            `);
            res.json(reports);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar denúncias.' });
        }
    });

    // Ver últimos comentários
    router.get('/comments', async (req, res) => {
        try {
            const comments = await db.all(`
                SELECT c.*, u.nick as user_nick, u.avatar as user_avatar
                FROM comments c
                JOIN users u ON c.user_id = u.id
                ORDER BY c.created_at DESC
                LIMIT 50
            `);
            res.json(comments);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar comentários.' });
        }
    });

    // Buscar usuários (por nick ou email)
    router.get('/users', async (req, res) => {
        const { query } = req.query;
        try {
            const users = await db.all(`
                SELECT id, nick, email, role, banned_until, uuid, created_at 
                FROM users 
                WHERE nick LIKE ? OR email LIKE ?
                LIMIT 20
            `, [`%${query}%`, `%${query}%`]);
            res.json(users);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar usuários.' });
        }
    });

    // Mudar Role (VIP, ADM, FREE)
    router.patch('/users/:id/role', async (req, res) => {
        const { role } = req.body;
        const { id } = req.params;
        try {
            await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao mudar cargo.' });
        }
    });

    // Soft Delete de Comentário
    router.patch('/comments/:id/delete', async (req, res) => {
        const { id } = req.params;
        try {
            await db.run("UPDATE comments SET text = '[Comentário apagado por um Administrador]' WHERE id = ?", [id]);
            await db.run("UPDATE reports SET status = 'resolved' WHERE comment_id = ?", [id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao apagar comentário.' });
        }
    });

    // Ignorar denúncia
    router.patch('/reports/:id/dismiss', async (req, res) => {
        try {
            await db.run("UPDATE reports SET status = 'dismissed' WHERE id = ?", [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao ignorar denúncia.' });
        }
    });

    // Verificar se um usuário (por nick ou email) é admin
    router.post('/verify', async (req, res) => {
        const { identifier } = req.body; // pode ser nick ou email
        try {
            const user = await db.get(`
                SELECT id, role FROM users 
                WHERE (nick = ? OR email = ?) AND role = 'admin'
            `, [identifier, identifier]);
            if (user) {
                res.json({ isAdmin: true, userId: user.id });
            } else {
                res.json({ isAdmin: false });
            }
        } catch (err) {
            res.status(500).json({ error: 'Erro ao verificar admin.' });
        }
    });

    return router;
}
