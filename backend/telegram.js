import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import 'dotenv/config';

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

// Coleta TODAS as variáveis de ambiente que começam com TELEGRAM_SESSION (incluindo a original sem número)
const sessionStrings = Object.keys(process.env)
    .filter(key => key.startsWith('TELEGRAM_SESSION'))
    .map(key => process.env[key])
    .filter(val => val && val.trim() !== ''); // Remove nulos ou vazios

if (sessionStrings.length === 0) {
    console.error("Nenhuma variável TELEGRAM_SESSION encontrada no .env!");
}

let clients = [];
let clientsConnecting = false;
let clientsConnected = false;
let currentClientIndex = 0;

// Inicializa o cliente do Telegram como Pool
export async function getTelegramClient() {
    if (clientsConnected && clients.length > 0) {
        // Round-Robin
        const client = clients[currentClientIndex];
        currentClientIndex = (currentClientIndex + 1) % clients.length;
        return client;
    }
    
    if (clientsConnecting) {
        // Aguarda conectar
        while (!clientsConnected) {
            await new Promise(r => setTimeout(r, 500));
        }
        if (clients.length > 0) {
            const client = clients[currentClientIndex];
            currentClientIndex = (currentClientIndex + 1) % clients.length;
            return client;
        }
        return null; // Falha
    }

    clientsConnecting = true;
    try {
        console.log(`[GramJS] Iniciando conexões para ${sessionStrings.length} sessão(ões)...`);
        
        for (let i = 0; i < sessionStrings.length; i++) {
            const sessionStr = sessionStrings[i];
            const stringSession = new StringSession(sessionStr);
            const client = new TelegramClient(stringSession, apiId, apiHash, {
                connectionRetries: 5,
            });
            client.setLogLevel("warn");
            await client.connect();
            
            try {
                // Força ping
                await client.getDialogs({});
                clients.push(client);
                console.log(`[GramJS] Cliente ${i + 1}/${sessionStrings.length} conectado com sucesso!`);
            } catch (e) {
                console.log(`[GramJS] Aviso: Falha ao carregar dialogos para cliente ${i + 1}`, e);
            }
        }

        clientsConnected = true;
        console.log(`[GramJS] Pool de clientes exportado! Total de contas ativas: ${clients.length}`);
    } catch (e) {
        console.error("Erro ao conectar GramJS Pool:", e);
    } finally {
        clientsConnecting = false;
    }
    
    if (clients.length > 0) {
        const client = clients[currentClientIndex];
        currentClientIndex = (currentClientIndex + 1) % clients.length;
        return client;
    }
    return null;
}
