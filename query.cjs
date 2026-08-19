const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('backend/database.sqlite');
db.all("SELECT id, title FROM sync_queue WHERE title LIKE '%Reacher%'", (err, rows) => {
    if (err) console.error(err);
    else console.log(JSON.stringify(rows, null, 2));
});
