const fs = require('fs');
const readline = require('readline');

const url = "http://netysi.top/get.php?username=561469288&password=258855164&type=m3u_plus&output=mpegts";
const tempFile = "temp_iptv_test.m3u";

async function downloadAndTest() {
    console.log("Iniciando download da IPTV...");
    
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'VLC/3.0.9 LibVLC/3.0.9',
                'Accept': '*/*'
            }
        });
        
        if (!response.ok) {
            console.error("HTTP Error:", response.status, response.statusText);
            return;
        }

        const fileStream = fs.createWriteStream(tempFile);
        
        for await (const chunk of response.body) {
            fileStream.write(chunk);
        }
        fileStream.end();
        
        console.log("Download concluído. Analisando o arquivo...");
        analyzeFile();
    } catch (err) {
        console.error("Erro no download: ", err.message);
    }
}

function analyzeFile() {
    const fileStream = fs.createReadStream(tempFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const samples = {
        movies: [],
        series: [],
        others: []
    };
    
    let stats = {
        totalItems: 0,
        moviesCount: 0,
        seriesCount: 0
    };

    let groups = new Set();

    rl.on('line', (line) => {
        if (line.startsWith('#EXTINF:')) {
            stats.totalItems++;
            
            const groupMatch = line.match(/group-title="([^"]+)"/);
            const group = groupMatch ? groupMatch[1] : "UNKNOWN";
            groups.add(group);
            
            const nameMatch = line.split(',').pop().trim();
            
            const lowerGroup = group.toLowerCase();
            const lowerName = nameMatch.toLowerCase();
            
            if (lowerGroup.includes('filme') || lowerGroup.includes('movie') || lowerGroup.includes('lançamento') || lowerName.includes('filme')) {
                stats.moviesCount++;
                if (samples.movies.length < 20 && !samples.movies.includes(nameMatch)) {
                    samples.movies.push({ group, name: nameMatch });
                }
            } else if (lowerGroup.includes('série') || lowerGroup.includes('serie') || lowerGroup.includes('ep ') || lowerGroup.includes('temporada') || lowerName.includes('s0') || lowerName.includes(' e0')) {
                stats.seriesCount++;
                if (samples.series.length < 20 && !samples.series.includes(nameMatch)) {
                    samples.series.push({ group, name: nameMatch });
                }
            } else {
                if (samples.others.length < 5) {
                    samples.others.push({ group, name: nameMatch });
                }
            }
        }
    });

    rl.on('close', () => {
        console.log("\n--- RESULTADOS DA ANÁLISE ---");
        console.log(`Total de itens encontrados: ${stats.totalItems}`);
        console.log(`Estimativa de Filmes: ${stats.moviesCount}`);
        console.log(`Estimativa de Episódios/Séries: ${stats.seriesCount}`);
        
        console.log("\nGrupos de Conteúdo Encontrados (Amostra de 30):");
        console.log(Array.from(groups).slice(0, 30));
        
        console.log("\nAmostra de Nomes de Filmes:");
        samples.movies.forEach(s => console.log(`[${s.group}] ${s.name}`));
        
        console.log("\nAmostra de Nomes de Séries:");
        samples.series.forEach(s => console.log(`[${s.group}] ${s.name}`));
        
        // Cleanup
        try { fs.unlinkSync(tempFile); } catch(e){}
    });
}

downloadAndTest();
