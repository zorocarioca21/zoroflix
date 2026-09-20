import { initDB, UPLOADS_PATH } from '../db.js';
import { uploadLocalFileToDrive, uploadRemoteUrlToDrive } from '../services/zoroDriveService.js';
import path from 'path';
import fs from 'fs';

async function migrateAvatars() {
    console.log('🚀 Iniciando migração de avatares existentes para o Zoro Drive...');
    
    const db = await initDB();
    
    // Selecionar usuários com avatares customizados que ainda não estão no Zoro Drive
    const users = await db.all(`
        SELECT id, nick, avatar FROM users 
        WHERE avatar IS NOT NULL 
          AND avatar != '/default-avatar.svg' 
          AND avatar NOT LIKE '%zorobot.shop/drive%'
    `);

    console.log(`📌 Encontrados ${users.length} usuários para migração de avatar.`);

    let successCount = 0;

    for (const user of users) {
        console.log(`⏳ Migrando avatar do usuário #${user.id} (${user.nick})... [${user.avatar}]`);
        let newDriveUrl = null;

        if (user.avatar.startsWith('/uploads/')) {
            // Arquivo local no servidor
            const filename = path.basename(user.avatar);
            const filePath = path.join(UPLOADS_PATH, filename);
            if (fs.existsSync(filePath)) {
                newDriveUrl = await uploadLocalFileToDrive(filePath, 'Avatares');
            } else {
                console.warn(`⚠️ Arquivo local não encontrado em disco: ${filePath}`);
            }
        } else if (user.avatar.startsWith('http')) {
            // URL externa de avatar
            newDriveUrl = await uploadRemoteUrlToDrive(user.avatar, 'Avatares');
        }

        if (newDriveUrl) {
            await db.run('UPDATE users SET avatar = ? WHERE id = ?', [newDriveUrl, user.id]);
            console.log(`✅ Sucesso! Usuário #${user.id} atualizado para: ${newDriveUrl}`);
            successCount++;
        } else {
            console.error(`❌ Falha ao migrar avatar do usuário #${user.id}`);
        }
    }

    console.log(`\n🎉 Migração concluída! Total migrados com sucesso: ${successCount}/${users.length}`);
    process.exit(0);
}

migrateAvatars().catch(err => {
    console.error('💥 Erro fatal na migração:', err);
    process.exit(1);
});
