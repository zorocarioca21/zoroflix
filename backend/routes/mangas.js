import express from 'express';

export default function createMangasRouter(db) {
    const router = express.Router();

    // Listar mangás (admin e público)
    router.get('/', async (req, res) => {
        try {
            const mangas = await db.all("SELECT * FROM mangas ORDER BY updated_at DESC");
            res.json({ mangas });
        } catch (e) {
            console.error('Erro ao listar mangás:', e);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    });

    // Adicionar um novo mangá (Apenas Admin)
    router.post('/', async (req, res) => {
        try {
            const { title, original_title, synopsis, cover_url, banner_url, author, genres, status, type, year, anilist_id } = req.body;
            
            if (!title) {
                return res.status(400).json({ error: 'O título é obrigatório.' });
            }

            const result = await db.run(`
                INSERT INTO mangas (title, original_title, synopsis, cover_url, banner_url, author, genres, status, type, year, anilist_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [title, original_title, synopsis, cover_url, banner_url, author, genres, status, type, year, anilist_id]);

            res.status(201).json({ success: true, id: result.lastID });
        } catch (e) {
            console.error('Erro ao criar mangá:', e);
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    });

    // Listar capítulos de um mangá
    router.get('/:id/chapters', async (req, res) => {
        try {
            const { id } = req.params;
            const chapters = await db.all("SELECT * FROM manga_chapters WHERE manga_id = ? ORDER BY chapter_number ASC", [id]);
            res.json({ chapters });
        } catch (e) {
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    });

    return router;
}
