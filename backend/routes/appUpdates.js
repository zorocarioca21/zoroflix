import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

/**
 * Extrai o hash SHA-256 do Certificado de Assinatura do APK (v2 / v3 Signing Block)
 */
function extractApkSignatureHash(filePath) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const stat = fs.fstatSync(fd);
        const buffer = Buffer.alloc(Math.min(stat.size, 65536));
        fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, stat.size - buffer.length));

        let eocdOffset = -1;
        for (let i = buffer.length - 22; i >= 0; i--) {
            if (buffer.readUInt32LE(i) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset === -1) { fs.closeSync(fd); return null; }

        const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
        const magicBuf = Buffer.alloc(24);
        fs.readSync(fd, magicBuf, 0, 24, cdOffset - 24);
        const magic = magicBuf.slice(8).toString('utf-8');
        if (magic !== 'APK Sig Block 42') { fs.closeSync(fd); return null; }

        const blockSize = magicBuf.readBigUInt64LE(0);
        const blockStart = cdOffset - Number(blockSize) - 8;
        const blockData = Buffer.alloc(Number(blockSize));
        fs.readSync(fd, blockData, 0, blockData.length, blockStart);
        fs.closeSync(fd);

        let pos = 8;
        while (pos < blockData.length - 24) {
            const idSize = Number(blockData.readBigUInt64LE(pos));
            const id = blockData.readUInt32LE(pos + 8);
            if (id === 0x7109871a || id === 0xf05368c0) {
                const signerData = blockData.slice(pos + 12, pos + 8 + idSize);
                const signersLen = signerData.readUInt32LE(0);
                const firstSigner = signerData.slice(4, 4 + signersLen);
                const signedDataLen = firstSigner.readUInt32LE(0);
                const signedData = firstSigner.slice(4, 4 + signedDataLen);
                const digestsLen = signedData.readUInt32LE(0);
                let p2 = 4 + digestsLen;
                p2 += 4;
                const firstCertLen = signedData.readUInt32LE(p2);
                const certBytes = signedData.slice(p2 + 4, p2 + 4 + firstCertLen);
                const sha256 = crypto.createHash('sha256').update(certBytes).digest('hex').match(/.{2}/g).join(':').toUpperCase();
                return sha256;
            }
            pos += 8 + idSize;
        }
    } catch (e) {
        console.warn('[APK Signature Extractor] Erro ao extrair hash:', e.message);
    }
    return null;
}

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
        const name = `cinegeek-${Date.now()}${ext}`;
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
    // Rota pública de configurações dinâmicas do App Mobile
    router.get('/config', async (req, res) => {
        try {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS app_dynamic_config (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                INSERT OR IGNORE INTO app_dynamic_config (key, value) VALUES ('adblock_protection', 'false');
            `);

            const row = await db.get(`SELECT value FROM app_dynamic_config WHERE key = 'adblock_protection'`);
            const isEnabled = row ? (row.value === 'true' || row.value === '1') : false;

            res.json({
                success: true,
                adblock_protection: isEnabled
            });
        } catch (err) {
            res.json({ success: true, adblock_protection: false });
        }
    });

    // Rota para alternar Adblock Protection On/Off via URL com chave de segurança simples
    router.get('/toggle-adblock', async (req, res) => {
        try {
            const { secret, enable } = req.query;
            if (secret !== 'cinegeek_admin_2026') {
                return res.status(403).json({ error: 'Chave secreta inválida. Use ?secret=cinegeek_admin_2026&enable=true/false' });
            }

            const newState = (enable === 'true' || enable === '1') ? 'true' : 'false';
            await db.run(
                `INSERT INTO app_dynamic_config (key, value, updated_at) VALUES ('adblock_protection', ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
                [newState]
            );

            res.json({
                success: true,
                message: `Proteção contra AdBlock atualizada com sucesso para: ${newState.toUpperCase()}`,
                adblock_protection: newState === 'true'
            });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    
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
                download_url: `${baseUrl}/downloads/app/${latest.apk_filename}`,
                adblock_protection: false
            });
        } catch (err) {
            console.error('Erro ao buscar latest app update:', err);
            res.status(500).json({ error: 'Erro interno' });
        }
    });

    // Rota Admin: Upload de nova atualização (extração automática de versão e código)
    router.post('/upload', requireAdmin, upload.single('apk'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Arquivo APK é obrigatório.' });
            }

            let { version_name, version_code, release_notes, force_update } = req.body;
            const originalSavedPath = req.file.path;

            // Extração automática via AppInfoParser do AndroidManifest.xml interno do APK
            try {
                const { default: AppInfoParser } = await import('app-info-parser');
                const parser = new AppInfoParser(originalSavedPath);
                const apkResult = await parser.parse();

                if (apkResult) {
                    if (apkResult.versionName) {
                        version_name = apkResult.versionName.toString().trim();
                    }
                    if (apkResult.versionCode !== undefined && apkResult.versionCode !== null) {
                        version_code = parseInt(apkResult.versionCode, 10);
                    }
                }
            } catch (parseErr) {
                console.warn('[APK Parser] Não foi possível extrair metadados automaticamente:', parseErr.message);
            }

            if (!version_name || !version_code) {
                return res.status(400).json({ 
                    error: 'Não foi possível detectar a versão e código automaticamente do APK. Certifique-se de que é um APK Android válido.' 
                });
            }

            // Renomeia o arquivo para um nome padronizado com a versão
            const finalApkFilename = `cinegeek-v${version_name}-${Date.now()}.apk`;
            const finalPath = path.join(uploadDir, finalApkFilename);
            try {
                fs.renameSync(originalSavedPath, finalPath);
            } catch (renameErr) {
                console.error('[APK Rename] Falha ao renomear, mantendo original:', renameErr.message);
            }

            // Extrai a impressão digital da assinatura do APK (SHA-256 da Keystore)
            const signatureHash = extractApkSignatureHash(fs.existsSync(finalPath) ? finalPath : originalSavedPath);
            if (signatureHash) {
                console.log(`[APK Signature] Impressão digital extraída com sucesso: ${signatureHash}`);
            }

            const apkFilenameToSave = fs.existsSync(finalPath) ? finalApkFilename : req.file.filename;
            const isForceUpdate = force_update === 'true' || force_update === true ? 1 : 0;

            // Delete old APK files to save space
            try {
                const oldUpdates = await db.all(`SELECT apk_filename FROM app_updates`);
                for (const old of oldUpdates) {
                    if (old.apk_filename && old.apk_filename !== apkFilenameToSave) {
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
                `INSERT INTO app_updates (version_name, version_code, release_notes, force_update, apk_filename, signature_hash) VALUES (?, ?, ?, ?, ?, ?)`,
                [version_name, parseInt(version_code, 10), release_notes || '', isForceUpdate, apkFilenameToSave, signatureHash || null]
            );

            res.json({ 
                success: true, 
                message: `Atualização v${version_name} (Code: ${version_code}) cadastrada! Assinatura APK vinculada: ${signatureHash || 'N/A'}`,
                version_name,
                version_code,
                signature_hash: signatureHash
            });
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

    // Rota Admin: Excluir atualização (apaga registro e arquivo físico do APK)
    router.delete('/:id', requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const updateItem = await db.get(`SELECT * FROM app_updates WHERE id = ?`, [id]);
            if (!updateItem) {
                return res.status(404).json({ error: 'Atualização não encontrada.' });
            }

            // Deleta o arquivo físico se existir
            if (updateItem.apk_filename) {
                const filePath = path.join(uploadDir, updateItem.apk_filename);
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (e) {
                        console.error('Erro ao deletar arquivo APK físico:', e.message);
                    }
                }
            }

            await db.run(`DELETE FROM app_updates WHERE id = ?`, [id]);

            res.json({ success: true, message: `Versão v${updateItem.version_name} excluída com sucesso!` });
        } catch (err) {
            console.error('Erro ao excluir atualização do app:', err);
            res.status(500).json({ error: 'Erro interno ao excluir atualização.' });
        }
    });

    // ==========================================
    // NOTIFICAÇÕES PUSH MOBILE
    // ==========================================

    // Rota Pública / Mobile: Registro de Token de Dispositivo (FCM / Push)
    router.post('/push/register', async (req, res) => {
        try {
            const { token, platform = 'android', device_model = '', user_id = null } = req.body;
            if (!token) {
                return res.status(400).json({ error: 'Token do dispositivo é obrigatório.' });
            }

            await db.run(
                `INSERT INTO push_tokens (token, platform, device_model, user_id, updated_at) 
                 VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(token) DO UPDATE SET 
                    platform = excluded.platform, 
                    device_model = excluded.device_model, 
                    user_id = excluded.user_id, 
                    updated_at = CURRENT_TIMESTAMP`,
                [token, platform, device_model, user_id]
            );

            res.json({ success: true, message: 'Dispositivo registrado para notificações push com sucesso.' });
        } catch (err) {
            console.error('Erro ao registrar push token:', err);
            res.status(500).json({ error: 'Erro ao registrar dispositivo: ' + err.message });
        }
    });

    // Rota Pública / Mobile: Listar últimas notificações recebidas pelo app (para central de notificações do app)
    router.get('/notifications/latest', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit, 10) || 20;
            const notifications = await db.all(
                `SELECT * FROM app_notifications ORDER BY id DESC LIMIT ?`,
                [limit]
            );
            res.json({ notifications });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar notificações' });
        }
    });

    // Rota Admin: Histórico de notificações enviadas
    router.get('/notifications/history', requireAdmin, async (req, res) => {
        try {
            const history = await db.all(`SELECT * FROM app_notifications ORDER BY id DESC LIMIT 50`);
            const totalDevices = await db.get(`SELECT COUNT(*) as count FROM push_tokens`);
            res.json({ history, totalDevices: totalDevices?.count || 0 });
        } catch (err) {
            res.status(500).json({ error: 'Erro ao buscar histórico de notificações' });
        }
    });

    // Rota Admin: Enviar Notificação Push para os Usuários
    router.post('/notifications/send', requireAdmin, async (req, res) => {
        try {
            const { 
                title, 
                message, 
                image_url, 
                notification_type = 'general', 
                content_id, 
                media_type = 'movie',
                action_url
            } = req.body;

            if (!title || !message) {
                return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
            }

            // Salva na tabela de notificações do app
            const result = await db.run(
                `INSERT INTO app_notifications (title, message, image_url, notification_type, content_id, media_type, action_url) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    title, 
                    message, 
                    image_url || null, 
                    notification_type || 'general', 
                    content_id || null, 
                    media_type || null,
                    action_url || null
                ]
            );

            // Obtém quantidade de dispositivos registrados
            const totalTokens = await db.get(`SELECT COUNT(*) as count FROM push_tokens`);

            res.json({ 
                success: true, 
                message: `Notificação enviada com sucesso para a fila do App!`,
                id: result.lastID,
                devices_reached: totalTokens?.count || 0
            });
        } catch (err) {
            console.error('Erro ao enviar notificação:', err);
            res.status(500).json({ error: 'Erro ao enviar notificação: ' + err.message });
        }
    });

    return router;
}
