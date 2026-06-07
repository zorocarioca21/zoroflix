const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = 3005;

app.use(cors());

app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).send('URL não fornecida.');
    }

    try {
        console.log(`[Proxy] Buscando: ${targetUrl}`);
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error(`[Proxy Error] ${error.message}`);
        res.status(500).json({ error: 'Erro ao buscar dados da API externa.' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Proxy rodando em http://localhost:${PORT}`);
});
