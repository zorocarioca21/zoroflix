import express from 'express';
import axios from 'axios';

let epgCache = null;
let epgCacheTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

export default function epgRoutes() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const now = Date.now();
    if (epgCache && (now - epgCacheTime < CACHE_DURATION)) {
      res.setHeader('Content-Type', 'text/xml; charset=utf-8');
      return res.send(epgCache);
    }

    try {
      const response = await axios.get('https://reidosembeds.com/api/guia', {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      if (response.data) {
        epgCache = response.data;
        epgCacheTime = now;
        res.setHeader('Content-Type', 'text/xml; charset=utf-8');
        return res.send(response.data);
      }
    } catch (err) {
      console.error('[EPG Route Error]', err.message);
      if (epgCache) {
        res.setHeader('Content-Type', 'text/xml; charset=utf-8');
        return res.send(epgCache);
      }
    }

    res.status(500).json({ error: 'Erro ao buscar o Guia de Programação' });
  });

  return router;
}
