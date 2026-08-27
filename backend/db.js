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

// Define os caminhos oficiais (Agora na raiz do projeto dentro da pasta 'database')
DB_PATH = path.join(__dirname, '..', 'database', 'db');
UPLOADS_PATH = path.join(__dirname, '..', 'database', 'uploads');

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

    // Configurações anti-corrupção (Muito importante para VPS/PM2)
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA synchronous = NORMAL;');
    await db.exec('PRAGMA busy_timeout = 5000;');

    // Tabela de Usuários
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT UNIQUE,
            nick TEXT,
            email TEXT UNIQUE,
            password TEXT,
            avatar TEXT DEFAULT '/default-avatar.svg',
            role TEXT DEFAULT 'free',
            banned_until DATETIME DEFAULT NULL,
            last_nick_change DATETIME DEFAULT NULL,
            api_key TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Atualiza avatares antigos quebrados da zorobot.shop para a imagem padrão local
    await db.run("UPDATE users SET avatar = '/default-avatar.svg' WHERE avatar LIKE '%zorobot.shop%' OR avatar IS NULL OR avatar = ''");

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

    // Tabelas de Analytics
    await db.exec(`
        CREATE TABLE IF NOT EXISTS content_analytics (
            content_id TEXT PRIMARY KEY,
            media_type TEXT,
            title TEXT,
            poster_path TEXT,
            views INTEGER DEFAULT 1,
            last_viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS search_analytics (
            query TEXT PRIMARY KEY,
            count INTEGER DEFAULT 1,
            last_searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela para evitar votos duplos de visualização (1 view por usuário por conteúdo)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_content_views (
            identifier TEXT,
            content_id TEXT,
            PRIMARY KEY (identifier, content_id)
        )
    `);

    // Tabela de visualizações de página (page_views)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT,
            user_id INTEGER,
            content_id TEXT,
            page TEXT,
            viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            message TEXT,
            link TEXT,
            read BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    // Migrations
    try {
        await db.exec(`ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'visible'`);
    } catch(e) {}
    try {
        await db.exec(`ALTER TABLE api_keys ADD COLUMN allowed_domains TEXT`);
        await db.exec(`ALTER TABLE api_keys ADD COLUMN usage_count INTEGER DEFAULT 0`);
    } catch(e) {}

    // Tabela de sessões ao vivo (live_sessions)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS live_sessions (
            session_id TEXT PRIMARY KEY,
            uuid TEXT,
            user_id INTEGER,
            content_id TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Tabela de API Keys para acesso mobile
    await db.exec(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            key TEXT UNIQUE NOT NULL,
            permissions TEXT DEFAULT 'full',
            allowed_domains TEXT,
            usage_count INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            last_used DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de Histórico de Assistidos (Recentes)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS watch_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT,
            user_id INTEGER,
            content_id TEXT NOT NULL,
            media_type TEXT NOT NULL,
            title TEXT,
            poster_path TEXT,
            season INTEGER,
            episode INTEGER,
            resume_time INTEGER DEFAULT 0,
            watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Tabela de Episódios Concluídos (Marcados por assistir 80% do tempo)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS watched_episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT,
            user_id INTEGER,
            content_id TEXT NOT NULL,
            season INTEGER NOT NULL,
            episode INTEGER NOT NULL,
            watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Índices únicos para evitar duplicados
    await db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watched_episodes_user ON watched_episodes (user_id, content_id, season, episode) WHERE user_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watched_episodes_uuid ON watched_episodes (uuid, content_id, season, episode) WHERE user_id IS NULL AND uuid IS NOT NULL;
    `);

    // Tabela de Downloads de Usuários
    await db.exec(`
        CREATE TABLE IF NOT EXISTS user_downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT,
            user_id INTEGER,
            transmission_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            poster_path TEXT,
            media_type TEXT,
            status TEXT DEFAULT 'downloading',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Tabela da Fila de Sincronização IPTV -> Telegram
    await db.exec(`
        CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            status TEXT DEFAULT 'pending', -- pending, downloading, uploading, completed, error
            file_size INTEGER DEFAULT 0,
            telegram_message_id INTEGER DEFAULT NULL,
            error_message TEXT DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(url)
        )
    `);

    // Auto-migration: adiciona priority caso o banco seja antigo
    try {
        await db.exec(`ALTER TABLE sync_queue ADD COLUMN priority INTEGER DEFAULT 0`);
        console.log("Migration: Coluna 'priority' adicionada à tabela sync_queue.");
    } catch (e) {
        // Ignora se a coluna já existir
    }

    // Tabela de Atualizações do App (OTA)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS app_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version_name TEXT NOT NULL,
            version_code INTEGER NOT NULL,
            release_notes TEXT,
            force_update INTEGER DEFAULT 0,
            apk_filename TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de Recuperação de Senha
    await db.exec(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Inserir configurações padrão se não existirem
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('ads_enabled', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('ads_popunder', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('ads_banner', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('ads_socialbar', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('anti_adblock', '0')");
    await db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('anti_devtools', '0')");

    // Adicionar coluna status nos comentários (se não existir)
    try {
        await db.exec("ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'active'");
    } catch (err) {
        // Já existe
    }

    // Adicionar colunas page e title na tabela live_sessions (para heartbeat ativo)
    try {
        await db.exec("ALTER TABLE live_sessions ADD COLUMN page TEXT");
    } catch (err) { /* Já existe */ }
    try {
        await db.exec("ALTER TABLE live_sessions ADD COLUMN title TEXT");
    } catch (err) { /* Já existe */ }

    // Adicionar coluna resume_time na watch_history
    try {
        await db.exec("ALTER TABLE watch_history ADD COLUMN resume_time INTEGER DEFAULT 0");
    } catch (err) { /* Já existe */ }

    return db;
}

export { DB_PATH, UPLOADS_PATH };
