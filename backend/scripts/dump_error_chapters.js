import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    const dbFile = path.join(__dirname, '..', '..', 'database', 'db', 'database.sqlite');
    const db = await open({ filename: dbFile, driver: sqlite3.Database });
    const rows = await db.all("SELECT id, manga_id, chapter_dex_id, chapter_number, error_message FROM manga_download_queue WHERE status = 'error' LIMIT 15");
    console.log(JSON.stringify(rows, null, 2));
}
run();
