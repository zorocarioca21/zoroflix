import express from 'express';
import axios from 'axios';

const router = express.Router();

// Canais e Jogos em cache para evitar chamadas excessivas
let sportsCache = {
    events: null,
    channels: null,
    lastUpdate: 0
};

const CACHE_DURATION = 1 * 60 * 1000; // 1 minuto de cache (placar em tempo real)

// Função para normalizar nomes e facilitar o matching (ex: "SporTV 1 HD" -> "sportv1")
const normalizeName = (name) => {
    if (!name) return "";
    return name.toLowerCase()
        .replace(/\s+/g, '')
        .replace(/hd/g, '')
        .replace(/4k/g, '')
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

async function fetchInternalChannels() {
    try {
        const url = 'https://superflixapi.fit/lista?category=canais&format=json';
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        return response.data?.data || [];
    } catch (err) {
        console.error("Erro ao buscar canais internos para matching:", err.message);
        return [];
    }
}

export default function sportsRoutes() {

    router.get('/fixtures', async (req, res) => {
        const now = Date.now();

        // Se o cache for válido, retorna ele
        if (sportsCache.events && (now - sportsCache.lastUpdate < CACHE_DURATION)) {
            return res.json({
                daily: sportsCache.events,
                fromCache: true
            });
        }

        try {
            console.log(`Buscando jogos e canais para Smart Linking...`);
            
            // 1. Busca Canais Internos (se não tiver em cache ou se expirou)
            let internalChannels = sportsCache.channels;
            if (!internalChannels || (now - sportsCache.lastUpdate > CACHE_DURATION * 4)) {
                internalChannels = await fetchInternalChannels();
                sportsCache.channels = internalChannels;
            }

            // 2. Busca Eventos do Rei Dos Embeds
            // Buscamos apenas Futebol por padrão, mas a API suporta mais
            const rdeUrl = 'https://reidosembeds.com/api/eventos?category=Futebol';
            const rdeResponse = await axios.get(rdeUrl);
            const rdeEvents = rdeResponse.data?.data || [];

            // 3. Processamento e Smart Linking
            const processedEvents = rdeEvents.map(event => {
                const updatedEmbeds = (event.embeds || []).map(embed => {
                    const normProvider = normalizeName(embed.provider);
                    
                    // Tenta encontrar o canal correspondente no Zoroflix
                    const match = internalChannels.find(ch => {
                        const normInternal = normalizeName(ch.name);
                        return normInternal.includes(normProvider) || normProvider.includes(normInternal);
                    });

                    return {
                        ...embed,
                        zoroflix_id: match ? match.id : null,
                        zoroflix_logo: match ? match.logo_url : embed.logo
                    };
                });

                // Mapeamento para manter compatibilidade parcial e adicionar novos dados
                return {
                    fixture: {
                        id: event.id,
                        date: event.start_time,
                        status: { short: event.status.toUpperCase() },
                        timestamp: new Date(event.start_time).getTime() / 1000
                    },
                    league: {
                        name: event.competition,
                        logo: event.competition_logo,
                        country: "World" // RDE não separa país da liga explicitamente fácil
                    },
                    teams: {
                        home: { name: event.time1_name, logo: event.time1 },
                        away: { name: event.time2_name, logo: event.time2 }
                    },
                    goals: event.score ? {
                        home: event.score.split('-')[0]?.trim(),
                        away: event.score.split('-')[1]?.trim()
                    } : null,
                    // Dados Extras do Rei Dos Embeds
                    rde_custom: {
                        title: event.title,
                        poster: event.poster,
                        description: event.description,
                        play_url: event.play_event_url,
                        embeds: updatedEmbeds
                    }
                };
            });

            sportsCache.events = processedEvents;
            sportsCache.lastUpdate = now;

            res.json({
                daily: processedEvents,
                fromCache: false
            });

        } catch (err) {
            console.error("Erro crítico na rota de esportes:", err.message);
            
            if (sportsCache.events) {
                return res.json({
                    daily: sportsCache.events,
                    fromCache: true,
                    error: "Falha ao buscar dados novos, usando cache."
                });
            }
            
            res.status(500).json({ error: "Erro ao buscar dados do Rei Dos Embeds." });
        }
    });

    return router;
}
