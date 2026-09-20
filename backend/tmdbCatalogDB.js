import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', 'database', 'db');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const dbFile = path.join(DB_DIR, 'tmdb_catalog.sqlite');

export async function initTmdbCatalogDB() {
    const db = await open({
        filename: dbFile,
        driver: sqlite3.Database
    });

    console.log(`[TMDB DB] SQLite de Catálogo TMDB conectado em: ${dbFile}`);

    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA synchronous = NORMAL;');
    await db.exec('PRAGMA busy_timeout = 5000;');

    // Tabela de Cache do TMDB (Filmes/Séries e Mídias no Zoro Drive)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tmdb_media_cache (
            tmdb_id TEXT,
            media_type TEXT, -- 'movie' ou 'tv'
            title TEXT,
            original_title TEXT,
            overview TEXT,
            release_date TEXT,
            poster_url TEXT,
            backdrop_url TEXT,
            raw_data TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tmdb_id, media_type)
        )
    `);

    // Tabela de Cache de Episódios
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tmdb_episodes_cache (
            tmdb_id TEXT,
            season INTEGER,
            episode INTEGER,
            name TEXT,
            overview TEXT,
            runtime INTEGER,
            still_url TEXT,
            raw_data TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (tmdb_id, season, episode)
        )
    `);

    // Tabela de Cache de Elenco / Atores
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tmdb_cast_cache (
            person_id INTEGER PRIMARY KEY,
            name TEXT,
            character TEXT,
            profile_url TEXT,
            raw_data TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    return db;
}
