import { initDB } from './backend/db.js';
initDB().then(async ({db}) => {
    const res = await db.run(`DELETE FROM sync_queue WHERE status = 'pending' AND title IN (SELECT title FROM sync_queue WHERE status = 'completed')`);
    console.log('Duplicados removidos:', res.changes);
    process.exit(0);
});
