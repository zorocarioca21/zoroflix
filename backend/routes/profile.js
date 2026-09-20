import express from 'express';
import multer from 'multer';
import path from 'path';
import { UPLOADS_PATH } from '../db.js';

const router = express.Router();

import { uploadLocalFileToDrive } from '../services/zoroDriveService.js';
import fs from 'fs';

// Configuração de Upload (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_PATH);
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

    // UPLOAD AVATAR (100% Direto no Zoro Drive)
    router.post('/upload-avatar', upload.single('avatar'), async (req, res) => {
        const { userId } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

        const filePath = req.file.path;

        try {
            // Upload direto para o Zoro Drive (Pasta 'Avatares')
            const driveUrl = await uploadLocalFileToDrive(filePath, 'Avatares');

            // Deleta o arquivo temporário local em disco imediatamente
            try { fs.unlinkSync(filePath); } catch (e) {}

            if (!driveUrl) {
                return res.status(500).json({ error: 'Falha ao fazer upload para o Zoro Drive.' });
            }

            const httpsDriveUrl = driveUrl.replace(/^http:\/\//i, 'https://');

            // Atualiza o banco de dados principal com a URL CDN do Zoro Drive
            await db.run('UPDATE users SET avatar = ? WHERE id = ?', [httpsDriveUrl, userId]);

            console.log(`[PROFILE] Avatar do usuário #${userId} salvo no Zoro Drive: ${httpsDriveUrl}`);
            res.json({ avatar: httpsDriveUrl, message: 'Foto de perfil atualizada!' });

        } catch (err) {
            console.error('[PROFILE] Erro ao atualizar avatar:', err);
            try { fs.unlinkSync(filePath); } catch (e) {}
            res.status(500).json({ error: 'Erro ao atualizar banco de dados.' });
        }
    });

    return router;
}
