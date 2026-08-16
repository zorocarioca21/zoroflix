import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbFile = path.join(__dirname, '..', '..', 'database', 'db', 'database.sqlite');

const db = new sqlite3.Database(dbFile);

console.log('Iniciando limpeza de títulos M3U sujos no banco de dados...');

db.all("SELECT id, title FROM sync_queue WHERE title LIKE '%tvg-logo=%' OR title LIKE '%group-title=%'", (err, rows) => {
    if (err) {
        console.error("Erro no DB:", err);
        return;
    }
    console.log(`Encontrados ${rows.length} titulos sujos no DB.`);
    let count = 0;
    
    rows.forEach(r => {
        let newTitle = r.title;
        const idx = newTitle.indexOf('",');
        if (idx !== -1) {
            newTitle = newTitle.substring(idx + 2).trim();
        } else {
            const parts = newTitle.split(',');
            newTitle = parts[parts.length - 1].trim();
        }

        if (newTitle !== r.title && newTitle.length > 0) {
            db.run('UPDATE sync_queue SET title = ? WHERE id = ?', [newTitle, r.id], (err2) => {
                if (err2) console.error(err2);
                else {
                    count++;
                    console.log(`Corrigido: [${r.title}] -> [${newTitle}]`);
                }
            });
        }
    });

    setTimeout(() => {
        console.log(`Finalizado! ${count} títulos foram corrigidos.`);
    }, 2000);
});
