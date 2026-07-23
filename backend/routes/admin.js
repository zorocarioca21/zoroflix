import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

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

    // Detalhes completos do usuário (Histórico, Favoritos, Comentários e Perfil)
    router.get('/users/:id/details', async (req, res) => {
        const { id } = req.params;
        try {
            const user = await db.get(`
                SELECT id, uuid, nick, email, role, avatar, banned_until, created_at 
                FROM users 
                WHERE id = ?
            `, [id]);

            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }

            const rawWatchHistory = await db.all(`
                SELECT * FROM watch_history 
                WHERE user_id = ? 
                ORDER BY watched_at DESC 
                LIMIT 50
            `, [id]);

            const watchHistory = rawWatchHistory.map(item => {
                let cleanTitle = item.title;
                if (!cleanTitle || cleanTitle === 'Carregando...' || cleanTitle.trim() === '') {
                    cleanTitle = item.media_type === 'canal' 
                        ? `Canal (${item.content_id})` 
                        : (item.media_type === 'movie' ? `Filme (${item.content_id})` : `Série (${item.content_id})`);
                }
                return { ...item, title: cleanTitle };
            });

            const favorites = await db.all(`
                SELECT * FROM favorites 
                WHERE user_id = ? 
                ORDER BY created_at DESC
            `, [id]);

            const comments = await db.all(`
                SELECT * FROM comments 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT 50
            `, [id]);

            const stats = {
                totalWatched: watchHistory.length,
                totalFavorites: favorites.length,
                totalComments: comments.length
            };

            res.json({
                user,
                watchHistory,
                favorites,
                comments,
                stats
            });
        } catch (err) {
            console.error('Erro ao buscar detalhes do usuário:', err);
            res.status(500).json({ error: 'Erro ao carregar detalhes do usuário.' });
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

    // Nova rota: limpar estatísticas de visualizações
    router.delete('/stats/clear', async (req, res) => {
        try {
            await db.run('DELETE FROM page_views');
            res.json({ success: true });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao limpar estatísticas.' });
        }
    });

    // Estatísticas de acessos
    router.get('/stats', async (req, res) => {
        try {
            // Ajustado para converter a data do banco (UTC) para o fuso horário local e basear os cálculos
            // Visitas (contabiliza 1 por dia por usuário usando subquery)
            const monthly = await db.get("SELECT COUNT(*) as cnt FROM (SELECT uuid FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime', 'start of month') GROUP BY uuid, date(viewed_at, 'localtime'))");
            const weekly = await db.get("SELECT COUNT(*) as cnt FROM (SELECT uuid FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime', '-7 days') GROUP BY uuid, date(viewed_at, 'localtime'))");
            const daily = await db.get("SELECT COUNT(DISTINCT uuid) as cnt FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime')");

            // Pessoas Únicas (Totalmente distintas no período integral)
            const uniqueMonthly = await db.get("SELECT COUNT(DISTINCT uuid) as cnt FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime', 'start of month')");
            const uniqueWeekly = await db.get("SELECT COUNT(DISTINCT uuid) as cnt FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime', '-7 days')");

            res.json({ 
                monthly: monthly.cnt, 
                weekly: weekly.cnt, 
                daily: daily.cnt,
                monthlyUnique: uniqueMonthly.cnt,
                weeklyUnique: uniqueWeekly.cnt
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter estatísticas.' });
        }
    });

    // Rota para zerar o histórico de estatísticas de visualização
    router.delete('/stats/clear', async (req, res) => {
        try {
            await db.run('DELETE FROM page_views');
            res.json({ success: true });
        } catch (err) {
            console.error('Clear stats error:', err);
            res.status(500).json({ error: 'Erro ao zerar estatísticas.' });
        }
    });

    // ============================================================
    //  💓 HEARTBEAT — o frontend envia pings a cada 15 segundos
    // ============================================================
    router.post('/heartbeat', async (req, res) => {
        try {
            const uuid = req.cookies?.zoroflix_uuid;
            if (!uuid) return res.json({ online: 0 });

            const { page, title } = req.body;
            let userId = null;

            // Extrai a ID do usuário se houver token válido de login
            const authHeader = req.headers.authorization;
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                if (token && token !== 'null') {
                    try {
                        const decoded = jwt.verify(token, JWT_SECRET);
                        userId = decoded.id;
                    } catch (e) {
                         // Ignora silenciosamente tokens vencidos
                    }
                }
            }

            // Busca nick do usuário se estiver logado (via cookie/header)
            let nick = null;
            if (userId) {
                const u = await db.get("SELECT nick FROM users WHERE id = ?", [userId]);
                nick = u?.nick;
            }

            // Upsert: cria ou atualiza a sessão
            await db.run(`
                INSERT INTO live_sessions (session_id, uuid, user_id, page, title, last_heartbeat)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(session_id) DO UPDATE SET 
                    user_id = excluded.user_id,
                    page = excluded.page,
                    title = excluded.title,
                    last_heartbeat = datetime('now')
            `, [uuid, uuid, userId, page || '/', title || 'Navegando']);

            // Limpa sessões mortas (sem heartbeat há mais de 10 segundos)
            await db.run(`DELETE FROM live_sessions WHERE last_heartbeat < datetime('now', '-10 seconds')`);

            // Retorna contagem de online
            const result = await db.get(`SELECT COUNT(DISTINCT uuid) as cnt FROM live_sessions`);
            res.json({ online: result.cnt });
        } catch (err) {
            console.error('Heartbeat error:', err);
            res.json({ online: 0 });
        }
    });

    // Sessões ao vivo (para a tabela do admin)
    router.get('/live', async (req, res) => {
        try {
            // Limpa sessões expiradas
            await db.run(`DELETE FROM live_sessions WHERE last_heartbeat < datetime('now', '-10 seconds')`);

            const active = await db.all(`
                SELECT ls.uuid, u.nick, ls.page, ls.title, ls.last_heartbeat
                FROM live_sessions ls
                LEFT JOIN users u ON ls.user_id = u.id
                ORDER BY ls.last_heartbeat DESC
            `);

            const formatted = active.map(s => ({
                uuid: s.uuid,
                name: s.nick || 'Visitante',
                page: s.page || '/',
                title: s.title || 'Navegando',
                lastSeen: s.last_heartbeat
            }));
            res.json(formatted);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter sessões ao vivo.' });
        }
    });

    // Contagem de online
    router.get('/online', async (req, res) => {
        try {
            await db.run(`DELETE FROM live_sessions WHERE last_heartbeat < datetime('now', '-10 seconds')`);
            const result = await db.get(`SELECT COUNT(DISTINCT uuid) as cnt FROM live_sessions`);
            res.json({ online: result.cnt });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter usuários online.' });
        }
    });

    // ============================================================
    //  🔑 API KEYS — Gerenciamento de chaves para acesso mobile
    // ============================================================
    
    // Listar todas as API Keys
    router.get('/api-keys', async (req, res) => {
        try {
            const keys = await db.all("SELECT * FROM api_keys ORDER BY created_at DESC");
            res.json(keys);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar API Keys.' });
        }
    });

    // Criar nova API Key
    router.post('/api-keys', async (req, res) => {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Campo "name" é obrigatório.' });

        // Gera uma key aleatória segura
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = 'zfx_';
        for (let i = 0; i < 32; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        try {
            const result = await db.run(
                "INSERT INTO api_keys (name, key) VALUES (?, ?)", [name, key]
            );
            res.json({ success: true, id: result.lastID, name, key });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao criar API Key.' });
        }
    });

    // Ativar/Desativar API Key
    router.patch('/api-keys/:id/toggle', async (req, res) => {
        try {
            const apiKey = await db.get("SELECT * FROM api_keys WHERE id = ?", [req.params.id]);
            if (!apiKey) return res.status(404).json({ error: 'API Key não encontrada.' });

            const newStatus = apiKey.active ? 0 : 1;
            await db.run("UPDATE api_keys SET active = ? WHERE id = ?", [newStatus, req.params.id]);
            res.json({ success: true, active: newStatus === 1 });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao alterar API Key.' });
        }
    });

    // Deletar API Key
    router.delete('/api-keys/:id', async (req, res) => {
        try {
            await db.run("DELETE FROM api_keys WHERE id = ?", [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao deletar API Key.' });
        }
    });

    return router;
}
