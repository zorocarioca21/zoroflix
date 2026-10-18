import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

const requireAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Token não fornecido' });
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Formato de token inválido' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 } // 30MB limit para arquivos M3U
});

/**
 * Função para parsear M3U / M3U8 string
 */
function parseM3U(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let currentExtinf = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            // Extrai logo
            let logoMatch = line.match(/tvg-logo="([^"]+)"/i) || line.match(/logo="([^"]+)"/i);
            const logo = logoMatch ? logoMatch[1] : null;

            // Extrai grupo / categoria
            let groupMatch = line.match(/group-title="([^"]+)"/i);
            const group = groupMatch ? groupMatch[1].trim() : 'Geral';

            // Extrai o nome do canal (após a última vírgula)
            let commaIndex = line.lastIndexOf(',');
            let name = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Canal Sem Nome';

            currentExtinf = {
                name,
                category: group || 'Geral',
                logo_url: logo
            };
        } else if (!line.startsWith('#') && currentExtinf) {
            // É a URL do canal
            channels.push({
                ...currentExtinf,
                stream_url: line
            });
            currentExtinf = null;
        }
    }

    return channels;
}

export default function iptvChannelsRoutes(db) {
    const router = express.Router();

    // ==========================================
    // ROTA PÚBLICA: Obter canais VIP cadastrados
    // ==========================================
    router.get('/all', async (req, res) => {
        try {
            const channels = await db.all(`
                SELECT id, name, category, logo_url, vip_badge, list_id 
                FROM iptv_channels 
                WHERE active = 1 
                ORDER BY vip_badge ASC, name ASC
            `);

            // Obter badges únicos cadastrados
            const badgesResult = await db.all(`
                SELECT DISTINCT vip_badge FROM iptv_channels WHERE active = 1 ORDER BY vip_badge ASC
            `);
            const badges = badgesResult.map(b => b.vip_badge);

            res.json({
                channels: channels.map(c => ({
                    id: `vip-db-${c.id}`,
                    db_id: c.id,
                    name: c.name,
                    category: c.vip_badge, // A categoria principal é o selo VIP (ex: VIP2)
                    sub_category: c.category, // ex: Abertos, Esportes
                    logo_url: c.logo_url,
                    vip_badge: c.vip_badge,
                    isVip: true,
                    embed_url: `/api/stream/proxy?url=${encodeURIComponent(c.id)}`
                })),
                badges
            });
        } catch (err) {
            console.error('Erro ao listar canais VIP do banco:', err);
            res.status(500).json({ error: 'Erro interno ao listar canais' });
        }
    });

    // ==========================================
    // ROTA STREAM RESOLVER: Pega URL real protegida
    // ==========================================
    router.get('/stream/:id', async (req, res) => {
        try {
            const id = req.params.id;
            const channel = await db.get(`SELECT stream_url FROM iptv_channels WHERE id = ? AND active = 1`, [id]);
            if (!channel) {
                return res.status(404).json({ error: 'Canal não encontrado' });
            }
            res.redirect(channel.stream_url);
        } catch (err) {
            res.status(500).json({ error: 'Erro ao resolver canal' });
        }
    });

    // ==========================================
    // ROTAS ADMIN
    // ==========================================

    // Listar Listas Cadastradas
    router.get('/admin/lists', requireAdmin, async (req, res) => {
        try {
            const lists = await db.all(`SELECT * FROM iptv_lists ORDER BY id DESC`);
            const totalChannels = await db.get(`SELECT COUNT(*) as count FROM iptv_channels`);
            res.json({ lists, totalChannels: totalChannels?.count || 0 });
        } catch (err) {
            res.status(500).json({ error: 'Erro interno' });
        }
    });

    // Upload e Importação de M3U
    router.post('/admin/upload', requireAdmin, upload.single('m3u'), async (req, res) => {
        try {
            let m3uText = '';
            if (req.file) {
                m3uText = req.file.buffer.toString('utf-8');
            } else if (req.body.m3u_text) {
                m3uText = req.body.m3u_text;
            } else {
                return res.status(400).json({ error: 'Envie um arquivo .m3u ou o texto da lista.' });
            }

            const { list_name, vip_badge = 'VIP 2' } = req.body;
            if (!list_name) {
                return res.status(400).json({ error: 'Nome da lista é obrigatório.' });
            }

            const cleanBadge = (vip_badge || 'VIP 2').trim().toUpperCase();
            const channels = parseM3U(m3uText);

            if (channels.length === 0) {
                return res.status(400).json({ error: 'Nenhum canal válido (#EXTINF) encontrado no arquivo M3U.' });
            }

            // Cria o registro da Lista
            const listResult = await db.run(
                `INSERT INTO iptv_lists (name, vip_badge, channel_count) VALUES (?, ?, ?)`,
                [list_name.trim(), cleanBadge, channels.length]
            );
            const listId = listResult.lastID;

            // Insere todos os canais em lote (Transaction)
            await db.run('BEGIN TRANSACTION');
            try {
                for (const ch of channels) {
                    await db.run(
                        `INSERT INTO iptv_channels (list_id, name, category, logo_url, stream_url, vip_badge) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [listId, ch.name, ch.category, ch.logo_url, ch.stream_url, cleanBadge]
                    );
                }
                await db.run('COMMIT');
            } catch (insertErr) {
                await db.run('ROLLBACK');
                throw insertErr;
            }

            res.json({
                success: true,
                message: `Lista "${list_name}" importada com sucesso! ${channels.length} canais com selo [${cleanBadge}] adicionados.`,
                list_id: listId,
                total_imported: channels.length
            });

        } catch (err) {
            console.error('Erro ao importar lista M3U:', err);
            res.status(500).json({ error: 'Erro ao processar M3U: ' + err.message });
        }
    });

    // Deletar Lista Inteira (e todos os canais dela)
    router.delete('/admin/lists/:id', requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const list = await db.get(`SELECT * FROM iptv_lists WHERE id = ?`, [id]);
            if (!list) {
                return res.status(404).json({ error: 'Lista não encontrada' });
            }

            await db.run(`DELETE FROM iptv_channels WHERE list_id = ?`, [id]);
            await db.run(`DELETE FROM iptv_lists WHERE id = ?`, [id]);

            res.json({ success: true, message: `Lista "${list.name}" e seus canais foram excluídos!` });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao excluir lista' });
        }
    });

    return router;
}
