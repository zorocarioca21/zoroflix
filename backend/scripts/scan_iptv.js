import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pastas e Arquivos
const DATA_DIR = path.resolve(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const VIP_FILE = path.join(DATA_DIR, 'canais_vip.json');

// Arquivos do Repositório do GitHub
const GITHUB_BASE = 'https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/';
const PLAYLISTS = [
  'CanaisBR01.m3u8',
  'CanaisBR02.m3u8',
  'CanaisBR03.m3u8',
  'CanaisBR04.m3u8',
  'CanaisBR05.m3u8',
  'CanaisBR06.m3u8',
  'CanaisBR07.m3u8'
];

// Função para testar URL
async function testChannel(url) {
  try {
    const res = await axios.head(url, {
      timeout: 5000,
      validateStatus: function (status) {
        return status >= 200 && status < 400; // resolve if 2xx or 3xx
      }
    });
    return true;
  } catch (err) {
    return false;
  }
}

// Parser M3U
function parseM3U(content) {
  const lines = content.split('\n');
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF')) continue;

    const info = lines[i];
    const url = lines[i + 1]?.trim();
    if (!url) continue;

    const name = info.split(',').pop().trim();
    const logo = info.match(/tvg-logo="([^"]+)"/)?.[1] || '';
    const group = info.match(/group-title="([^"]+)"/)?.[1] || '';

    // Se for link VOD (filmes/séries), pula
    if (url.endsWith('.mp4') || url.endsWith('.mkv') || url.endsWith('.mp3')) continue;

    items.push({ 
        id: 'vip-' + Buffer.from(url).toString('base64').substring(0, 10) + Date.now(),
        name, 
        url, 
        logo, 
        group,
        isVip: true 
    });
  }
  return items;
}

// Utilitário de Concorrência
async function pMap(array, asyncFn, concurrency) {
  const results = [];
  const executing = new Set();
  
  for (const item of array) {
    const p = Promise.resolve().then(() => asyncFn(item));
    results.push(p);
    executing.add(p);
    
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

// Fluxo Principal
export async function runScanner() {
  console.log('🚀 Iniciando Scanner IPTV (Background) - Repositório: Ramys/Iptv-Brasil-2026');
  
  let allItems = [];

  for (const file of PLAYLISTS) {
    try {
      const res = await axios.get(GITHUB_BASE + file, { timeout: 10000 });
      const items = parseM3U(res.data);
      allItems.push(...items);
    } catch (err) {
      console.error(`❌ Falha ao baixar ${file}:`, err.message);
    }
  }

  // Remove duplicados pelo URL
  const uniqueItems = Array.from(new Map(allItems.map(i => [i.url, i])).values());
  console.log(`\n🔍 Testando ${uniqueItems.length} canais (Concorrência: 30)...`);

  let online = 0;
  let offline = 0;
  const workingChannels = [];

  await pMap(uniqueItems, async (item) => {
    const ok = await testChannel(item.url);
    if (ok) {
      online++;
      workingChannels.push(item);
    } else {
      offline++;
    }
  }, 30); // Testa 30 canais simultaneamente

  fs.writeFileSync(VIP_FILE, JSON.stringify(workingChannels, null, 2));

  console.log('\n====================================');
  console.log('🔥 SCAN FINALIZADO 🔥');
  console.log(`📺 Canais Testados: ${uniqueItems.length}`);
  console.log(`🟢 Online (Salvos): ${online}`);
  console.log(`🔴 Offline (Mortos): ${offline}`);
  console.log('====================================\n');
}

// Para testar diretamente se rodar o script sozinho
if (process.argv[1] && process.argv[1] === __filename) {
    runScanner();
}
