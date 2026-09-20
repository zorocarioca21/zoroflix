import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { UPLOADS_PATH } from '../db.js';

const router = express.Router();

// Subpasta dedicada para avatares dentro de uploads
const AVATARS_PATH = path.join(UPLOADS_PATH, 'avatars');
if (!fs.existsSync(AVATARS_PATH)) {
    fs.mkdirSync(AVATARS_PATH, { recursive: true });
}

// Configuração de Upload (Multer) — salva direto na pasta de avatares
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, AVATARS_PATH);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

export default function profileRoutes(db) {

    // ATUALIZAR NICK
    router.put('/update-nick', async (req, res) => {
        const { userId, newNick } = req.body;

        try {
            const user = await db.get('SELECT last_nick_change FROM users WHERE id = ?', [userId]);
            
            if (user.last_nick_change) {
                const lastChange = new Date(user.last_nick_change);
                const now = new Date();
                const diffDays = Math.ceil((now - lastChange) / (1000 * 60 * 60 * 24));
                
                if (diffDays < 30) {
                    return res.status(400).json({ error: `Você só poderá mudar o nick novamente em ${30 - diffDays} dias.` });
                }
            }

            await db.run('UPDATE users SET nick = ?, last_nick_change = CURRENT_TIMESTAMP WHERE id = ?', [newNick, userId]);
            res.json({ message: 'Nick atualizado com sucesso!' });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao atualizar nick.' });
        }
    });

    // UPLOAD AVATAR (Salva localmente no servidor)
    router.post('/upload-avatar', upload.single('avatar'), async (req, res) => {
        const { userId } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

        try {
            // Deleta o avatar antigo do usuário se existir (e for local)
            const currentUser = await db.get('SELECT avatar FROM users WHERE id = ?', [userId]);
            if (currentUser?.avatar && currentUser.avatar.startsWith('/avatars/')) {
                const oldFile = path.join(AVATARS_PATH, path.basename(currentUser.avatar));
                try { if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile); } catch (e) {}
            }

            // Caminho público que será servido pelo express.static
            const publicUrl = `/avatars/${req.file.filename}`;

            // Atualiza o banco de dados com o caminho local
            await db.run('UPDATE users SET avatar = ? WHERE id = ?', [publicUrl, userId]);

            console.log(`[PROFILE] Avatar do usuário #${userId} salvo localmente: ${publicUrl}`);
            res.json({ avatar: publicUrl, message: 'Foto de perfil atualizada!' });

        } catch (err) {
            console.error('[PROFILE] Erro ao atualizar avatar:', err);
            // Se deu erro, remove o arquivo que foi salvo
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            res.status(500).json({ error: 'Erro ao atualizar banco de dados.' });
        }
    });

    return router;
}
