import fs from 'fs';
import path from 'path';

let cachedKeys = [];
let currentIndex = 0;

export async function getNextTmdbKey(db) {
    if (cachedKeys.length === 0) {
        try {
            const row = await db.get("SELECT value FROM system_settings WHERE key = 'tmdb_api_keys'");
            if (row && row.value) {
                cachedKeys = row.value.split(',').map(k => k.trim()).filter(k => k.length > 0);
            }
        } catch (e) {
            console.error("Error fetching TMDB keys from DB:", e);
        }

        // Fallback to environment variable if no keys in DB
        if (cachedKeys.length === 0) {
            const envKey = process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY || 'f9cbdd4fabd4ac77cd2ca54d80a476a5';
            cachedKeys = [envKey];
        }
    }

    if (cachedKeys.length === 0) {
        return 'f9cbdd4fabd4ac77cd2ca54d80a476a5'; // Ultimate fallback
    }

    const key = cachedKeys[currentIndex];
    currentIndex = (currentIndex + 1) % cachedKeys.length;
    return key;
}

export function invalidateTmdbKeysCache() {
    cachedKeys = [];
    currentIndex = 0;
}
