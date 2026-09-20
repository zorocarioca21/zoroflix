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

    // UPLOAD AVATAR
    router.post('/upload-avatar', upload.single('avatar'), async (req, res) => {
        const { userId } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });

        const localAvatarUrl = `/uploads/${req.file.filename}`;
        const filePath = req.file.path;

        try {
            // 1. Salva a imagem localmente no banco para resposta instantânea
            await db.run('UPDATE users SET avatar = ? WHERE id = ?', [localAvatarUrl, userId]);
            
            // 2. Responde o cliente IMEDIATAMENTE (sem esperar o upload do drive)
            res.json({ avatar: localAvatarUrl, message: 'Foto de perfil atualizada!' });

            // 3. Processa o upload para o Zoro Drive em SEGUNDO PLANO (sem travar a requisição)
            uploadLocalFileToDrive(filePath, 'Avatares')
                .then(async (driveUrl) => {
                    if (driveUrl) {
                        const httpsDriveUrl = driveUrl.replace(/^http:\/\//i, 'https://');
                        await db.run('UPDATE users SET avatar = ? WHERE id = ?', [httpsDriveUrl, userId]);
                        console.log(`[PROFILE] Avatar do usuário #${userId} espelhado no Zoro Drive com sucesso: ${httpsDriveUrl}`);
                        try { fs.unlinkSync(filePath); } catch (e) {}
                    }
                })
                .catch(err => {
                    console.error(`[PROFILE] Falha ao espelhar avatar no Zoro Drive para usuário #${userId}:`, err.message);
                });

        } catch (err) {
            console.error('[PROFILE] Erro ao atualizar avatar:', err);
            res.status(500).json({ error: 'Erro ao atualizar banco de dados.' });
        }
    });

    return router;
}
