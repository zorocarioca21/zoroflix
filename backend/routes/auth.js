import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cinegeek_secret_key_123';

export default function authRoutes(db) {
    
    // REGISTRO
    router.post('/register', async (req, res) => {
        const { nick, email, password, uuid } = req.body;
        
        if (!nick || !email || !password || !uuid) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const result = await db.run(
                'INSERT INTO users (nick, email, password, uuid, role) VALUES (?, ?, ?, ?, ?)',
                [nick, email, hashedPassword, uuid, 'free']
            );
            
            const defaultAvatar = '/default-avatar.svg';
            const token = jwt.sign({ id: result.lastID, role: 'free' }, JWT_SECRET, { expiresIn: '30d' });
            res.json({ token, user: { id: result.lastID, nick, email, role: 'free', avatar: defaultAvatar, created_at: new Date().toISOString() } });
        } catch (err) {
            if (err.message.includes('unique')) {
                return res.status(400).json({ error: 'Email já cadastrado.' });
            }
            res.status(500).json({ error: 'Erro ao registrar usuário.' });
        }
    });

    // LOGIN
    router.post('/login', async (req, res) => {
        const { email, password } = req.body;

        try {
            const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
            if (!user) return res.status(400).json({ error: 'Usuário não encontrado.' });

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(400).json({ error: 'Senha incorreta.' });

            // Verificar banimento
            if (user.banned_until && new Date(user.banned_until) > new Date()) {
                return res.status(403).json({ error: `Esta conta está banida até ${new Date(user.banned_until).toLocaleString()}.` });
            }

            const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
            res.json({ 
                token, 
                user: { 
                    id: user.id, 
                    nick: user.nick, 
                    email: user.email, 
                    role: user.role,
                    avatar: user.avatar,
                    created_at: user.created_at
                } 
            });
        } catch (err) {
            res.status(500).json({ error: 'Erro no servidor.' });
        }
    });

    // ME (Validar Token)
    router.get('/me', async (req, res) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Acesso negado.' });

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await db.get('SELECT id, nick, email, role, avatar, created_at FROM users WHERE id = ?', [decoded.id]);
            res.json(user);
        } catch (err) {
            res.status(401).json({ error: 'Token inválido.' });
        }
    });

    // ESQUECI A SENHA
    router.post('/forgot-password', async (req, res) => {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email obrigatório.' });

        try {
            const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
            if (!user) {
                // Return success even if user not found to prevent email enumeration
                return res.json({ message: 'Se o email existir, um link de recuperação foi enviado.' });
            }

            const { v4: uuidv4 } = await import('uuid');
            const token = uuidv4();
            const expiresAt = new Date(Date.now() + 3600000); // 1 hour

            await db.run(
                'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
                [email, token, expiresAt.toISOString()]
            );

            const { enviarResetSenha } = await import('../services/email.service.js');
            await enviarResetSenha(email, user.nick, token);

            res.json({ message: 'Se o email existir, um link de recuperação foi enviado.' });
        } catch (err) {
            console.error("Erro no forgot-password:", err);
            res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    });

    // REDEFINIR SENHA
    router.post('/reset-password', async (req, res) => {
        const { token, password } = req.body;
        if (!token || !password) return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' });

        try {
            const resetObj = await db.get('SELECT * FROM password_resets WHERE token = ?', [token]);
            if (!resetObj) return res.status(400).json({ error: 'Link de redefinição inválido.' });

            if (new Date(resetObj.expires_at) < new Date()) {
                return res.status(400).json({ error: 'Link de redefinição expirado.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            
            await db.run('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, resetObj.email]);
            await db.run('DELETE FROM password_resets WHERE email = ?', [resetObj.email]);

            res.json({ message: 'Senha redefinida com sucesso!' });
        } catch (err) {
            console.error("Erro no reset-password:", err);
            res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    });

    return router;
}
