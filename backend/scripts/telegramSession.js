import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import input from "input"; // npm i input
import 'dotenv/config';

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const stringSession = new StringSession(""); 

(async () => {
    console.log("Iniciando processo de login no Telegram...");
    
    if (!apiId || !apiHash) {
        console.error("TELEGRAM_API_ID ou TELEGRAM_API_HASH não encontrados no .env!");
        process.exit(1);
    }

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });
    
    await client.start({
        phoneNumber: async () => await input.text("Por favor, digite seu número de telefone (com DDI, ex: +5511999999999): "),
        password: async () => await input.text("Por favor, digite sua senha de verificação em duas etapas (se houver): "),
        phoneCode: async () => await input.text("Por favor, digite o código recebido no Telegram: "),
        onError: (err) => console.log(err),
    });
    
    console.log("Você está conectado agora.");
    const savedSession = client.session.save();
    console.log("\n==================================\n");
    console.log("Sua String de Sessão (Guarde-a no .env em TELEGRAM_SESSION):");
    console.log(savedSession);
    console.log("\n==================================\n");

    console.log("Carregando seus chats/canais recentes para descobrirmos o ID...");
    const dialogs = await client.getDialogs({});
    console.log("\nCanais/Grupos recentes:");
    for (const dialog of dialogs) {
        if (dialog.isChannel || dialog.isGroup) {
            console.log(`-> Nome: ${dialog.title} | ID: ${dialog.id}`);
        }
    }
    console.log("\nCopie o ID do canal desejado e cole no .env em TELEGRAM_CHANNEL_ID.");
    process.exit(0);
})();
