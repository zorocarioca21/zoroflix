const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, title FROM sync_queue WHERE tmdb_id = 'NOT_FOUND' LIMIT 50", [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log("=== ITENS NÃO ENCONTRADOS NO TMDB ===");
        rows.forEach(r => console.log(`ID: ${r.id} | Título: ${r.title}`));
    }
    db.close();
});
