import express from 'express';
const router = express.Router();

export default function adminRoutes(db) {
    // Ver denúncias com suporte a paginação e busca
    router.get('/reports', async (req, res) => {
        const { limit = 5, offset = 0, search = '' } = req.query;
        try {
            const reports = await db.all(`
                SELECT r.*, u.nick as reporter_nick, c.text as comment_text, c.content_id, c.media_type, c.episode_id
                FROM reports r
                JOIN users u ON r.user_id = u.id
                JOIN comments c ON r.comment_id = c.id
                WHERE r.status = 'pending' AND (u.nick LIKE ? OR c.text LIKE ? OR r.reason LIKE ?)
                ORDER BY r.created_at DESC
                LIMIT ? OFFSET ?
            `, [`%${search}%`, `%${search}%`, `%${search}%`, parseInt(limit), parseInt(offset)]);
            res.json(reports);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar denúncias.' });
        }
    });

    // Ver comentários com suporte a paginação, busca e status (active, moderated, hidden)
    router.get('/comments', async (req, res) => {
        const { limit = 5, offset = 0, search = '', status = 'active' } = req.query;
        let whereClause = "1=1";
        let params = [];

        if (status === 'active') {
            whereClause += " AND c.status = 'active'";
        } else if (status === 'moderated') {
            whereClause += " AND c.status = 'moderated'";
        } else if (status === 'hidden') {
            whereClause += " AND c.status = 'hidden'";
        } else if (status === 'deleted') {
            whereClause += " AND (c.status = 'moderated' OR c.status = 'hidden')";
        }

        if (search) {
            whereClause += ` AND (u.nick LIKE ? OR c.text LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        params.push(parseInt(limit), parseInt(offset));

        try {
            const comments = await db.all(`
                SELECT c.*, u.nick as user_nick, u.avatar as user_avatar
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE ${whereClause}
                ORDER BY c.created_at DESC
                LIMIT ? OFFSET ?
            `, params);
            res.json(comments);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar comentários.' });
        }
    });

    // Buscar usuários com paginação automática
    router.get('/users', async (req, res) => {
        const { query = '', limit = 5, offset = 0 } = req.query;
        try {
            const users = await db.all(`
                SELECT id, nick, email, role, banned_until, uuid, created_at 
                FROM users 
                WHERE nick LIKE ? OR email LIKE ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `, [`%${query}%`, `%${query}%`, parseInt(limit), parseInt(offset)]);
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

    // Moderação de Comentário (Granular: moderated ou hidden)
    router.patch('/comments/:id/moderation', async (req, res) => {
        const { id } = req.params;
        const { mode } = req.body; // 'moderated', 'hidden' ou 'active'
        try {
            if (mode === 'moderated') {
                await db.run("UPDATE comments SET status = 'moderated' WHERE id = ?", [id]);
            } else if (mode === 'hidden') {
                await db.run("UPDATE comments SET status = 'hidden' WHERE id = ?", [id]);
            } else if (mode === 'active') {
                await db.run("UPDATE comments SET status = 'active' WHERE id = ?", [id]);
            }
            await db.run("UPDATE reports SET status = 'resolved' WHERE comment_id = ?", [id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro na moderação.' });
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
        const { identifier } = req.body; 
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

    // Obter todas as configurações
    router.get('/config/all', async (req, res) => {
        try {
            const configs = await db.all("SELECT * FROM configs");
            const configMap = {};
            configs.forEach(c => { configMap[c.key] = c.value === '1'; });
            res.json(configMap);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar configs.' });
        }
    });

    // Alterar uma configuração específica
    router.post('/config/update', async (req, res) => {
        const { key, enabled } = req.body;
        try {
            await db.run("UPDATE configs SET value = ? WHERE key = ?", [enabled ? '1' : '0', key]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao salvar config.' });
        }
    });

    return router;
}
