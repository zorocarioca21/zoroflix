import express from 'express';

export default function analyticsRoutes(db) {
    const router = express.Router();

    // POST /api/analytics/search
    // Incrementa contador de buscas
    router.post('/search', async (req, res) => {
        const { query } = req.body;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query inválida' });
        }
        
        const normalizedQuery = query.trim().toLowerCase();
        if (normalizedQuery.length < 2) {
            return res.status(400).json({ error: 'Query muito curta' });
        }

        try {
            const existing = await db.get('SELECT query FROM search_analytics WHERE query = ?', [normalizedQuery]);
            if (existing) {
                await db.run('UPDATE search_analytics SET count = count + 1, last_searched_at = CURRENT_TIMESTAMP WHERE query = ?', [normalizedQuery]);
            } else {
                await db.run('INSERT INTO search_analytics (query, count) VALUES (?, 1)', [normalizedQuery]);
            }
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('Erro ao registrar analytics de busca:', error);
            res.status(500).json({ error: 'Erro interno' });
        }
    });

    // GET /api/analytics
    // Retorna as estatísticas para o painel admin
    router.get('/', async (req, res) => {
        try {
            const topSearches = await db.all('SELECT query, count FROM search_analytics ORDER BY count DESC LIMIT 20');
            const topWatched = await db.all('SELECT content_id, title, poster_path, media_type, views FROM content_analytics ORDER BY views DESC LIMIT 20');
            
            res.json({
                topSearches,
                topWatched
            });
        } catch (error) {
            console.error('Erro ao buscar estatísticas:', error);
            res.status(500).json({ error: 'Erro interno ao buscar estatísticas' });
        }
    });

    return router;
}
