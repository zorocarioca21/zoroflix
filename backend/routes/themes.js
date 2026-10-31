// backend/routes/themes.js
// Controlador e Rotas REST para o Live Code Editor & Gerenciador de Snapshots de Temas do CineGeek

import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

// Cache leve em memória para o tema ativo público
let activeThemeCache = null;
let activeThemeCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minuto de cache (invalidado imediatamente em ativações)

export function invalidateActiveThemeCache() {
    activeThemeCache = null;
    activeThemeCacheTime = 0;
}

// Middleware de autenticação de administrador
const adminAuth = (req, res, next) => {
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

export default function themesRoutes(db) {
    /**
     * GET /api/theme/active
     * Endpoint público leve (com cache em memória) consumido pelo frontend para injetar o CSS e HTML ativo
     */
    router.get('/active', async (req, res) => {
        try {
            const now = Date.now();
            if (activeThemeCache && (now - activeThemeCacheTime < CACHE_TTL_MS)) {
                return res.json(activeThemeCache);
            }

            const activeTheme = await db.get(`
                SELECT id, name, custom_css, custom_html_head, custom_html_body, updated_at
                FROM site_themes
                WHERE is_active = 1
                LIMIT 1
            `);

            const result = activeTheme || {
                id: 0,
                name: 'Sem Tema Ativo',
                custom_css: '',
                custom_html_head: '',
                custom_html_body: '',
                updated_at: new Date().toISOString()
            };

            activeThemeCache = result;
            activeThemeCacheTime = now;

            // Header de cache para navegador
            res.setHeader('Cache-Control', 'public, max-age=60');
            res.json(result);
        } catch (err) {
            console.error('[Themes] Erro ao buscar tema ativo:', err.message);
            res.status(500).json({ error: 'Falha ao recuperar tema ativo' });
        }
    });

    /**
     * GET /api/admin/themes
     * Lista todos os temas cadastrados para o seletor do editor
     */
    router.get('/admin/themes', adminAuth, async (req, res) => {
        try {
            const themes = await db.all(`
                SELECT id, name, custom_css, custom_html_head, custom_html_body, is_active, created_at, updated_at
                FROM site_themes
                ORDER BY is_active DESC, updated_at DESC
            `);
            res.json(themes);
        } catch (err) {
            console.error('[Themes Admin] Erro ao listar temas:', err.message);
            res.status(500).json({ error: 'Erro ao carregar lista de temas' });
        }
    });

    /**
     * POST /api/admin/themes
     * Cria um novo tema salvo (snapshot com nome, css e html)
     */
    router.post('/admin/themes', adminAuth, async (req, res) => {
        try {
            const { name, custom_css, custom_html_head, custom_html_body } = req.body;
            if (!name || !name.trim()) {
                return res.status(400).json({ error: 'O nome do tema é obrigatório.' });
            }

            const trimmedName = name.trim();
            const css = custom_css || '';
            const htmlHead = custom_html_head || '';
            const htmlBody = custom_html_body || '';

            const insertResult = await db.run(`
                INSERT INTO site_themes (name, custom_css, custom_html_head, custom_html_body, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [trimmedName, css, htmlHead, htmlBody]);

            const newTheme = await db.get(`SELECT * FROM site_themes WHERE id = ?`, [insertResult.lastID]);
            res.status(201).json(newTheme);
        } catch (err) {
            console.error('[Themes Admin] Erro ao criar tema:', err.message);
            res.status(500).json({ error: 'Erro ao criar novo tema' });
        }
    });

    /**
     * PUT /api/admin/themes/:id
     * Atualiza o CSS/HTML e nome de um tema existente
     */
    router.put('/admin/themes/:id', adminAuth, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, custom_css, custom_html_head, custom_html_body } = req.body;

            const existing = await db.get('SELECT * FROM site_themes WHERE id = ?', [id]);
            if (!existing) {
                return res.status(404).json({ error: 'Tema não encontrado.' });
            }

            const updatedName = name && name.trim() ? name.trim() : existing.name;
            const updatedCss = custom_css !== undefined ? custom_css : existing.custom_css;
            const updatedHead = custom_html_head !== undefined ? custom_html_head : existing.custom_html_head;
            const updatedBody = custom_html_body !== undefined ? custom_html_body : existing.custom_html_body;

            await db.run(`
                UPDATE site_themes
                SET name = ?, custom_css = ?, custom_html_head = ?, custom_html_body = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [updatedName, updatedCss, updatedHead, updatedBody, id]);

            if (existing.is_active === 1) {
                invalidateActiveThemeCache();
            }

            const updatedTheme = await db.get('SELECT * FROM site_themes WHERE id = ?', [id]);
            res.json(updatedTheme);
        } catch (err) {
            console.error('[Themes Admin] Erro ao atualizar tema:', err.message);
            res.status(500).json({ error: 'Erro ao atualizar tema' });
        }
    });

    /**
     * DELETE /api/admin/themes/:id
     * Remove um tema do banco (bloqueia remoção se estiver ativo)
     */
    router.delete('/admin/themes/:id', adminAuth, async (req, res) => {
        try {
            const { id } = req.params;
            const existing = await db.get('SELECT id, is_active FROM site_themes WHERE id = ?', [id]);
            if (!existing) {
                return res.status(404).json({ error: 'Tema não encontrado.' });
            }

            if (existing.is_active === 1) {
                return res.status(400).json({ error: 'Não é permitido excluir o tema que está atualmente publicado para o público.' });
            }

            await db.run('DELETE FROM site_themes WHERE id = ?', [id]);
            res.json({ success: true, message: 'Tema excluído com sucesso.' });
        } catch (err) {
            console.error('[Themes Admin] Erro ao remover tema:', err.message);
            res.status(500).json({ error: 'Erro ao remover tema' });
        }
    });

    /**
     * POST /api/admin/themes/:id/activate
     * Publica o tema selecionado para o público geral (garante apenas um is_active = 1)
     */
    router.post('/admin/themes/:id/activate', adminAuth, async (req, res) => {
        try {
            const { id } = req.params;
            const existing = await db.get('SELECT id, name FROM site_themes WHERE id = ?', [id]);
            if (!existing) {
                return res.status(404).json({ error: 'Tema não encontrado para ativação.' });
            }

            // Transação ou sequência para zerar os outros e ativar o escolhido
            await db.run('UPDATE site_themes SET is_active = 0');
            await db.run('UPDATE site_themes SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);

            invalidateActiveThemeCache();

            const activatedTheme = await db.get('SELECT * FROM site_themes WHERE id = ?', [id]);
            console.log(`[Themes] Tema "${existing.name}" (ID ${id}) publicado para todos.`);
            res.json({ success: true, theme: activatedTheme });
        } catch (err) {
            console.error('[Themes Admin] Erro ao ativar tema:', err.message);
            res.status(500).json({ error: 'Erro ao ativar tema para o público' });
        }
    });

    return router;
}
