import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { invalidateTmdbKeysCache } from '../services/tmdbKeyService.js';

const execAsync = promisify(exec);

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado: requer privilégios de administrador.' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
};

export default function adminRoutes(db, tmdbDb) {
    // Estatísticas de Mapeamento TMDB e Zoro Drive
    router.get('/mapping-stats', async (req, res) => {
        try {
            const targetDb = tmdbDb || db;
            const totalCached = await targetDb.get('SELECT COUNT(*) as cnt FROM tmdb_media_cache');
            const totalMovies = await targetDb.get("SELECT COUNT(*) as cnt FROM tmdb_media_cache WHERE media_type = 'movie'");
            const totalSeries = await targetDb.get("SELECT COUNT(*) as cnt FROM tmdb_media_cache WHERE media_type = 'tv'");
            const totalDrivePosters = await targetDb.get("SELECT COUNT(*) as cnt FROM tmdb_media_cache WHERE poster_url LIKE '%zorobot.shop%'");
            const totalDriveBackdrops = await targetDb.get("SELECT COUNT(*) as cnt FROM tmdb_media_cache WHERE backdrop_url LIKE '%zorobot.shop%'");
            const totalEpisodes = await targetDb.get('SELECT COUNT(*) as cnt FROM tmdb_episodes_cache');
            const totalDriveStills = await targetDb.get("SELECT COUNT(*) as cnt FROM tmdb_episodes_cache WHERE still_url LIKE '%zorobot.shop%'");
            
            // Fila de sincronização (Mapeados vs Total)
            const mappedInQueue = await db.get("SELECT COUNT(*) as cnt FROM sync_queue WHERE tmdb_id IS NOT NULL AND tmdb_id != 'NOT_FOUND'");
            const totalInQueue = await db.get("SELECT COUNT(*) as cnt FROM sync_queue");

            // Itens já concluídos (baixados e enviados pro Telegram) que estão mapeados com TMDB
            const completedTotal = await db.get("SELECT COUNT(*) as cnt FROM sync_queue WHERE status = 'completed'");
            const completedMapped = await db.get("SELECT COUNT(*) as cnt FROM sync_queue WHERE status = 'completed' AND tmdb_id IS NOT NULL AND tmdb_id != 'NOT_FOUND'");

            res.json({
                totalCached: totalCached?.cnt || 0,
                totalMovies: totalMovies?.cnt || 0,
                totalSeries: totalSeries?.cnt || 0,
                totalDrivePosters: totalDrivePosters?.cnt || 0,
                totalDriveBackdrops: totalDriveBackdrops?.cnt || 0,
                totalEpisodes: totalEpisodes?.cnt || 0,
                totalDriveStills: totalDriveStills?.cnt || 0,
                queueMapped: mappedInQueue?.cnt || 0,
                queueTotal: totalInQueue?.cnt || 0,
                completedTotal: completedTotal?.cnt || 0,
                completedMapped: completedMapped?.cnt || 0
            });
        } catch (err) {
            console.error('[ADMIN STATS] Erro ao obter estatísticas de mapeamento:', err.message);
            res.status(500).json({ error: 'Erro ao obter estatísticas de mapeamento' });
        }
    });

    // Endpoint para listar os arquivos que falharam no mapeamento TMDB (NOT_FOUND)
    router.get('/not-found', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const notFoundItems = await db.all(`
                SELECT id, title, url, created_at, updated_at 
                FROM sync_queue 
                WHERE tmdb_id = 'NOT_FOUND' 
                ORDER BY updated_at DESC 
                LIMIT ?
            `, [limit]);
            
            res.json({
                total: notFoundItems.length,
                items: notFoundItems
            });
        } catch (err) {
            console.error('[ADMIN STATS] Erro ao listar falhas de mapeamento:', err.message);
            res.status(500).json({ error: 'Erro ao listar falhas de mapeamento' });
        }
    });

    // Endpoint para reprocessar falhas com IA Gemini 3.5 Flash
    router.post('/remap-ai', async (req, res) => {
        try {
            // Reseta TODOS os itens NOT_FOUND para NULL e atualiza a data para serem processados na hora
            const result = await db.run(`
                UPDATE sync_queue 
                SET tmdb_id = NULL, updated_at = CURRENT_TIMESTAMP 
                WHERE tmdb_id = 'NOT_FOUND'
            `);
            
            const count = result.changes || 0;

            // Dispara imediatamente o mapeador para os primeiros lotes
            const { mapPendingTmdbItems } = await import('../services/tmdbMapper.js');
            mapPendingTmdbItems(db, 50).catch(e => console.error('[REMAP AI] Erro ao disparar lote:', e.message));

            res.json({ 
                success: true, 
                count, 
                message: count > 0 
                    ? `🚀 ${count} itens redefinidos! O mapeador com IA começou a processar tudo agora mesmo.` 
                    : `Nenhum item com status NOT_FOUND encontrado para reprocessar.` 
            });
        } catch (err) {
            console.error('[ADMIN REMAP AI] Erro:', err.message);
            res.status(500).json({ error: 'Erro ao reprocessar itens com IA.' });
        }
    });

    // Endpoint para obter e alternar estado de pausa da IA no mapeador automático (10 em 10)
    router.get('/ai-mapper/status', async (req, res) => {
        try {
            const { getAiMapperPauseState } = await import('../services/tmdbMapper.js');
            res.json({ paused: getAiMapperPauseState() });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao verificar status da IA.' });
        }
    });

    router.post('/ai-mapper/toggle', async (req, res) => {
        try {
            const { getAiMapperPauseState, setAiMapperPauseState } = await import('../services/tmdbMapper.js');
            const currentState = getAiMapperPauseState();
            const newState = setAiMapperPauseState(!currentState);
            res.json({ 
                success: true, 
                paused: newState, 
                message: newState ? 'IA no mapeador automático PAUSADA.' : 'IA no mapeador automático RETOMADA.' 
            });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao alternar pausa da IA.' });
        }
    });

    // Endpoint para Assistente de IA do Sistema (Botão flutuante na aba de Sync)
    router.post('/sync-ai-assistant', async (req, res) => {
        try {
            const { question } = req.body;
            if (!question) return res.status(400).json({ error: 'Pergunta obrigatória.' });

            // Pega estatísticas em tempo real do sistema para municiar a IA de contexto
            const queueStats = await db.get(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN tmdb_id IS NOT NULL AND tmdb_id != 'NOT_FOUND' THEN 1 ELSE 0 END) as mapped,
                    SUM(CASE WHEN tmdb_id = 'NOT_FOUND' THEN 1 ELSE 0 END) as not_found,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
                    SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
                FROM sync_queue
            `);

            const targetDb = tmdbDb || db;
            let catalogStats = {};
            try {
                const totalCached = await targetDb.get('SELECT COUNT(*) as cnt FROM tmdb_media_cache');
                const totalEpisodes = await targetDb.get('SELECT COUNT(*) as cnt FROM tmdb_episodes_cache');
                const totalDrivePosters = await targetDb.get("SELECT COUNT(*) as cnt FROM tmdb_media_cache WHERE poster_url LIKE '%zorobot.shop%'");
                const totalDriveBackdrops = await targetDb.get("SELECT COUNT(*) as cnt FROM tmdb_media_cache WHERE backdrop_url LIKE '%zorobot.shop%'");
                const totalDriveStills = await targetDb.get("SELECT COUNT(*) as cnt FROM tmdb_episodes_cache WHERE still_url LIKE '%zorobot.shop%'");
                catalogStats = {
                    totalCached: totalCached?.cnt || 0,
                    totalEpisodes: totalEpisodes?.cnt || 0,
                    totalDrivePosters: totalDrivePosters?.cnt || 0,
                    totalDriveBackdrops: totalDriveBackdrops?.cnt || 0,
                    totalDriveStills: totalDriveStills?.cnt || 0
                };
            } catch (e) {}

            const systemContext = `Você é o Assistente Especialista de Inteligência Artificial do Zoroflix (CineGeek), o sistema de streaming e sincronização com IPTV e Telegram.
Você conhece toda a arquitetura:
1. MAPEAMENTO TMDB:
- Filmes têm seu próprio TMDB ID individual (ex: Oppenheimer = 872585).
- Séries de TV têm UM ÚNICO TMDB ID que representa a SÉRIE INTEIRA (ex: Grey's Anatomy = 1416). Todos os episódios de todas as temporadas de Grey's Anatomy compartilham o TMDB ID 1416, mas são diferenciados pelos campos season_number (temporada) e episode_number (episódio).
2. CARDS E MÉTRICAS DO PAINEL DE SYNC:
- "Filmes & Séries": Quantidade de obras únicas salvas no cache do TMDB.
- "Fila Mapeada": Mostra quantos itens da fila do sync_queue já tiveram o TMDB ID identificado com sucesso (ex: ${queueStats?.mapped || 0} de ${queueStats?.total || 0}).
- "Posters no Drive": Imagens de capa de filmes/séries enviadas para o Zoro Drive (Cloud Storage).
- "Backdrops no Drive": Imagens de fundo/banners dos filmes/séries enviadas para o Zoro Drive.
- "Stills de Episódios": Fotos/miniaturas específicas de cada episódio de série salvas no Zoro Drive.
3. MOTOR E FILA:
- Fila (sync_queue): Itens baixados da lista M3U da IPTV e enviados para canais do Telegram via MTProto / TelegramClient.
- Status: pending (aguardando download), downloading, pending_upload (baixado, aguardando telegram), uploading (enviando ao Telegram), completed (concluído), error, skipped (ignorado/canais 24h/câmeras CAM de reality shows).

Estatísticas Atuais em Tempo Real:
- Total na fila: ${queueStats?.total || 0}
- Mapeados com TMDB: ${queueStats?.mapped || 0}
- Falhas TMDB (NOT_FOUND): ${queueStats?.not_found || 0}
- Concluídos: ${queueStats?.completed || 0}
- Pendentes: ${queueStats?.pending || 0}
- Erros: ${queueStats?.error || 0}
- Ignorados: ${queueStats?.skipped || 0}
- Obras únicas no Catálogo TMDB: ${catalogStats?.totalCached || 0}
- Stills de Episódios no Drive: ${catalogStats?.totalDriveStills || 0} de ${catalogStats?.totalEpisodes || 0}

Instrução de Resposta:
- Seja DIRETO AO PONTO. No início da resposta, dê um resumo claro em 1 ou 2 frases curtas.
- Em seguida, explique os detalhes com tópicos (bullet points) objetivos e organizados.
- Use negrito para dar ênfase a conceitos e termos importantes.
- Evite blocos de texto gigantes e prolixos. Seja amigável, técnico e conciso em português do Brasil.`;

            const axios = (await import('axios')).default;
            const https = (await import('https')).default;
            const agent = new https.Agent({ family: 4 });
            const ZOROBOT_API_KEY = process.env.ZOROBOT_API_KEY || '21santoryu21';

            const resp = await axios.post(`https://api.zorobot.shop/api/ai/chat?apiKey=${ZOROBOT_API_KEY}`, {
                prompt: question,
                model: 'gemini-3.5-flash',
                systemInstruction: systemContext,
                temperature: 0.3,
                maxTokens: 1500
            }, {
                headers: { 'Content-Type': 'application/json' },
                httpsAgent: agent,
                timeout: 30000
            });

            const reply = resp.data?.resposta || resp.data?.response || 'Desculpe, não consegui formular uma resposta no momento.';
            res.json({ success: true, answer: reply });
        } catch (err) {
            const errData = err.response?.data;
            const errMessage = err.message || '';
            console.error('[ADMIN AI ASSISTANT] Erro:', errMessage, errData || '');

            // Se for cota esgotada ou erro interno da API de IA
            if (JSON.stringify(errData || '').includes('429') || JSON.stringify(errData || '').includes('Quota exceeded') || JSON.stringify(errData || '').includes('RESOURCE_EXHAUSTED')) {
                return res.json({
                    success: true,
                    answer: '⚠️ **Cota de IA Temporariamente Esgotada**\n\nA chave de API do Gemini atingiu o limite de requisições gratuitas (Rate Limit / Quota Exceeded). Ela retornará automaticamente assim que a cota do Google renovar ou quando adicionar créditos. Enquanto isso, o sistema continuará operando com a busca direta normal do TMDB!'
                });
            }

            res.json({
                success: true,
                answer: `⚠️ Não foi possível obter resposta da IA no momento (Erro no servidor da IA: ${errMessage}). Tente novamente em alguns instantes.`
            });
        }
    });
    // Endpoint para obter o tamanho da pasta temp
    router.get('/temp-stats', async (req, res) => {
        try {
            const tempPath = os.tmpdir();
            let size = 0;
            let count = 0;
            try {
                const files = await fs.readdir(tempPath);
                for (const file of files) {
                    // Só contabiliza arquivos de vídeo que criamos (com _id no final)
                    if (file.match(/_(\d+)\.(mp4|mkv|avi|webm)$/i)) {
                        const stat = await fs.stat(path.join(tempPath, file));
                        size += stat.size;
                        count++;
                    }
                }
            } catch (err) { }
            res.json({ size, count });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao ler pasta temp' });
        }
    });

    // Endpoint para limpar a pasta temp manualmente (Painel Admin)
    router.post('/clear-temp', async (req, res) => {
        try {
            const tempPath = os.tmpdir();
            try {
                const files = await fs.readdir(tempPath);
                // Busca quais estão na fila ativos para não apagar eles sem querer
                const activeJobs = await db.all("SELECT id FROM sync_queue WHERE status IN ('downloading', 'pending_upload', 'uploading', 'processing')");
                const activeIds = activeJobs.map(job => job.id.toString());

                for (const file of files) {
                    const match = file.match(/_(\d+)\.(mp4|mkv|avi|webm)$/i);
                    if (match) {
                        const fileId = match[1];
                        if (!activeIds.includes(fileId)) {
                            await fs.unlink(path.join(tempPath, file)).catch(() => {});
                        }
                    }
                }
            } catch (err) { }
            res.json({ success: true, message: 'Arquivos não-ativos removidos do cache com sucesso!' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao limpar cache' });
        }
    });

    // Ver denúncias com suporte a paginação e busca
    router.get('/reports', async (req, res) => {
        const { limit = 5, offset = 0, search = '' } = req.query;
        try {
            const reports = await db.all(`
                SELECT r.*, u.nick as reporter_nick, c.text as comment_text, c.content_id, c.media_type, c.episode_id
                FROM reports r
                JOIN users u ON r.user_id = u.id
                JOIN comments c ON r.comment_id = c.id
                WHERE r.status = 'pending' AND (u.nick LIKE ? OR c.text LIKE ? OR r.reason LIKE ?)
                ORDER BY r.created_at DESC
                LIMIT ? OFFSET ?
            `, [`%${search}%`, `%${search}%`, `%${search}%`, parseInt(limit), parseInt(offset)]);
            res.json(reports);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar denúncias.' });
        }
    });

    // Ver comentários com suporte a paginação, busca e status (active, moderated, hidden)
    router.get('/comments', async (req, res) => {
        const { limit = 5, offset = 0, search = '', status = 'active' } = req.query;
        let whereClause = "1=1";
        let params = [];

        if (status === 'active') {
            whereClause += " AND c.status = 'active'";
        } else if (status === 'moderated') {
            whereClause += " AND c.status = 'moderated'";
        } else if (status === 'hidden') {
            whereClause += " AND c.status = 'hidden'";
        } else if (status === 'deleted') {
            whereClause += " AND (c.status = 'moderated' OR c.status = 'hidden')";
        }

        if (search) {
            whereClause += ` AND (u.nick LIKE ? OR c.text LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        params.push(parseInt(limit), parseInt(offset));

        try {
            const comments = await db.all(`
                SELECT c.*, u.nick as user_nick, u.avatar as user_avatar
                FROM comments c
                JOIN users u ON c.user_id = u.id
                WHERE ${whereClause}
                ORDER BY c.created_at DESC
                LIMIT ? OFFSET ?
            `, params);
            res.json(comments);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar comentários.' });
        }
    });

    // Buscar usuários com paginação automática
    router.get('/users', async (req, res) => {
        const { query = '', limit = 5, offset = 0 } = req.query;
        try {
            const users = await db.all(`
                SELECT id, nick, email, role, banned_until, uuid, created_at 
                FROM users 
                WHERE nick LIKE ? OR email LIKE ?
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `, [`%${query}%`, `%${query}%`, parseInt(limit), parseInt(offset)]);
            res.json(users);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar usuários.' });
        }
    });

    // Mudar Role (VIP, ADM, FREE)
    router.patch('/users/:id/role', async (req, res) => {
        const { role } = req.body;
        const { id } = req.params;
        try {
            await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao mudar cargo.' });
        }
    });

    // Detalhes completos do usuário (Histórico, Favoritos, Comentários e Perfil)
    router.get('/users/:id/details', async (req, res) => {
        const { id } = req.params;
        try {
            const user = await db.get(`
                SELECT id, uuid, nick, email, role, avatar, banned_until, created_at 
                FROM users 
                WHERE id = ?
            `, [id]);

            if (!user) {
                return res.status(404).json({ error: 'Usuário não encontrado.' });
            }

            const rawWatchHistory = await db.all(`
                SELECT * FROM watch_history 
                WHERE user_id = ? 
                ORDER BY watched_at DESC 
                LIMIT 50
            `, [id]);

            const watchHistory = rawWatchHistory.map(item => {
                let cleanTitle = item.title;
                if (!cleanTitle || cleanTitle === 'Carregando...' || cleanTitle.trim() === '') {
                    cleanTitle = item.media_type === 'canal' 
                        ? `Canal (${item.content_id})` 
                        : (item.media_type === 'movie' ? `Filme (${item.content_id})` : `Série (${item.content_id})`);
                }
                return { ...item, title: cleanTitle };
            });

            const favorites = await db.all(`
                SELECT * FROM favorites 
                WHERE user_id = ? 
                ORDER BY created_at DESC
            `, [id]);

            const comments = await db.all(`
                SELECT * FROM comments 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT 50
            `, [id]);

            const stats = {
                totalWatched: watchHistory.length,
                totalFavorites: favorites.length,
                totalComments: comments.length
            };

            res.json({
                user,
                watchHistory,
                favorites,
                comments,
                stats
            });
        } catch (err) {
            console.error('Erro ao buscar detalhes do usuário:', err);
            res.status(500).json({ error: 'Erro ao carregar detalhes do usuário.' });
        }
    });


    // Moderação de Comentário (Granular: moderated ou hidden)
    router.patch('/comments/:id/moderation', async (req, res) => {
        const { id } = req.params;
        const { mode } = req.body; // 'moderated', 'hidden' ou 'active'
        try {
            if (mode === 'moderated') {
                await db.run("UPDATE comments SET status = 'moderated' WHERE id = ?", [id]);
            } else if (mode === 'hidden') {
                await db.run("UPDATE comments SET status = 'hidden' WHERE id = ?", [id]);
            } else if (mode === 'active') {
                await db.run("UPDATE comments SET status = 'active' WHERE id = ?", [id]);
            }
            await db.run("UPDATE reports SET status = 'resolved' WHERE comment_id = ?", [id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro na moderação.' });
        }
    });

    // Ignorar denúncia
    router.patch('/reports/:id/dismiss', async (req, res) => {
        try {
            await db.run("UPDATE reports SET status = 'dismissed' WHERE id = ?", [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao ignorar denúncia.' });
        }
    });

    // Verificar se um usuário (por nick ou email) é admin
    router.post('/verify', async (req, res) => {
        const { identifier } = req.body; 
        try {
            const user = await db.get(`
                SELECT id, role FROM users 
                WHERE (nick = ? OR email = ?) AND role = 'admin'
            `, [identifier, identifier]);
            if (user) {
                res.json({ isAdmin: true, userId: user.id });
            } else {
                res.json({ isAdmin: false });
            }
        } catch (err) {
            res.status(500).json({ error: 'Erro ao verificar admin.' });
        }
    });

    // Obter todas as configurações
    router.get('/config/all', async (req, res) => {
        try {
            const configs = await db.all("SELECT * FROM configs");
            const configMap = {};
            configs.forEach(c => { configMap[c.key] = c.value === '1'; });
            res.json(configMap);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar configs.' });
        }
    });

    // Alterar uma configuração específica
    router.post('/config/update', async (req, res) => {
        const { key, enabled } = req.body;
        try {
            await db.run("INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)", [key, enabled ? '1' : '0']);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao salvar config.' });
        }
    });



    // TMDB API Keys Manager
    router.get('/tmdb-keys', async (req, res) => {
        try {
            const targetDb = tmdbDb || db;
            const row = await targetDb.get("SELECT value FROM system_settings WHERE key = 'tmdb_api_keys'");
            res.json({ keys: row ? row.value : '' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar TMDB keys.' });
        }
    });

    router.post('/tmdb-keys', async (req, res) => {
        const { keys } = req.body;
        try {
            await db.run(
                `INSERT INTO system_settings (key, value, updated_at) VALUES ('tmdb_api_keys', ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
                [keys]
            );
            if (tmdbDb) {
                await tmdbDb.run(
                    `INSERT INTO system_settings (key, value, updated_at) VALUES ('tmdb_api_keys', ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
                    [keys]
                );
            }
            invalidateTmdbKeysCache();
            res.json({ success: true });
        } catch (err) {
            console.error('Error saving TMDB keys:', err);
            res.status(500).json({ error: 'Erro ao salvar TMDB keys: ' + err.message });
        }
    });

    // ZoroBot Video API Key Manager
    router.get('/zorobot-video-key', async (req, res) => {
        try {
            const row = await db.get("SELECT value FROM system_settings WHERE key = 'zorobot_video_api_key'");
            res.json({ key: row ? row.value : '' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar ZoroBot Video key.' });
        }
    });

    router.post('/zorobot-video-key', async (req, res) => {
        const { key } = req.body;
        try {
            await db.run(
                `INSERT INTO system_settings (key, value, updated_at) VALUES ('zorobot_video_api_key', ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
                [key || '']
            );
            if (tmdbDb) {
                await tmdbDb.run(
                    `INSERT INTO system_settings (key, value, updated_at) VALUES ('zorobot_video_api_key', ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
                    [key || '']
                );
            }
            res.json({ success: true });
        } catch (err) {
            console.error('Error saving ZoroBot Video key:', err);
            res.status(500).json({ error: 'Erro ao salvar ZoroBot Video key: ' + err.message });
        }
    });

    // Estatísticas de acessos
    router.get('/stats', async (req, res) => {
        try {
            // Ajustado para converter a data do banco (UTC) para o fuso horário local e basear os cálculos
            // Visitas (contabiliza 1 por dia por usuário usando subquery)
            const monthly = await db.get("SELECT COUNT(*) as cnt FROM (SELECT uuid FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime', 'start of month') GROUP BY uuid, date(viewed_at, 'localtime'))");
            const weekly = await db.get("SELECT COUNT(*) as cnt FROM (SELECT uuid FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime', '-7 days') GROUP BY uuid, date(viewed_at, 'localtime'))");
            const daily = await db.get("SELECT COUNT(DISTINCT uuid) as cnt FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime')");

            // Pessoas Únicas (Totalmente distintas no período integral)
            const uniqueMonthly = await db.get("SELECT COUNT(DISTINCT uuid) as cnt FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime', 'start of month')");
            const uniqueWeekly = await db.get("SELECT COUNT(DISTINCT uuid) as cnt FROM page_views WHERE datetime(viewed_at, 'localtime') >= date('now', 'localtime', '-7 days')");

            res.json({ 
                monthly: monthly.cnt, 
                weekly: weekly.cnt, 
                daily: daily.cnt,
                monthlyUnique: uniqueMonthly.cnt,
                weeklyUnique: uniqueWeekly.cnt
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter estatísticas.' });
        }
    });

    // Rota para zerar o histórico de estatísticas de visualização
    router.delete('/stats/clear', async (req, res) => {
        try {
            await db.run('DELETE FROM page_views');
            res.json({ success: true });
        } catch (err) {
            console.error('Clear stats error:', err);
            res.status(500).json({ error: 'Erro ao zerar estatísticas.' });
        }
    });

    // ============================================================
    //  💓 HEARTBEAT — o frontend envia pings a cada 15 segundos
    // ============================================================
    router.post('/heartbeat', async (req, res) => {
        try {
            const uuid = req.cookies?.zoroflix_uuid;
            if (!uuid) return res.json({ online: 0 });

            const { page, title } = req.body;
            let userId = null;

            // Extrai a ID do usuário se houver token válido de login
            const authHeader = req.headers.authorization;
            if (authHeader) {
                const token = authHeader.split(' ')[1];
                if (token && token !== 'null') {
                    try {
                        const decoded = jwt.verify(token, JWT_SECRET);
                        userId = decoded.id;
                    } catch (e) {
                         // Ignora silenciosamente tokens vencidos
                    }
                }
            }

            // Busca nick do usuário se estiver logado (via cookie/header)
            let nick = null;
            if (userId) {
                const u = await db.get("SELECT nick FROM users WHERE id = ?", [userId]);
                nick = u?.nick;
            }

            // Upsert: cria ou atualiza a sessão
            await db.run(`
                INSERT INTO live_sessions (session_id, uuid, user_id, page, title, last_heartbeat)
                VALUES (?, ?, ?, ?, ?, datetime('now'))
                ON CONFLICT(session_id) DO UPDATE SET 
                    user_id = excluded.user_id,
                    page = excluded.page,
                    title = excluded.title,
                    last_heartbeat = datetime('now')
            `, [uuid, uuid, userId, page || '/', title || 'Navegando']);

            // Limpa sessões mortas (sem heartbeat há mais de 10 segundos)
            await db.run(`DELETE FROM live_sessions WHERE last_heartbeat < datetime('now', '-10 seconds')`);

            // Retorna contagem de online
            const result = await db.get(`SELECT COUNT(DISTINCT uuid) as cnt FROM live_sessions`);
            res.json({ online: result.cnt });
        } catch (err) {
            console.error('Heartbeat error:', err);
            res.json({ online: 0 });
        }
    });

    // Sessões ao vivo (para a tabela do admin)
    router.get('/live', async (req, res) => {
        try {
            // Limpa sessões expiradas
            await db.run(`DELETE FROM live_sessions WHERE last_heartbeat < datetime('now', '-10 seconds')`);

            const active = await db.all(`
                SELECT ls.uuid, u.nick, ls.page, ls.title, ls.last_heartbeat
                FROM live_sessions ls
                LEFT JOIN users u ON ls.user_id = u.id
                ORDER BY ls.last_heartbeat DESC
            `);

            const formatted = active.map(s => ({
                uuid: s.uuid,
                name: s.nick || 'Visitante',
                page: s.page || '/',
                title: s.title || 'Navegando',
                lastSeen: s.last_heartbeat
            }));
            res.json(formatted);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter sessões ao vivo.' });
        }
    });

    // Contagem de online
    router.get('/online', async (req, res) => {
        try {
            await db.run(`DELETE FROM live_sessions WHERE last_heartbeat < datetime('now', '-10 seconds')`);
            const result = await db.get(`SELECT COUNT(DISTINCT uuid) as cnt FROM live_sessions`);
            res.json({ online: result.cnt });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Erro ao obter usuários online.' });
        }
    });

    // ============================================================
    //  🔑 API KEYS — Gerenciamento de chaves para acesso mobile
    // ============================================================
    
    // Listar todas as API Keys
    router.get('/api-keys', async (req, res) => {
        try {
            const keys = await db.all("SELECT * FROM api_keys ORDER BY created_at DESC");
            res.json(keys);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar API Keys.' });
        }
    });

    // Criar API Key
    router.post('/api-keys', async (req, res) => {
        const { name, permissions, allowed_domains } = req.body;
        if (!name) return res.status(400).json({ error: 'Campo "name" é obrigatório.' });

        const perms = permissions || 'full';
        const domains = allowed_domains || null;

        // Gera uma key aleatória segura
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = 'zfx_';
        for (let i = 0; i < 32; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        try {
            const result = await db.run(
                "INSERT INTO api_keys (name, key, permissions, allowed_domains, active, usage_count) VALUES (?, ?, ?, ?, 1, 0)", [name, key, perms, domains]
            );
            res.json({ success: true, id: result.lastID, name, key, permissions: perms, allowed_domains: domains, active: 1 });
        } catch (err) {
            console.error("Erro ao criar API key:", err);
            res.status(500).json({ error: 'Erro ao criar API Key: ' + err.message });
        }
    });

    // Ativar/Desativar API Key
    router.patch('/api-keys/:id/toggle', async (req, res) => {
        try {
            const apiKey = await db.get("SELECT * FROM api_keys WHERE id = ?", [req.params.id]);
            if (!apiKey) return res.status(404).json({ error: 'API Key não encontrada.' });

            const newStatus = apiKey.active ? 0 : 1;
            await db.run("UPDATE api_keys SET active = ? WHERE id = ?", [newStatus, req.params.id]);
            res.json({ success: true, active: newStatus === 1 });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao alterar API Key.' });
        }
    });

    // Deletar API Key
    router.delete('/api-keys/:id', async (req, res) => {
        try {
            await db.run("DELETE FROM api_keys WHERE id = ?", [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao deletar API Key.' });
        }
    });

    // ==========================================
    // SISTEMA & ATUALIZAÇÕES AUTOMÁTICAS (VPS)
    // ==========================================

    // Atualizar Site Principal (Sem Quedas: git pull + npm run build)
    router.post('/system/update-site', authMiddleware, async (req, res) => {
        const logs = [];
        try {
            logs.push('🚀 Iniciando atualização do Site Principal...');
            
            // 1. Git pull
            try {
                const { stdout: pullOut } = await execAsync('git pull', { timeout: 60000 });
                logs.push(`📥 Git Pull:\n${pullOut.trim()}`);
            } catch (gitErr) {
                logs.push(`⚠️ Aviso Git Pull: ${gitErr.message}`);
            }

            // 2. Build Frontend (Vite)
            logs.push('📦 Compilando novos arquivos com Vite (npm run build)...');
            const { stdout: buildOut } = await execAsync('npm run build', { timeout: 180000 });
            logs.push(`✅ Build concluído com sucesso:\n${buildOut.trim()}`);
            logs.push('🎉 O Site Principal foi atualizado e está ativo sem nenhuma queda na API!');

            res.json({ success: true, logs });
        } catch (err) {
            logs.push(`❌ Erro durante o processo: ${err.message}`);
            res.status(500).json({ success: false, error: err.message, logs });
        }
    });

    // Atualizar Backend / API / Embed (git pull + pm2 reload)
    router.post('/system/update-backend', authMiddleware, async (req, res) => {
        const logs = [];
        try {
            logs.push('🚀 Iniciando atualização da API e Embed...');
            
            // 1. Git pull
            try {
                const { stdout: pullOut } = await execAsync('git pull', { timeout: 60000 });
                logs.push(`📥 Git Pull:\n${pullOut.trim()}`);
            } catch (gitErr) {
                logs.push(`⚠️ Aviso Git Pull: ${gitErr.message}`);
            }

            // 2. PM2 Reload suave (Zero Downtime)
            logs.push('⚡ Aplicando reload no servidor Node (Zero Downtime)...');
            try {
                const { stdout: pm2Out } = await execAsync('pm2 reload all || pm2 restart all', { timeout: 30000 });
                logs.push(`✅ PM2 Reload executado:\n${pm2Out.trim()}`);
            } catch (pm2Err) {
                logs.push(`ℹ️ PM2 Reload: ${pm2Err.message}`);
            }

            logs.push('🎉 API e Rotas de Embed atualizadas com sucesso!');
            res.json({ success: true, logs });
        } catch (err) {
            logs.push(`❌ Erro durante o processo: ${err.message}`);
            res.status(500).json({ success: false, error: err.message, logs });
        }
    });

    // Atualizar Tudo (Site + API + Embed)
    router.post('/system/update-all', authMiddleware, async (req, res) => {
        const logs = [];
        try {
            logs.push('🚀 Iniciando Atualização Geral (Site + API + Embed)...');
            
            // 1. Git pull
            try {
                const { stdout: pullOut } = await execAsync('git pull', { timeout: 60000 });
                logs.push(`📥 Git Pull:\n${pullOut.trim()}`);
            } catch (gitErr) {
                logs.push(`⚠️ Aviso Git Pull: ${gitErr.message}`);
            }

            // 2. Build Frontend
            logs.push('📦 Compilando Frontend (npm run build)...');
            const { stdout: buildOut } = await execAsync('npm run build', { timeout: 180000 });
            logs.push(`✅ Build concluído:\n${buildOut.trim()}`);

            // 3. PM2 Reload
            logs.push('⚡ Aplicando reload no backend...');
            try {
                const { stdout: pm2Out } = await execAsync('pm2 reload all || pm2 restart all', { timeout: 30000 });
                logs.push(`✅ PM2 Reload executado:\n${pm2Out.trim()}`);
            } catch (pm2Err) {
                logs.push(`ℹ️ PM2 Reload: ${pm2Err.message}`);
            }

            logs.push('🎉 Atualização Geral concluída com sucesso!');
            res.json({ success: true, logs });
        } catch (err) {
            logs.push(`❌ Erro durante o processo: ${err.message}`);
            res.status(500).json({ success: false, error: err.message, logs });
        }
    });

    // Reiniciar Processo Node/PM2 (Restart total)
    router.post('/system/restart', authMiddleware, async (req, res) => {
        const logs = [];
        try {
            logs.push('🔄 Solicitando reinicialização do servidor...');
            res.json({ success: true, logs: ['🔄 Reinicialização iniciada. O servidor estará de volta em alguns segundos!'] });

            setTimeout(() => {
                exec('pm2 restart all', () => {
                    process.exit(0);
                });
            }, 1000);
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}
