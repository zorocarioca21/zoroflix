import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detecção de Plataforma e Caminhos
let DB_PATH;
let UPLOADS_PATH;

if (process.platform === 'linux') {
    // Tenta usar o HD montado no Linux
    const linuxHD = '/mnt/hd/zoroflix';
    if (fs.existsSync('/mnt/hd')) {
        DB_PATH = path.join(linuxHD, 'db');
        UPLOADS_PATH = path.join(linuxHD, 'uploads');
    } else {
        // Fallback local se o /mnt/hd não existir no Linux
        DB_PATH = path.join(__dirname, '..', 'data', 'db');
        UPLOADS_PATH = path.join(__dirname, '..', 'data', 'uploads');
    }
} else {
    // Windows ou outros (Desenvolvimento local)
    DB_PATH = path.join(__dirname, '..', 'data', 'db');
    UPLOADS_PATH = path.join(__dirname, '..', 'data', 'uploads');
}

// Cria as pastas se não existirem
[DB_PATH, UPLOADS_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Diretório criado: ${dir}`);
    }
});

const dbFile = path.join(DB_PATH, 'database.sqlite');

// Inicialização do Banco de Dados
export async function initDB() {
    const db = await open({
        filename: dbFile,
        driver: sqlite3.Database
    });

    console.log(`SQLite conectado em: ${dbFile}`);

    // Tabela de Usuários
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE,
            nick TEXT,
            email TEXT UNIQUE,
            password TEXT,
            avatar TEXT DEFAULT 'https://api.zorobot.shop/avatars/default.png?v=1',
            role TEXT DEFAULT 'free',
            banned_until DATETIME DEFAULT NULL,
            last_nick_change DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de Comentários
    await db.exec(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            parent_id INTEGER DEFAULT NULL,
            content_id TEXT,
            media_type TEXT,
            episode_id TEXT DEFAULT NULL,
            text TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
        )
    `);

    // Tabela de Reações (Likes/Dislikes)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            comment_id INTEGER,
            type TEXT CHECK(type IN ('like', 'dislike')),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, comment_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
        )
    `);

    // Tabela de Denúncias
    await db.exec(`
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            comment_id INTEGER,
            reason TEXT,
            status TEXT DEFAULT 'pending', -- pending, resolved, dismissed
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
        )
    `);

    // Tabela de Favoritos
    await db.exec(`
        CREATE TABLE IF NOT EXISTS favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT,
            user_id INTEGER,
            content_id TEXT,
            media_type TEXT,
            title TEXT,
            poster_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Tabela de Configurações Globais
    await db.exec(`
        CREATE TABLE IF NOT EXISTS configs (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);

    // Inserir configurações padrão se não existirem
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('ads_enabled', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('ads_popunder', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('ads_banner', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('ads_socialbar', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('anti_adblock', '0')");

    return db;
}

export { DB_PATH, UPLOADS_PATH };
