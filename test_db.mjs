import { initTmdbCatalogDB } from './backend/tmdbCatalogDB.js';
async function test() {
    try {
        const db = await initTmdbCatalogDB();
        await db.run(
            `INSERT INTO system_settings (key, value, updated_at) VALUES ('tmdb_api_keys', 'test', CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
            []
        );
        console.log("Success");
    } catch(e) {
        console.error("Error:", e);
    }
}
test();
