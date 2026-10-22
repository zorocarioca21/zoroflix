import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

const authUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }
};

export default function pointsRoutes(db, tmdbDb) {
    // Obter saldo de pontos e histórico do usuário autenticado
    router.get('/balance', authUser, async (req, res) => {
        try {
            const user = await db.get('SELECT id, nick, points FROM users WHERE id = ?', [req.user.id]);
            if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

            const history = await db.all(`
                SELECT content_key, tmdb_id, media_type, season, episode, points, source, created_at
                FROM watch_rewards
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT 30
            `, [req.user.id]);

            const myVotes = await db.all(`
                SELECT cr.*, v.points_spent, v.created_at as voted_at
                FROM content_request_votes v
                JOIN content_requests cr ON v.request_id = cr.id
                WHERE v.user_id = ?
                ORDER BY v.created_at DESC
                LIMIT 30
            `, [req.user.id]);

            res.json({
                points: user.points || 0,
                history,
                myRequests: myVotes
            });
        } catch (err) {
            console.error('Erro ao buscar saldo de pontos:', err);
            res.status(500).json({ error: 'Erro ao buscar pontos.' });
        }
    });

    // Recompensa de 20 pontos por assistir >= 80%
    router.post('/watch-reward', authUser, async (req, res) => {
        try {
            const userId = req.user.id;
            const { tmdb_id, media_type, season, episode, source } = req.body || {};

            if (!tmdb_id) {
                return res.status(400).json({ error: 'tmdb_id é obrigatório.' });
            }

            const s = season !== undefined && season !== null && season !== '' ? parseInt(season, 10) : null;
            const e = episode !== undefined && episode !== null && episode !== '' ? parseInt(episode, 10) : null;
            const type = media_type || (s ? 'tv' : 'movie');

            // Chave única para o conteúdo
            const contentKey = s && e ? `${type}_${tmdb_id}_S${s}E${e}` : `${type}_${tmdb_id}`;

            // Verifica se o usuário já ganhou pontos por esse conteúdo
            const existing = await db.get(`
                SELECT id FROM watch_rewards WHERE user_id = ? AND content_key = ?
            `, [userId, contentKey]);

            if (existing) {
                return res.json({ success: false, alreadyAwarded: true, message: 'Pontos já concedidos para este conteúdo.' });
            }

            const POINTS_AWARDED = 20;

            await db.run(`
                INSERT INTO watch_rewards (user_id, content_key, tmdb_id, media_type, season, episode, points, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [userId, contentKey, String(tmdb_id), type, s, e, POINTS_AWARDED, source || 'player']);

            await db.run(`
                UPDATE users SET points = COALESCE(points, 0) + ? WHERE id = ?
            `, [POINTS_AWARDED, userId]);

            const updatedUser = await db.get('SELECT points FROM users WHERE id = ?', [userId]);

            return res.json({
                success: true,
                pointsAwarded: POINTS_AWARDED,
                totalPoints: updatedUser ? updatedUser.points : POINTS_AWARDED,
                message: `Parabéns! Você ganhou +${POINTS_AWARDED} pontos por assistir!`
            });
        } catch (err) {
            // Em caso de colisão de UNIQUE
            if (err.message && err.message.includes('UNIQUE')) {
                return res.json({ success: false, alreadyAwarded: true });
            }
            console.error('Erro ao conceder pontos de visualização:', err);
            res.status(500).json({ error: 'Erro ao conceder pontos.' });
        }
    });

    // Checar se lista de TMDB IDs já existe baixado no Telegram (sync_queue status='completed')
    // Usado na barra de pesquisa para filtrar o que JÁ temos
    router.post('/check-availability', async (req, res) => {
        try {
            const { tmdb_ids } = req.body || {};
            if (!Array.isArray(tmdb_ids) || tmdb_ids.length === 0) {
                return res.json({ available: [] });
            }

            // Sanitiza os ids
            const cleanIds = tmdb_ids.map(id => String(id)).slice(0, 50);
            const placeholders = cleanIds.map(() => '?').join(',');

            const rows = await db.all(`
                SELECT DISTINCT tmdb_id FROM sync_queue
                WHERE tmdb_id IN (${placeholders})
                AND status = 'completed'
                AND (telegram_message_id IS NOT NULL OR stream_url IS NOT NULL)
            `, cleanIds);

            const availableSet = rows.map(r => String(r.tmdb_id));
            res.json({ available: availableSet });
        } catch (err) {
            console.error('Erro ao checar disponibilidade:', err);
            res.status(500).json({ error: 'Erro ao verificar disponibilidade.' });
        }
    });

    // Fazer um pedido usando pontos (100 pontos)
    // Se o pedido já existir, incrementa votos e adiciona o usuário à lista de votantes
    router.post('/request-content', authUser, async (req, res) => {
        try {
            const userId = req.user.id;
            const { tmdb_id, media_type, season, episode, title, poster_path, year, is_anime } = req.body || {};

            if (!tmdb_id || !title) {
                return res.status(400).json({ error: 'Dados do conteúdo incompletos.' });
            }

            const COST = 100;

            const user = await db.get('SELECT id, points FROM users WHERE id = ?', [userId]);
            if (!user || (user.points || 0) < COST) {
                return res.status(400).json({
                    error: `Pontos insuficientes. Você tem ${user ? user.points || 0 : 0} pontos e precisa de ${COST} pontos para fazer um pedido.`
                });
            }

            const s = season !== undefined && season !== null && season !== '' ? parseInt(season, 10) : null;
            const e = episode !== undefined && episode !== null && episode !== '' ? parseInt(episode, 10) : null;
            const type = media_type || (s ? 'tv' : 'movie');

            // Chave única para o pedido (ex: movie_12345 ou tv_12345 ou tv_12345_S1E2)
            const requestKey = s && e ? `${type}_${tmdb_id}_S${s}E${e}` : (s ? `${type}_${tmdb_id}_S${s}` : `${type}_${tmdb_id}`);

            // Verifica se o usuário já votou neste mesmo pedido
            let request = await db.get('SELECT * FROM content_requests WHERE request_key = ?', [requestKey]);

            if (request) {
                const userVote = await db.get(`
                    SELECT id FROM content_request_votes WHERE request_id = ? AND user_id = ?
                `, [request.id, userId]);

                if (userVote) {
                    return res.status(400).json({ error: 'Você já fez ou votou neste pedido!' });
                }
            }

            // Deduz os pontos do usuário
            await db.run('UPDATE users SET points = points - ? WHERE id = ?', [COST, userId]);

            if (!request) {
                // Cria novo pedido
                const ins = await db.run(`
                    INSERT INTO content_requests (
                        request_key, tmdb_id, media_type, season, episode,
                        title, poster_path, year, is_anime, votes, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'pending')
                `, [
                    requestKey,
                    String(tmdb_id),
                    type,
                    s,
                    e,
                    title,
                    poster_path || null,
                    year ? String(year) : null,
                    is_anime ? 1 : 0
                ]);
                const reqId = ins.lastID;
                await db.run(`
                    INSERT INTO content_request_votes (request_id, user_id, points_spent)
                    VALUES (?, ?, ?)
                `, [reqId, userId, COST]);
            } else {
                // Atualiza contagem de votos do pedido existente
                await db.run(`
                    UPDATE content_requests
                    SET votes = votes + 1, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [request.id]);
                await db.run(`
                    INSERT INTO content_request_votes (request_id, user_id, points_spent)
                    VALUES (?, ?, ?)
                `, [request.id, userId, COST]);
            }

            const updatedUser = await db.get('SELECT points FROM users WHERE id = ?', [userId]);

            res.json({
                success: true,
                remainingPoints: updatedUser ? updatedUser.points : 0,
                message: 'Pedido realizado com sucesso! Ele foi adicionado à lista dos Mais Pedidos.'
            });
        } catch (err) {
            console.error('Erro ao criar pedido com pontos:', err);
            res.status(500).json({ error: 'Erro ao processar pedido.' });
        }
    });

    // Listar pedidos da comunidade (Mais Pedidos - ranking)
    router.get('/requests', async (req, res) => {
        try {
            const { limit = 50, status = 'pending', filter = 'all' } = req.query;

            let query = `
                SELECT cr.*, 
                    (SELECT COUNT(*) FROM content_request_votes v WHERE v.request_id = cr.id) as total_votes
                FROM content_requests cr
            `;
            const params = [];
            const where = [];

            if (status && status !== 'all') {
                where.push('cr.status = ?');
                params.push(status);
            }

            if (filter === 'movie') {
                where.push("cr.media_type = 'movie'");
            } else if (filter === 'tv') {
                where.push("cr.media_type = 'tv' AND cr.is_anime = 0");
            } else if (filter === 'anime') {
                where.push('cr.is_anime = 1');
            }

            if (where.length > 0) {
                query += ' WHERE ' + where.join(' AND ');
            }

            query += ' ORDER BY cr.votes DESC, cr.updated_at DESC LIMIT ?';
            params.push(parseInt(limit, 10));

            const rows = await db.all(query, params);
            res.json(rows);
        } catch (err) {
            console.error('Erro ao listar pedidos:', err);
            res.status(500).json({ error: 'Erro ao buscar lista de pedidos.' });
        }
    });

    return router;
}
