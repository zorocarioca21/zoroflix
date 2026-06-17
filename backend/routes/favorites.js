import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ZORO_SUPER_SECRET_KEY';

// Middleware to conditionally parse token or UUID
const authOrUuid = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const uuid = req.query.uuid || req.body.uuid || req.headers['x-device-uuid'];

    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token && token !== 'null') {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                req.user_id = decoded.id; // Logged in user
            } catch (e) {
                // Token expirado ou inválido. Cai silenciosamente para usar o UUID anônimo
            }
        }
    }
    
    req.uuid = uuid;
    next();
};

export default function favoritesRoutes(db) {
    
    // Obter favoritos
    router.get('/', authOrUuid, async (req, res) => {
        try {
            let favorites;
            if (req.user_id) {
                favorites = await db.all('SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC', [req.user_id]);
            } else if (req.uuid) {
                favorites = await db.all('SELECT * FROM favorites WHERE uuid = ? AND user_id IS NULL ORDER BY created_at DESC', [req.uuid]);
            } else {
                return res.status(400).json({ error: 'UUID ou Token requerido' });
            }
            res.json(favorites);
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao buscar favoritos.' });
        }
    });

    // Validar status de um favorito específico
    router.get('/check/:contentId', authOrUuid, async (req, res) => {
        const { contentId } = req.params;
        try {
            let fav;
            if (req.user_id) {
                fav = await db.get('SELECT id FROM favorites WHERE user_id = ? AND content_id = ?', [req.user_id, contentId]);
            } else if (req.uuid) {
                 fav = await db.get('SELECT id FROM favorites WHERE uuid = ? AND content_id = ? AND user_id IS NULL', [req.uuid, contentId]);
            }
            res.json({ isFavorite: !!fav });
        } catch(e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao verificar favorito.' });
        }
    });

    // Adicionar favorito
    router.post('/', authOrUuid, async (req, res) => {
        const { content_id, media_type, title, poster_path } = req.body;
        
        if (!content_id || !media_type || (!req.user_id && !req.uuid)) {
            return res.status(400).json({ error: 'Dados incompletos ou falta de identificação.' });
        }

        try {
            // Verificar duplicidade antes
            let exists;
            if (req.user_id) {
                exists = await db.get('SELECT id FROM favorites WHERE user_id = ? AND content_id = ?', [req.user_id, content_id]);
            } else {
                exists = await db.get('SELECT id FROM favorites WHERE uuid = ? AND content_id = ? AND user_id IS NULL', [req.uuid, content_id]);
            }

            if (exists) {
                return res.status(400).json({ error: 'Já está nos favoritos.' });
            }

            await db.run(
                'INSERT INTO favorites (uuid, user_id, content_id, media_type, title, poster_path) VALUES (?, ?, ?, ?, ?, ?)',
                [req.uuid || null, req.user_id || null, content_id, media_type, title, poster_path]
            );

            res.json({ success: true, message: 'Adicionado aos favoritos.' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao adicionar favorito.' });
        }
    });

    // Remover favorito
    router.delete('/:contentId', authOrUuid, async (req, res) => {
        const { contentId } = req.params;
        
        try {
            if (req.user_id) {
                await db.run('DELETE FROM favorites WHERE user_id = ? AND content_id = ?', [req.user_id, contentId]);
            } else if (req.uuid) {
                await db.run('DELETE FROM favorites WHERE uuid = ? AND content_id = ? AND user_id IS NULL', [req.uuid, contentId]);
            } else {
                 return res.status(400).json({ error: 'Falta de identificação.' });
            }
            res.json({ success: true, message: 'Removido dos favoritos.' });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Erro ao remover favorito.' });
        }
    });

    return router;
}
