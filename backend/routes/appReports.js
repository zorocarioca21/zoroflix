import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

export default function appReportsRoutes(db) {

    // POST /api/app-reports (Recebe reportes de erros e crashes do app)
    // Suporta tanto usuários logados (Bearer token) quanto app autenticado por x-api-key
    router.post('/', async (req, res) => {
        try {
            const apiKey = req.headers['x-api-key'] || req.headers['x-apikey'] || req.query.apikey || req.query.api_key;
            const authHeader = req.headers['authorization'];

            let userId = null;
            let userNick = null;

            // Se vier token JWT de usuário logado
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const token = authHeader.split(' ')[1];
                    const decoded = jwt.verify(token, JWT_SECRET);
                    if (decoded) {
                        userId = decoded.id;
                        userNick = decoded.nick || decoded.email || null;
                    }
                } catch (e) {}
            }

            // Se não veio token de usuário, verifica se ao menos veio uma api_key válida do app
            if (!userId && apiKey) {
                const keyRow = await db.get(
                    "SELECT * FROM api_keys WHERE key = ? AND (active = 1 OR active IS NULL)", [apiKey]
                );
                if (keyRow) {
                    userNick = req.body?.user_nick || 'Usuário App (Sem Login)';
                }
            }

            // Se ainda não tiver identificação, aceita com nickname informado ou anônimo
            if (!userNick) {
                userNick = req.body?.user_nick || 'Usuário do App';
            }

            const {
                error_type,
                error_message,
                error_stack,
                content_id,
                content_title,
                season,
                episode,
                device_model,
                android_version,
                app_version
            } = req.body || {};

            if (!error_message || !error_message.trim()) {
                return res.status(400).json({ error: 'error_message é obrigatório.' });
            }

            // Anti-flood: evita spam do mesmo erro no mesmo segundo/minuto
            const recent = await db.get(`
                SELECT id FROM app_crash_reports
                WHERE error_message = ? AND content_id = ? AND datetime(created_at, '+1 minute') > datetime('now')
                LIMIT 1
            `, [error_message.trim(), String(content_id || '')]);

            if (recent) {
                return res.json({ success: true, message: 'Erro já registrado recentemente.', duplicate: true });
            }

            const result = await db.run(`
                INSERT INTO app_crash_reports (
                    user_id, user_nick, app_version, device_model, android_version,
                    error_type, error_message, error_stack, content_id, content_title,
                    season, episode, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
            `, [
                userId,
                userNick,
                app_version || '1.0',
                device_model || 'Desconhecido',
                android_version || 'Android',
                error_type || 'playback_error',
                error_message.trim(),
                error_stack ? error_stack.trim() : null,
                content_id ? String(content_id) : null,
                content_title ? String(content_title) : null,
                season ? parseInt(season, 10) : null,
                episode ? parseInt(episode, 10) : null
            ]);

            return res.json({
                success: true,
                id: result.lastID,
                message: 'Erro reportado com sucesso! Nossa equipe técnica foi notificada.'
            });

        } catch (err) {
            console.error('Erro ao registrar reporte do app:', err);
            return res.status(500).json({ error: 'Erro interno ao salvar reporte: ' + err.message });
        }
    });

    return router;
}
