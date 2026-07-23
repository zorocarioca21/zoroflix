import { v4 as uuidv4 } from 'uuid';

/**
 * Filtro avançado anti-bot para o middleware de visualizações.
 * Detecta e bloqueia crawlers, scrapers, bibliotecas de código,
 * ferramentas de teste e navegadores headless.
 */
function isBotRequest(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase().trim();

  // 1. Sem User-Agent = 99.9% script/bot/scraper
  if (!ua) return true;

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

export default function trackView(db) {
  return async (req, res, next) => {
    try {
      // Garante que existe o cookie de UUID do visitante
      let visitorUuid = req.cookies?.zoroflix_uuid;
      if (!visitorUuid) {
        visitorUuid = uuidv4();
        res.cookie('zoroflix_uuid', visitorUuid, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'strict' });
      }

      const userId = req.user?.id || null;
      const contentId = req.params?.contentId || null;
      const page = req.path;

      // Executa verificação anti-bot rigorosa
      const isBot = isBotRequest(req);

      // Apenas registrar visualizações de páginas válidas do front-end (Ignora API e Arquivos) e ignora bots
      if (!page.startsWith('/api') && !page.startsWith('/uploads') && !page.includes('.') && !isBot) {
        // Desduplicação: evita registrar a mesma pagina do mesmo visitante dentro da janela de 10 segundos
        const recentView = await db.get(
          `SELECT 1 FROM page_views WHERE uuid = ? AND page = ? AND datetime(viewed_at, 'localtime') >= datetime('now', 'localtime', '-10 seconds')`,
          [visitorUuid, page]
        );

        if (!recentView) {
          await db.run(
            `INSERT INTO page_views (uuid, user_id, content_id, page) VALUES (?, ?, ?, ?)`,
            [visitorUuid, userId, contentId, page]
          );
        }
      }
    } catch (err) {
      console.error('trackView middleware error:', err);
    }
    next();
  };
}
