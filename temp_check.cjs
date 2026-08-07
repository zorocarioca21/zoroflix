const https = require('https');

const url = 'https://kixar.xyz/get.php?username=zorocarioca21&password=rf1st91a&type=m3u_plus&output=ts';

https.get(url, (res) => {
    let episodes = [];
    let buffer = '';

    res.on('data', (chunk) => {
        buffer += chunk.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop(); // keep last incomplete line
        
        for (const line of lines) {
            if (line.toLowerCase().includes('casa') && line.toLowerCase().includes('drag') && line.toLowerCase().includes('s03')) {
                const match = line.match(/S03[\sE]*(\d+)/i);
                if (match) {
                    episodes.push(parseInt(match[1]));
                } else {
                    console.log("Found line:", line);
                }
            }
        }
    });

    res.on('end', () => {
        if (episodes.length > 0) {
            console.log("Episodes found:", episodes.sort((a,b) => a-b));
            console.log("Latest episode:", Math.max(...episodes));
        } else {
            console.log("No episodes for S03 found.");
        }
    });
}).on('error', (e) => {
    console.error(e);
});
