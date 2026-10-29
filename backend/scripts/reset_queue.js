import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    const dbFile = path.join(__dirname, '..', '..', 'database', 'db', 'database.sqlite');
    const db = await open({ filename: dbFile, driver: sqlite3.Database });
    await db.run("UPDATE manga_download_queue SET status = 'pending', error_message = NULL WHERE status IN ('error', 'downloading')");
    const count = await db.get("SELECT COUNT(*) as c FROM manga_download_queue WHERE status = 'pending'");
    console.log('Fila resetada! Itens pendentes agora:', count.c);
}
run();
