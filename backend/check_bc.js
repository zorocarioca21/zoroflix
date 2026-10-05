const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tmdb_catalog.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT * FROM sync_queue WHERE file_name LIKE '%Black Clover%'", [], (err, rows) => {
    if (err) {
        console.error(err);
    } else {
        console.log(JSON.stringify(rows, null, 2));
    }
    db.close();
});
