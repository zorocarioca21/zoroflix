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

    // Atualiza apenas avatares nulos ou vazios para a imagem padrão local e garante HTTPS nos avatares do Drive
    await db.run("UPDATE users SET avatar = '/default-avatar.svg' WHERE avatar IS NULL OR avatar = ''");
    await db.run("UPDATE users SET avatar = REPLACE(avatar, 'http://', 'https://') WHERE avatar LIKE 'http://%'");

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

    // Reportes de Conteúdo (problemas no player)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS content_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            tmdb_id TEXT,
            media_type TEXT,
            season INTEGER,
            episode INTEGER,
            title TEXT,
            description TEXT,
            source TEXT,
            page_url TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Sistema de Pontos
    try { await db.exec(`ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 0`); } catch (e) {}
    await db.exec(`
        CREATE TABLE IF NOT EXISTS watch_rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            content_key TEXT,
            tmdb_id TEXT,
            media_type TEXT,
            season INTEGER,
            episode INTEGER,
            points INTEGER,
            source TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, content_key)
        )
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS content_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_key TEXT UNIQUE,
            tmdb_id TEXT,
            media_type TEXT,
            season INTEGER,
            episode INTEGER,
            title TEXT,
            poster_path TEXT,
            year TEXT,
            is_anime INTEGER DEFAULT 0,
            votes INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.exec(`
        CREATE TABLE IF NOT EXISTS content_request_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id INTEGER,
            user_id INTEGER,
            points_spent INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(request_id, user_id)
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

    // Tabela de API Keys para acesso mobile e embed
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

    // Migrations
    try {
        await db.exec(`ALTER TABLE comments ADD COLUMN status TEXT DEFAULT 'visible'`);
    } catch(e) {}
    try { await db.exec(`ALTER TABLE api_keys ADD COLUMN permissions TEXT DEFAULT 'full'`); } catch(e) {}
    try { await db.exec(`ALTER TABLE api_keys ADD COLUMN allowed_domains TEXT`); } catch(e) {}
    try { await db.exec(`ALTER TABLE api_keys ADD COLUMN usage_count INTEGER DEFAULT 0`); } catch(e) {}
    try { await db.exec(`ALTER TABLE api_keys ADD COLUMN active INTEGER DEFAULT 1`); } catch(e) {}
    try { await db.exec(`ALTER TABLE api_keys ADD COLUMN last_used DATETIME`); } catch(e) {}
    try { await db.exec(`ALTER TABLE api_keys ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`); } catch(e) {}
    try { await db.run(`UPDATE api_keys SET active = 1 WHERE active IS NULL`); } catch(e) {}
    try { await db.run(`UPDATE api_keys SET permissions = 'full' WHERE permissions IS NULL`); } catch(e) {}

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
            hidden INTEGER DEFAULT 0,
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

    // Índices únicos para evitar duplicados na watched_episodes
    await db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watched_episodes_user ON watched_episodes (user_id, content_id, season, episode) WHERE user_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watched_episodes_uuid ON watched_episodes (uuid, content_id, season, episode) WHERE user_id IS NULL AND uuid IS NOT NULL;
    `);

    // Tabela de Erros e Falhas do App Mobile (Crash / Playback / Network Reports)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS app_crash_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            user_nick TEXT,
            app_version TEXT,
            device_model TEXT,
            android_version TEXT,
            error_type TEXT DEFAULT 'playback_error',
            error_message TEXT NOT NULL,
            error_stack TEXT,
            content_id TEXT,
            content_title TEXT,
            season INTEGER,
            episode INTEGER,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_app_crash_created_at ON app_crash_reports (created_at)`); } catch(e) {}
    try { await db.exec(`CREATE INDEX IF NOT EXISTS idx_app_crash_status ON app_crash_reports (status)`); } catch(e) {}

    // Limpar duplicados do watch_history antes de criar o index
    try {
        await db.exec(`
            DELETE FROM watch_history
            WHERE id NOT IN (
                SELECT MAX(id)
                FROM watch_history
                GROUP BY COALESCE(user_id, uuid), content_id
            )
        `);
    } catch(e) {
        console.error("Erro ao limpar duplicados de watch_history:", e);
    }

    // Índices únicos para evitar duplicados na watch_history (importante para o INSERT OR REPLACE do App Mobile)
    await db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history (user_id, content_id) WHERE user_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_history_uuid ON watch_history (uuid, content_id) WHERE user_id IS NULL AND uuid IS NOT NULL;
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
            tmdb_id TEXT DEFAULT NULL,
            media_type TEXT DEFAULT NULL,
            season_number INTEGER DEFAULT NULL,
            episode_number INTEGER DEFAULT NULL,
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

    try {
        await db.exec(`ALTER TABLE sync_queue ADD COLUMN old_telegram_message_id INTEGER DEFAULT NULL`);
        console.log("Migration: Coluna 'old_telegram_message_id' adicionada à tabela sync_queue.");
    } catch (e) {
        // Ignora se a coluna já existir
    }

    // Tabela de Configurações Globais do Sistema (TMDB Keys, ZoroBot Video Key, etc)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Auto-migration: TMDB columns
    try {
        await db.exec(`ALTER TABLE sync_queue ADD COLUMN tmdb_id TEXT DEFAULT NULL`);
        await db.exec(`ALTER TABLE sync_queue ADD COLUMN media_type TEXT DEFAULT NULL`);
        await db.exec(`ALTER TABLE sync_queue ADD COLUMN season_number INTEGER DEFAULT NULL`);
        await db.exec(`ALTER TABLE sync_queue ADD COLUMN episode_number INTEGER DEFAULT NULL`);
        console.log("Migration: Colunas TMDB adicionadas à tabela sync_queue.");
    } catch (e) {
        // Ignora
    }

    // Auto-migration: Indexes para otimizar pesquisas frequentes na fila
    try {
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_tmdb_id ON sync_queue (tmdb_id)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue (status)`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_queue_updated_at ON sync_queue (updated_at)`);
        console.log("Migration: Índices criados na tabela sync_queue.");
    } catch (e) {
        // Ignora
    }

    // Tabela de Configurações Gerais do Sistema (M3U URL, etc)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Insere URL padrão se ainda não existir
    await db.run(`
        INSERT OR IGNORE INTO system_settings (key, value) 
        VALUES ('m3u_url', 'http://offthesun.net/get.php?username=D2YMmy&password=ZKAhFW&type=m3u_plus&output=ts')
    `);

    // Tabela de vídeos quebrados reportados automaticamente pelo player
    await db.exec(`
        CREATE TABLE IF NOT EXISTS broken_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sync_queue_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            telegram_message_id INTEGER,
            reported_by TEXT DEFAULT 'auto',
            status TEXT DEFAULT 'pending', -- pending, requeued, dismissed
            report_count INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sync_queue_id)
        )
    `);

    // Tabela de Atualizações do App (OTA)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS app_updates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version_name TEXT NOT NULL,
            version_code INTEGER NOT NULL,
            release_notes TEXT,
            force_update INTEGER DEFAULT 0,
            apk_filename TEXT NOT NULL,
            signature_hash TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    try { await db.exec(`ALTER TABLE app_updates ADD COLUMN signature_hash TEXT`); } catch(e) {}

    // Tabela de Notificações Push / Notificações do Aplicativo Mobile
    await db.exec(`
        CREATE TABLE IF NOT EXISTS app_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            image_url TEXT,
            notification_type TEXT DEFAULT 'general',
            content_id TEXT,
            media_type TEXT,
            action_url TEXT,
            target_audience TEXT DEFAULT 'all',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Migrations app_notifications
    try { await db.exec(`ALTER TABLE app_notifications ADD COLUMN notification_type TEXT DEFAULT 'general'`); } catch(e) {}
    try { await db.exec(`ALTER TABLE app_notifications ADD COLUMN action_url TEXT`); } catch(e) {}

    // Tabela de Tokens Push Mobile (FCM / OneSignal)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS push_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            platform TEXT DEFAULT 'android',
            user_id INTEGER,
            device_model TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de Listas IPTV M3U cadastradas pelo Admin
    await db.exec(`
        CREATE TABLE IF NOT EXISTS iptv_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            vip_badge TEXT NOT NULL DEFAULT 'VIP',
            channel_count INTEGER DEFAULT 0,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de Canais IPTV
    await db.exec(`
        CREATE TABLE IF NOT EXISTS iptv_channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            list_id INTEGER,
            name TEXT NOT NULL,
            category TEXT DEFAULT 'Geral',
            logo_url TEXT,
            stream_url TEXT NOT NULL,
            vip_badge TEXT NOT NULL DEFAULT 'VIP',
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (list_id) REFERENCES iptv_lists(id) ON DELETE CASCADE
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

    // ==========================================
    // TABELAS DE MANGÁS E HQs
    // ==========================================
    await db.exec(`
        CREATE TABLE IF NOT EXISTS mangas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            original_title TEXT,
            synopsis TEXT,
            cover_url TEXT,
            banner_url TEXT,
            author TEXT,
            genres TEXT,
            status TEXT DEFAULT 'ongoing',
            type TEXT DEFAULT 'manga', -- manga, hq, webtoon
            anilist_id INTEGER,
            year INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS manga_chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manga_id INTEGER NOT NULL,
            chapter_number REAL NOT NULL, -- Pode ser float (ex: 10.5)
            title TEXT,
            telegram_message_id INTEGER NOT NULL, -- ID da msg no novo canal
            file_size INTEGER DEFAULT 0,
            pages_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(manga_id) REFERENCES mangas(id) ON DELETE CASCADE
        )
    `);

    // Fila de Downloads Automáticos de Capítulos
    await db.exec(`
        CREATE TABLE IF NOT EXISTS manga_download_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manga_id INTEGER NOT NULL,
            chapter_dex_id TEXT NOT NULL,
            chapter_number REAL NOT NULL,
            title TEXT,
            language TEXT DEFAULT 'pt-br',
            status TEXT DEFAULT 'pending', -- pending, downloading, completed, error
            error_message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(manga_id, chapter_dex_id)
        )
    `);

    // Tabela de Configuração e Estado do Auto-Ingestor de Mangás
    await db.exec(`
        CREATE TABLE IF NOT EXISTS manga_auto_importer_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            is_enabled INTEGER DEFAULT 0,
            primary_language TEXT DEFAULT 'pt-br',
            secondary_language TEXT DEFAULT 'en',
            order_by TEXT DEFAULT 'followedCount',
            delay_seconds INTEGER DEFAULT 3,
            current_offset INTEGER DEFAULT 0,
            auto_enqueue_chapters INTEGER DEFAULT 1,
            max_chapters_per_manga INTEGER DEFAULT 0, -- 0 = todos
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // Tabela de Salas de Watch Party (Persistência de salas, privacidade e senhas)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS watch_party_rooms (
            id TEXT PRIMARY KEY,
            name TEXT,
            creator_id INTEGER,
            creator_nick TEXT,
            creator_avatar TEXT,
            is_private INTEGER DEFAULT 0,
            password TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Tabela de Temas e Live Code Editor (Snapshots de Custom CSS e HTML Injection)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS site_themes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            custom_css TEXT DEFAULT '',
            custom_html_head TEXT DEFAULT '',
            custom_html_body TEXT DEFAULT '',
            is_active INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Cria o Tema Padrão Neon caso a tabela esteja vazia
    const themeCount = await db.get("SELECT COUNT(*) as count FROM site_themes");
    if (!themeCount || themeCount.count === 0) {
        await db.run(`
            INSERT INTO site_themes (name, custom_css, custom_html_head, custom_html_body, is_active)
            VALUES (
                'Padrão CineGeek Neon',
                '/* Tema Oficial CineGeek - Adicione ou sobrescreva estilos livremente */\n:root {\n  --primary-accent: #00e676;\n}\n',
                '',
                '',
                1
            )
        `);
    }

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

    // Adicionar coluna hidden na watch_history para manter histórico pros admins
    try {
        await db.exec("ALTER TABLE watch_history ADD COLUMN hidden INTEGER DEFAULT 0");
    } catch (err) { /* Já existe */ }

    // Colunas de suporte a múltiplas versões / grupos de scan e idiomas nos capítulos de mangás
    try {
        await db.exec("ALTER TABLE manga_chapters ADD COLUMN scan_group TEXT DEFAULT 'Padrão'");
    } catch (err) { /* Já existe */ }
    try {
        await db.exec("ALTER TABLE manga_chapters ADD COLUMN language TEXT DEFAULT 'pt-br'");
    } catch (err) { /* Já existe */ }
    try {
        await db.exec("ALTER TABLE manga_chapters ADD COLUMN chapter_dex_id TEXT");
    } catch (err) { /* Já existe */ }
    try {
        await db.exec("ALTER TABLE manga_download_queue ADD COLUMN scan_group TEXT DEFAULT 'Padrão'");
    } catch (err) { /* Já existe */ }

    // Limpeza automática de capítulos corrompidos com 0 páginas (como links externos da Comikey/MangaPlus)
    try {
        await db.run("DELETE FROM manga_chapters WHERE pages_count = 0 OR file_size < 100");
        await db.run("DELETE FROM manga_download_queue WHERE error_message LIKE '%sem páginas%' OR status = 'error'");
    } catch (cleanErr) {
        console.warn('[DB Clean] Aviso na limpeza de capítulos zerados:', cleanErr.message);
    }

    return db;
}

export { DB_PATH, UPLOADS_PATH };
