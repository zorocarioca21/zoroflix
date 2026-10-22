import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

const authUser = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Faça login para reportar um problema.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
};

export default function contentReportsRoutes(db) {
    // Criar um novo reporte (apenas usuários logados free/vip/admin)
    router.post('/', authUser, async (req, res) => {
        try {
            const userId = req.user.id;
            const {
                tmdb_id,
                media_type,
                season,
                episode,
                title,
                description,
                source,
                page_url
            } = req.body || {};

            if (!description || !description.trim()) {
                return res.status(400).json({ error: 'Por favor, informe uma descrição do problema.' });
            }

            const cleanDesc = description.trim();
            if (cleanDesc.length < 5) {
                return res.status(400).json({ error: 'Descrição muito curta. Detalhe um pouco mais o erro.' });
            }

            // Anti-flood: evita que o mesmo usuário reporte o mesmo conteúdo repetidamente nos últimos 5 minutos
            const recent = await db.get(`
                SELECT id FROM content_reports
                WHERE user_id = ? AND tmdb_id = ? AND datetime(created_at, '+5 minutes') > datetime('now')
            `, [userId, String(tmdb_id || '')]);

            if (recent) {
                return res.status(429).json({ error: 'Você já enviou um reporte deste conteúdo recentemente. Aguarde nossa equipe analisar.' });
            }

            const result = await db.run(`
                INSERT INTO content_reports (
                    user_id, tmdb_id, media_type, season, episode,
                    title, description, source, page_url, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `, [
                userId,
                tmdb_id ? String(tmdb_id) : null,
                media_type || null,
                season ? parseInt(season, 10) : null,
                episode ? parseInt(episode, 10) : null,
                title || null,
                cleanDesc,
                source || 'player',
                page_url || null
            ]);

            return res.json({ success: true, reportId: result.lastID, message: 'Reporte enviado com sucesso! Nossa equipe irá verificar.' });
        } catch (err) {
            console.error('Erro ao salvar reporte de conteúdo:', err);
            return res.status(500).json({ error: 'Erro interno ao registrar reporte.' });
        }
    });

    return router;
}
