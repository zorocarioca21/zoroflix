import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

// Middleware idêntico ao do favorites (authOrUuid)
const authOrUuid = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const uuid = req.query.uuid || req.body.uuid || req.headers['x-device-uuid'];

    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token && token !== 'null') {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                req.user_id = decoded.id;
            } catch (e) {
                // Token inválido — cai pro UUID
            }
        }
    }

    req.uuid = uuid;
    next();
};

const MAX_RECENTS = 100;

export default function recentsRoutes(db) {

    // GET /api/recents — Lista os últimos 10 assistidos
    router.get('/', authOrUuid, async (req, res) => {
        try {
            let recents;
            if (req.user_id) {
                recents = await db.all(
                    'SELECT * FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT ?',
                    [req.user_id, MAX_RECENTS]
                );
            } else if (req.uuid) {
                recents = await db.all(
                    'SELECT * FROM watch_history WHERE uuid = ? AND user_id IS NULL ORDER BY watched_at DESC LIMIT ?',
                    [req.uuid, MAX_RECENTS]
                );
            } else {
                return res.status(400).json({ error: 'UUID ou Token requerido.' });
            }
            res.json(recents);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao buscar histórico.' });
        }
    });

    // POST /api/recents — Registra um conteúdo assistido (após 30s no player) e salva progresso
    router.post('/', authOrUuid, async (req, res) => {
        const { content_id, media_type, title, poster_path, season, episode, resume_time } = req.body;

        if (!content_id || !media_type || (!req.user_id && !req.uuid)) {
            return res.status(400).json({ error: 'Dados incompletos.' });
        }

        try {
            let existing;
            if (req.user_id) {
                existing = await db.get(
                    'SELECT id FROM watch_history WHERE user_id = ? AND content_id = ?',
                    [req.user_id, content_id]
                );
            } else {
                existing = await db.get(
                    'SELECT id FROM watch_history WHERE uuid = ? AND content_id = ? AND user_id IS NULL',
                    [req.uuid, content_id]
                );
            }

            if (existing) {
                // Já existe: atualiza o episódio/temporada, resume_time e o timestamp (sobe pro topo)
                await db.run(
                    'UPDATE watch_history SET title = ?, poster_path = ?, season = ?, episode = ?, resume_time = ?, watched_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [title, poster_path, season || null, episode || null, resume_time || 0, existing.id]
                );
            } else {
                // Não existe no recents: insere novo registro
                await db.run(
                    'INSERT INTO watch_history (uuid, user_id, content_id, media_type, title, poster_path, season, episode, resume_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [req.uuid || null, req.user_id || null, content_id, media_type, title, poster_path, season || null, episode || null, resume_time || 0]
                );
            }

            // --- SISTEMA DE ESTATÍSTICAS GLOBAIS (Top Assistidos) ---
            // Tenta inserir na tabela de views únicos do usuário. Se falhar por UNIQUE constraint, ele já contabilizou antes na vida!
            const identifier = req.user_id ? `user_${req.user_id}` : `uuid_${req.uuid}`;
            try {
                await db.run('INSERT INTO user_content_views (identifier, content_id) VALUES (?, ?)', [identifier, content_id]);
                
                // Se chegou aqui, é um view totalmente inédito dessa pessoa nesse filme/série!
                const analyticsExist = await db.get('SELECT content_id FROM content_analytics WHERE content_id = ?', [content_id]);
                if (analyticsExist) {
                    await db.run('UPDATE content_analytics SET views = views + 1, last_viewed_at = CURRENT_TIMESTAMP WHERE content_id = ?', [content_id]);
                } else {
                    await db.run('INSERT INTO content_analytics (content_id, media_type, title, poster_path, views) VALUES (?, ?, ?, ?, 1)', 
                        [content_id, media_type, title, poster_path]);
                }
            } catch (err) {
                // Erro esperado: UNIQUE constraint falhou (usuário já assistiu em algum momento do passado)
            }

            // Limpa os excedentes (mantém apenas os 10 mais recentes)
                if (req.user_id) {
                    await db.run(`
                        DELETE FROM watch_history WHERE user_id = ? AND id NOT IN (
                            SELECT id FROM watch_history WHERE user_id = ? ORDER BY watched_at DESC LIMIT ?
                        )
                    `, [req.user_id, req.user_id, MAX_RECENTS]);
                } else {
                    await db.run(`
                        DELETE FROM watch_history WHERE uuid = ? AND user_id IS NULL AND id NOT IN (
                            SELECT id FROM watch_history WHERE uuid = ? AND user_id IS NULL ORDER BY watched_at DESC LIMIT ?
                        )
                    `, [req.uuid, req.uuid, MAX_RECENTS]);
                }

            res.json({ success: true, message: 'Histórico atualizado.' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao registrar histórico.' });
        }
    });

    // PUT /api/recents/progress — Atualiza apenas o resume_time do vídeo atual
    router.put('/progress', authOrUuid, async (req, res) => {
        const { content_id, season, episode, resume_time } = req.body;

        if (!content_id || (!req.user_id && !req.uuid) || resume_time === undefined) {
            return res.status(400).json({ error: 'Dados incompletos.' });
        }

        try {
            let existing;
            if (req.user_id) {
                existing = await db.get(
                    'SELECT id FROM watch_history WHERE user_id = ? AND content_id = ?',
                    [req.user_id, content_id]
                );
            } else {
                existing = await db.get(
                    'SELECT id FROM watch_history WHERE uuid = ? AND content_id = ? AND user_id IS NULL',
                    [req.uuid, content_id]
                );
            }

            if (existing) {
                await db.run(
                    'UPDATE watch_history SET resume_time = ?, season = ?, episode = ? WHERE id = ?',
                    [resume_time, season || null, episode || null, existing.id]
                );
                res.json({ success: true, message: 'Progresso salvo.' });
            } else {
                res.status(404).json({ error: 'Item não encontrado no histórico.' });
            }
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao salvar progresso.' });
        }
    });

    // DELETE /api/recents/:content_id — Remove um item do histórico
    router.delete('/:content_id', authOrUuid, async (req, res) => {
        const { content_id } = req.params;

        try {
            if (req.user_id) {
                await db.run(
                    'DELETE FROM watch_history WHERE user_id = ? AND content_id = ?',
                    [req.user_id, content_id]
                );
            } else if (req.uuid) {
                await db.run(
                    'DELETE FROM watch_history WHERE uuid = ? AND content_id = ? AND user_id IS NULL',
                    [req.uuid, content_id]
                );
            } else {
                return res.status(400).json({ error: 'UUID ou Token requerido.' });
            }
            res.json({ success: true, message: 'Item removido do histórico.' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao remover item do histórico.' });
        }
    });

    // POST /api/recents/watched-episodes - Marca um episódio como assistido (80% concluído)
    router.post('/watched-episodes', authOrUuid, async (req, res) => {
        const { content_id, season, episode } = req.body;

        if (!content_id || season === undefined || episode === undefined || (!req.user_id && !req.uuid)) {
            return res.status(400).json({ error: 'Dados incompletos.' });
        }

        try {
            await db.run(
                'INSERT OR IGNORE INTO watched_episodes (uuid, user_id, content_id, season, episode) VALUES (?, ?, ?, ?, ?)',
                [req.uuid || null, req.user_id || null, content_id, parseInt(season), parseInt(episode)]
            );
            res.json({ success: true, message: 'Episódio marcado como concluído.' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao marcar episódio como concluído.' });
        }
    });

    // GET /api/recents/watched-episodes/:content_id - Retorna a lista de episódios concluídos (temporada e ep)
    router.get('/watched-episodes/:content_id', authOrUuid, async (req, res) => {
        const { content_id } = req.params;

        try {
            let watched = [];
            if (req.user_id) {
                watched = await db.all(
                    'SELECT season, episode FROM watched_episodes WHERE user_id = ? AND content_id = ?',
                    [req.user_id, content_id]
                );
            } else if (req.uuid) {
                watched = await db.all(
                    'SELECT season, episode FROM watched_episodes WHERE uuid = ? AND user_id IS NULL AND content_id = ?',
                    [req.uuid, content_id]
                );
            }
            res.json(watched);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao buscar episódios concluídos.' });
        }
    });

    // DELETE /api/recents/watched-episodes/:content_id/:season/:episode - Desmarca um episódio como assistido
    router.delete('/watched-episodes/:content_id/:season/:episode', authOrUuid, async (req, res) => {
        const { content_id, season, episode } = req.params;

        try {
            if (req.user_id) {
                await db.run(
                    'DELETE FROM watched_episodes WHERE user_id = ? AND content_id = ? AND season = ? AND episode = ?',
                    [req.user_id, content_id, parseInt(season), parseInt(episode)]
                );
            } else if (req.uuid) {
                await db.run(
                    'DELETE FROM watched_episodes WHERE uuid = ? AND user_id IS NULL AND content_id = ? AND season = ? AND episode = ?',
                    [req.uuid, content_id, parseInt(season), parseInt(episode)]
                );
            } else {
                return res.status(400).json({ error: 'UUID ou Token requerido.' });
            }
            res.json({ success: true, message: 'Episódio desmarcado como assistido.' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao desmarcar episódio.' });
        }
    });

    return router;
}
