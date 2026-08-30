import express from 'express';
import { getTelegramClient } from '../telegram.js';
import { Api } from 'telegram';
import fs from 'fs';
import path from 'path';

export default function botManagerRoutes(db) {
    const router = express.Router();

    // Rota para pegar todos os chats (Canais e Grupos)
    router.get('/dialogs', async (req, res) => {
        try {
            const client = await getTelegramClient();
            if (!client) return res.status(500).json({ error: 'Cliente Telegram não inicializado' });

            const dialogs = await client.getDialogs({});
            const chats = dialogs
                .filter(d => d.isChannel || d.isGroup)
                .map(d => ({
                    id: d.id.toString(),
                    title: d.title,
                    isChannel: d.isChannel,
                    isGroup: d.isGroup
                }));
            
            res.json({ chats });
        } catch (e) {
            console.error('Erro ao buscar dialogs:', e);
            res.status(500).json({ error: 'Erro ao listar canais' });
        }
    });

    // Rota para entrar em um canal por link de convite
    router.post('/join', async (req, res) => {
        try {
            const { inviteLink } = req.body;
            if (!inviteLink) return res.status(400).json({ error: 'Link de convite obrigatório' });

            const client = await getTelegramClient();
            
            // Extrai o hash do link (ex: https://t.me/+AbCdEfGh ou https://t.me/joinchat/AbCdEfGh)
            let hash = inviteLink.split('/').pop();
            if (hash.startsWith('+')) hash = hash.substring(1);

            await client.invoke(new Api.messages.ImportChatInvite({ hash }));
            res.json({ success: true, message: 'Entrou no canal com sucesso!' });
        } catch (e) {
            console.error('Erro ao entrar no canal:', e);
            res.status(500).json({ error: e.message || 'Erro ao entrar no canal' });
        }
    });

    // Rota para definir variável no .env dinamicamente
    router.post('/set-env', (req, res) => {
        try {
            const { key, value } = req.body;
            if (!key || !value) return res.status(400).json({ error: 'Chave e valor obrigatórios' });

            const envPath = path.resolve(process.cwd(), '.env');
            let envContent = fs.readFileSync(envPath, 'utf8');
            
            const regex = new RegExp(`^${key}=.*`, 'm');
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }

            fs.writeFileSync(envPath, envContent);
            process.env[key] = value; // Atualiza em memória também
            
            res.json({ success: true });
        } catch (e) {
            console.error('Erro ao escrever no .env:', e);
            res.status(500).json({ error: 'Erro ao salvar configuração' });
        }
    });

    return router;
}
