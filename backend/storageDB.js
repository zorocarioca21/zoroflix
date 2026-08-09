import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'storage.sqlite');

export async function initStorageDB() {
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS storage_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            api_key TEXT UNIQUE,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS storage_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message_id INTEGER,
            file_name TEXT,
            mime_type TEXT,
            size INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES storage_users(id) ON DELETE CASCADE
        )
    `);

    return db;
}
