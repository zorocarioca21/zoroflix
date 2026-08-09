import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import 'dotenv/config';

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionStr = process.env.TELEGRAM_SESSION;

let client = null;
let clientConnecting = false;
let clientConnected = false;

// Inicializa o cliente do Telegram como Singleton
export async function getTelegramClient() {
    if (clientConnected) return client;
    if (clientConnecting) {
        // Aguarda conectar
        while (!clientConnected) {
            await new Promise(r => setTimeout(r, 500));
        }
        return client;
    }

    clientConnecting = true;
    try {
        const stringSession = new StringSession(sessionStr);
        client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
        });
        client.setLogLevel("none");
        await client.connect();
        
        try {
            await client.getDialogs({});
        } catch (e) {
            console.log("Aviso: Falha ao carregar dialogos", e);
        }

        clientConnected = true;
        console.log("Cliente GramJS conectado e exportado!");
    } catch (e) {
        console.error("Erro ao conectar GramJS:", e);
    } finally {
        clientConnecting = false;
    }
    return client;
}
