import express from 'express';
const router = express.Router();

export default function embedRoutes(db) {
    // Rota para contar as estatísticas do banco de dados para a Landing Page
    router.get('/stats', async (req, res) => {
        try {
            // Buscar o total de vídeos salvos
            const totalResult = await db.get("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'completed'");
            const total = totalResult?.count || 0;

            // Criar uma estimativa baseada no total
            const moviesCount = Math.floor(total * 0.35);
            const episodesCount = Math.floor(total * 0.65);
            const seriesCount = Math.floor(episodesCount / 20); // Média de 20 eps por série
            const animesCount = Math.floor(seriesCount * 0.4); 
            const doramasCount = Math.floor(seriesCount * 0.15); 

            res.json({
                movies: moviesCount,
                series: seriesCount,
                animes: animesCount,
                doramas: doramasCount,
                episodes: episodesCount,
                channels: 0
            });
        } catch (error) {
            console.error("Erro ao buscar estatísticas do embed:", error);
            res.status(500).json({ error: "Erro interno" });
        }
    });

    // Rota para validar a API Key do Embed e incrementar o contador
    router.post('/verify', async (req, res) => {
        const { apikey, domain } = req.body;

        if (!apikey) {
            return res.json({ valid: false, reason: "missing_key" });
        }

        try {
            const keyData = await db.get("SELECT * FROM api_keys WHERE key = ? AND active = 1", [apikey]);
            if (!keyData) {
                return res.json({ valid: false, reason: "invalid_key" });
            }

            // Validate permissions
            if (keyData.permissions !== 'embed' && keyData.permissions !== 'full') {
                return res.json({ valid: false, reason: "invalid_permission" });
            }

            // Validate domain if present in DB
            if (keyData.allowed_domains && keyData.allowed_domains.trim() !== '') {
                const allowed = keyData.allowed_domains.split(',').map(d => d.trim().toLowerCase());
                let requestDomain = domain ? domain.toLowerCase() : '';
                
                try {
                    if (requestDomain.startsWith('http')) {
                        requestDomain = new URL(requestDomain).hostname;
                    }
                } catch (e) {}

                let domainMatched = false;
                for (const allowedDomain of allowed) {
                    if (requestDomain.includes(allowedDomain)) {
                        domainMatched = true;
                        break;
                    }
                }

                if (!domainMatched && requestDomain !== 'localhost' && requestDomain !== '127.0.0.1') {
                    return res.json({ valid: false, reason: "domain_mismatch" });
                }
            }

            // Update usage count
            await db.run("UPDATE api_keys SET usage_count = usage_count + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?", [keyData.id]);

            return res.json({ valid: true });

        } catch (error) {
            console.error("Erro ao validar API Key:", error);
            res.status(500).json({ error: "Erro interno" });
        }
    });

    return router;
}
