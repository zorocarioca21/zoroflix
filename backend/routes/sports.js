import express from 'express';
import axios from 'axios';

const router = express.Router();

let sportsCache = {
    daily: null,
    lastUpdate: 0
};

const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hora de cache

const API_KEYS = [
    "2b7ddfd9c2bfad3e6180307031e776e2", // Original
    "d02d4e9f9d9045b5d5966c344e95ab36",
    "e14b3475f1f1802cec16cd5f031e430f",
    "35a70205debff8f2599b322fab4cca78",
    "23e37f4db3d7e6a94a8bf1a67a48d744"
];

let currentKeyIndex = 0;

export default function sportsRoutes() {

    router.get('/fixtures', async (req, res) => {
        const now = Date.now();

        // Se o cache for válido, retorna ele
        if (sportsCache.daily && (now - sportsCache.lastUpdate < CACHE_DURATION)) {
            return res.json({
                daily: sportsCache.daily,
                fromCache: true
            });
        }

        let success = false;
        let attempts = 0;
        let response = null;

        while (!success && attempts < API_KEYS.length) {
            try {
                const activeKey = API_KEYS[currentKeyIndex];
                console.log(`Buscando jogos do dia na API-Sports... (Tentativa ${attempts + 1}, Chave index: ${currentKeyIndex})`);
                const today = new Date().toISOString().split('T')[0];

                const headers = {
                    'x-rapidapi-key': activeKey,
                    'x-rapidapi-host': 'v3.football.api-sports.io'
                };

                const apiResponse = await axios.get(`https://v3.football.api-sports.io/fixtures?date=${today}`, { headers });

                // Checa se a API retornou erro de limite na Key
                if (apiResponse.data.errors && apiResponse.data.errors.requests) {
                    console.log(`Chave atual esgotou o limite. Trocando de chave...`);
                    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                    attempts++;
                    continue; // Tenta com a próxima chave
                }

                sportsCache.daily = apiResponse.data.response || [];
                sportsCache.lastUpdate = now;
                success = true;
                response = sportsCache.daily;

            } catch (err) {
                console.error("Erro ao buscar API-Sports com a chave atual:", err.message);
                // Pode ser falha de rede da API ou limite. Vamos rodar a chave por segurança.
                currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                attempts++;
            }
        }

        if (success) {
            res.json({
                daily: response,
                fromCache: false
            });
        } else {
            // Se todas as chaves falharem, tentar usar o cache expirado como salva-vidas
            if (sportsCache.daily) {
                return res.json({
                    daily: sportsCache.daily,
                    fromCache: true,
                    error: "Falha geral nas chaves, usando cache expirado."
                });
            }
            res.status(500).json({ error: "Erro ao buscar dados esportivos e todas as chaves falharam." });
        }
    });

    return router;
}
