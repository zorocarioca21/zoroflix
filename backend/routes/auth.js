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

    return router;
}
