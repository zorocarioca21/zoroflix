import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'app');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config for APK files
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `cinegeek-v${req.body.version_name || Date.now()}${ext}`;
        cb(null, name);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
    fileFilter: (req, file, cb) => {
        if (file.originalname.endsWith('.apk')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos .apk são permitidos.'));
        }
    }
});

export default function appUpdatesRoutes(db) {
    // Rota Pública: Obter a última atualização
    router.get('/latest', async (req, res) => {
        try {
            const latest = await db.get(`SELECT * FROM app_updates ORDER BY version_code DESC, id DESC LIMIT 1`);
            if (!latest) {
                return res.json({ available: false });
            }
            
            const baseUrl = req.protocol + '://' + req.get('host');
            res.json({
                available: true,
                version_name: latest.version_name,
                version_code: latest.version_code,
                release_notes: latest.release_notes,
                force_update: latest.force_update === 1,
                download_url: `${baseUrl}/downloads/app/${latest.apk_filename}`
            });
        } catch (err) {
            console.error('Erro ao buscar latest app update:', err);
            res.status(500).json({ error: 'Erro interno' });
        }
    });

    // Rota Admin: Upload de nova atualização
    router.post('/upload', requireAdmin, upload.single('apk'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Arquivo APK é obrigatório.' });
            }

            const { version_name, version_code, release_notes, force_update } = req.body;
            
            if (!version_name || !version_code) {
                return res.status(400).json({ error: 'Versão e código da versão são obrigatórios.' });
            }

            const isForceUpdate = force_update === 'true' || force_update === true ? 1 : 0;
            const apkFilename = req.file.filename;

            // Delete old APK files to save space
            try {
                const oldUpdates = await db.all(`SELECT apk_filename FROM app_updates`);
                for (const old of oldUpdates) {
                    if (old.apk_filename && old.apk_filename !== apkFilename) {
                        const oldPath = path.join(uploadDir, old.apk_filename);
                        if (fs.existsSync(oldPath)) {
                            fs.unlinkSync(oldPath);
                        }
                    }
                }
            } catch (err) {
                console.error('Erro ao deletar APKs antigos:', err);
            }

            await db.run(
                `INSERT INTO app_updates (version_name, version_code, release_notes, force_update, apk_filename) VALUES (?, ?, ?, ?, ?)`,
                [version_name, parseInt(version_code, 10), release_notes || '', isForceUpdate, apkFilename]
            );

            res.json({ success: true, message: 'Atualização cadastrada com sucesso!' });
        } catch (err) {
            console.error('Erro ao fazer upload da atualização:', err);
            res.status(500).json({ error: err.message || 'Erro interno' });
        }
    });
    
    // Rota Admin: Histórico de atualizações
    router.get('/history', requireAdmin, async (req, res) => {
        try {
            const history = await db.all(`SELECT * FROM app_updates ORDER BY version_code DESC, id DESC`);
            res.json({ history });
        } catch (err) {
            res.status(500).json({ error: 'Erro interno' });
        }
    });

    return router;
}
