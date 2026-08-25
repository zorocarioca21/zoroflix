const https = require('https');

https.get('https://superflixapi.sbs/calendario.php', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            console.log("Status Code:", res.statusCode);
            console.log("Data length:", data.length);
            console.log("Data sample:", data.substring(0, 300));
        } catch (e) {
            console.error(e);
        }
    });
}).on('error', err => console.error(err));
