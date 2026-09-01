import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..', '..');

const DOMAINS_TO_TEST = [
    'superflixapi.beer',
    'superflixapi.sbs',
    'superflixapi.dev',
    'superflixapi.net',
    'superflixapi.link',
    'superflixapi.top',
    'superflixapi.online',
    'superflixapi.pro',
    'superflixapi.lol',
    'superflixapi.org',
    'superflixapi.com',
    'superflixapi.co',
    'superflixapi.cc'
];

async function checkDomain(domain) {
    return new Promise((resolve) => {
        const req = https.get(`https://${domain}/calendario.php`, { timeout: 5000 }, (res) => {
            if (res.statusCode === 200) {
                resolve(domain);
            } else {
                resolve(null);
            }
            res.resume(); // consume response data to free up memory
        }).on('error', () => {
            resolve(null);
        }).on('timeout', () => {
            req.destroy();
            resolve(null);
        });
    });
}

function getCurrentDomain() {
    try {
        const sportsJs = fs.readFileSync(path.join(ROOT_DIR, 'backend', 'routes', 'sports.js'), 'utf8');
        const match = sportsJs.match(/https:\/\/(superflixapi\.[a-z]+)\//);
        if (match && match[1]) {
            return match[1];
        }
    } catch (err) {
        console.error("Erro ao ler domínio atual:", err);
    }
    return 'superflixapi.beer';
}

function replaceInFile(filePath, oldDomain, newDomain) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(oldDomain)) {
        fs.writeFileSync(filePath, content.replaceAll(oldDomain, newDomain));
        console.log(`[+] Atualizado: ${filePath}`);
        return true;
    }
    return false;
}

function walkAndReplace(dir, oldDomain, newDomain) {
    let changed = false;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
                if (walkAndReplace(fullPath, oldDomain, newDomain)) changed = true;
            }
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
            if (replaceInFile(fullPath, oldDomain, newDomain)) changed = true;
        }
    }
    return changed;
}

async function run() {
    console.log("Iniciando varredura de domínios Superflix...");
    
    let activeDomain = null;
    for (const domain of DOMAINS_TO_TEST) {
        process.stdout.write(`Testando ${domain}... `);
        const result = await checkDomain(domain);
        if (result) {
            console.log("OK!");
            activeDomain = result;
            break;
        } else {
            console.log("Falhou.");
        }
    }

    if (!activeDomain) {
        console.log("Nenhum domínio ativo encontrado.");
        return;
    }

    const currentDomain = getCurrentDomain();
    console.log(`Domínio atual no código: ${currentDomain}`);
    
    if (activeDomain === currentDomain) {
        console.log("O domínio atual já está funcionando perfeitamente. Nenhuma ação necessária.");
        return;
    }

    console.log(`Domínio mudou de ${currentDomain} para ${activeDomain}! Substituindo no código...`);
    
    const wasChanged = walkAndReplace(ROOT_DIR, currentDomain, activeDomain);

    if (wasChanged) {
        console.log("Substituição concluída. Reconstruindo a interface React (npm run build)...");
        try {
            execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
            console.log("Build concluído. Reiniciando backend (PM2)...");
            execSync('pm2 restart zoroflix', { cwd: ROOT_DIR, stdio: 'inherit' });
            console.log("Processo finalizado com sucesso!");
        } catch (err) {
            console.error("Erro durante o build ou restart:", err.message);
        }
    } else {
        console.log("Nenhum arquivo modificado.");
    }
}

run();
