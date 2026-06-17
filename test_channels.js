
import axios from 'axios';

async function test() {
    try {
        const url = 'https://superflixapi.fit/lista?category=canais&format=json';
        const response = await axios.get(url, {
             headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
        });
        console.log(JSON.stringify(response.data.data.slice(0, 10), null, 2));
    } catch (e) {
        console.error(e.message);
    }
}

test();
