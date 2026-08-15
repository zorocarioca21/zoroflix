import express from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Filtro avançado anti-bot para analytics.
 * Detecta e bloqueia crawlers, scrapers, bibliotecas de código,
 * ferramentas de teste e navegadores headless.
 */
function isBotRequest(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase().trim();

  // 1. Sem User-Agent = 99.9% script/bot/scraper
  if (!ua) return true;

  // 1.5 NOVO: Bloqueio agressivo de bots de ping simples (sem Accept-Language)
  // Navegadores reais quase sempre enviam qual idioma o usuário usa.
  const acceptLang = req.headers['accept-language'];
  if (!acceptLang) return true;

  // 2. Palavras-chave de Bots, Crawlers e Spiders conhecidos
  const botKeywords = [
    'bot', 'crawler', 'spider', 'slurp', 'crawling', 'archiver', 'transcoder',
    'fetch', 'checker', 'monitor', 'uptime', 'ping', 'probe', 'inspect', 'scan',
    'discord', 'whatsapp', 'telegram', 'facebookexternalhit', 'twitterbot', 'slackbot',
    'linkedinbot', 'embedly', 'quora', 'outbrain', 'pinterest', 'vkshare', 'skype',
    'ahrefs', 'semrush', 'mj12', 'dotbot', 'petalbot', 'bytespider', 'amazonbot',
    'bingbot', 'yandex', 'baidu', 'duckduckgo', 'sogou', 'exabot', 'ia_archiver',
    'googlebot', 'google-read-aloud', 'feedfetcher', 'lighthouse', 'gtmetrix', 'pagespeed',
    'headless', 'phantomjs', 'selenium', 'puppeteer', 'playwright', 'cypress'
  ];

  if (botKeywords.some(keyword => ua.includes(keyword))) return true;

  // 3. Ferramentas técnicas, scripts, linguagens e scanners de vulnerabilidade
  const techToolKeywords = [
    'python', 'go-http-client', 'curl/', 'wget/', 'axios', 'node-fetch', 'node-superagent',
    'java/', 'postman', 'insomnia', 'zgrab', 'nmap', 'sqlmap', 'nikto', 'masscan', 'censys',
    'libwww-perl', 'httpclient', 'http-client', 'apache-httpclient', 'rest-sharp',
    'guzzlehttp', 'winhttp', 'urlgrabber', 'scrapy', 'mechanize', 'beautifulsoup', 'go 1.'
  ];

  if (techToolKeywords.some(keyword => ua.includes(keyword))) return true;

  // 4. Exige assinatura de navegador legítimo (Mozilla/5.0 + Token de navegador)
  const isStandardBrowser = ua.includes('mozilla/') && (
    ua.includes('chrome/') ||
    ua.includes('safari/') ||
    ua.includes('firefox/') ||
    ua.includes('edg/') ||
    ua.includes('opera/') ||
    ua.includes('opr/')
  );

  if (!isStandardBrowser) return true;

  return false;
}

export default function analyticsRoutes(db) {
    const router = express.Router();

    // POST /api/analytics/pageview
    // Registra a visualização da página com validações anti-bot aprimoradas
    router.post('/pageview', async (req, res) => {
        try {
            // Garante que existe o cookie de UUID do visitante
            let visitorUuid = req.cookies?.zoroflix_uuid;
            if (!visitorUuid) {
                visitorUuid = uuidv4();
                res.cookie('zoroflix_uuid', visitorUuid, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
            }

            const { page, contentId } = req.body;
            // Se não informar a página, não faz nada
            if (!page) return res.json({ success: false });

            // Importar o middleware helper para extrair o usuário do Bearer token
            let userId = null;
            const authHeader = req.headers.authorization;
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                if (token && token !== 'null') {
                    try {
                        const jwt = await import('jsonwebtoken');
                        const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';
                        const decoded = jwt.verify(token, JWT_SECRET);
                        userId = decoded.id;
                    } catch (e) {
                         // Token expirado ou invalido
                    }
                }
            }

            // Executa verificação anti-bot rigorosa
            const isBot = isBotRequest(req);

            // Somente registrar se for uma página e não um bot
            if (!page.startsWith('/api') && !page.startsWith('/uploads') && !page.includes('.') && !isBot) {
                // Desduplicação: evita registrar a mesma pagina do mesmo visitante dentro da janela de 10 segundos
                const recentView = await db.get(
                    `SELECT 1 FROM page_views WHERE uuid = ? AND page = ? AND datetime(viewed_at, 'localtime') >= datetime('now', 'localtime', '-10 seconds')`,
                    [visitorUuid, page]
                );

                if (!recentView) {
                    await db.run(
                        `INSERT INTO page_views (uuid, user_id, content_id, page) VALUES (?, ?, ?, ?)`,
                        [visitorUuid, userId, contentId || null, page]
                    );
                }
            }
            res.json({ success: true });
        } catch (err) {
            console.error('Analytics pageview error:', err);
            res.status(500).json({ error: 'Erro interno' });
        }
    });

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
