import express from 'express';
import axios from 'axios';

const router = express.Router();

let sportsCache = {
    live: null,
    daily: null,
    lastUpdate: 0
};

const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 horas de cache para jogos do dia

// USER: COLOQUE SUA CHAVE DA API-SPORTS AQUI
const API_KEY = ""; 

export default function sportsRoutes() {

    router.get('/fixtures', async (req, res) => {
        if (!API_KEY) {
            return res.status(401).json({ error: "API Key não configurada no servidor." });
        }

        const now = Date.now();

        // Se o cache for válido, retorna ele
        if (sportsCache.daily && (now - sportsCache.lastUpdate < CACHE_DURATION)) {
            console.log("Servindo jogos do dia via cache local.");
            return res.json({
                daily: sportsCache.daily,
                fromCache: true
            });
        }

        try {
            console.log("Buscando jogos do dia na API-Sports...");
            const today = new Date().toISOString().split('T')[0];
            
            const headers = {
                'x-rapidapi-key': API_KEY,
                'x-rapidapi-host': 'v3.football.api-sports.io'
            };

            const response = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${today}`, { headers });

            sportsCache.daily = response.data.response || [];
            sportsCache.lastUpdate = now;

            res.json({
                daily: sportsCache.daily,
                fromCache: false
            });

        } catch (err) {
            console.error("Erro ao buscar API-Sports:", err.message);
            if (sportsCache.daily) {
                return res.json({
                    daily: sportsCache.daily,
                    fromCache: true,
                    error: "Falha na atualização, usando cache expirado."
                });
            }
            res.status(500).json({ error: "Erro ao buscar dados esportivos." });
        }
    });

    return router;
}
