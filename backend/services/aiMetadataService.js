import axios from 'axios';
import https from 'https';

const agent = new https.Agent({ family: 4 });
const ZOROBOT_API_KEY = process.env.ZOROBOT_API_KEY || '21santoryu21';

/**
 * Consulta a IA da ZoroBot (Gemini 3.5 Flash) para extrair e normalizar metadados de títulos complexos/sujos.
 * @param {string} rawTitle - O título bruto do arquivo vindo da IPTV ou do upload manual.
 * @returns {Promise<{search_query: string, original_title?: string, parent_series?: string, media_type: 'movie'|'tv', season?: number, episode?: number}|null>}
 */
export async function extractMetadataWithAI(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return null;

    const prompt = `Extraia os metadados do título do arquivo de mídia para busca no TMDB.
Título bruto do arquivo: "${rawTitle}"

Instruções:
- Verifique se é conteúdo estritamente PORNOGRÁFICO / ADULTO EXPLICITO (+18 pornô, como Brasileirinhas, Red Light, Sexo Explícito, XXX, etc). NÃO marque como pornô filmes convencionais que apenas possuem classificação indicativa para maiores (como Deadpool, 50 Tons de Cinza, etc).
- Se for conteúdo estritamente pornô/adulto explícito, defina "is_porn": true. Caso contrário, false.
- Identifique se é filme ("movie") ou série/anime ("tv").
- Extraia nome da série ou filme, título original, temporada e episódio.
- Se for apenas o nome de um episódio de anime/série (como episódios conhecidos de Naruto, Boruto, Inuyasha), informe a série principal em parent_series.
- Retorne EXCLUSIVAMENTE o objeto JSON a seguir, sem texto antes ou depois:
{
  "is_porn": false,
  "search_query": "nome do filme ou série em português ou inglês",
  "original_title": "título original ou null",
  "parent_series": "nome da franquia/anime caso seja só nome de episódio ou null",
  "media_type": "tv",
  "season": 1,
  "episode": 1
}`;

    try {
        const resp = await axios.post(`https://api.zorobot.shop/api/ai/chat?apiKey=${ZOROBOT_API_KEY}`, {
            prompt: prompt,
            model: 'gemini-3.5-flash',
            systemInstruction: 'Você é um extrator de metadados de filmes/séries para TMDB. Retorne estritamente um objeto JSON sem comentários, sem raciocínio e sem tags adicionais.',
            temperature: 0.1,
            maxTokens: 1500
        }, {
            headers: { 'Content-Type': 'application/json' },
            httpsAgent: agent,
            timeout: 25000
        });

        const resposta = resp.data?.resposta || (typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data));
        if (!resposta) return null;

        // Limpa blocos de código markdown se houver
        let clean = resposta.replace(/```json/gi, '').replace(/```/g, '').trim();
        const matchJson = clean.match(/\{[\s\S]*\}/);
        const jsonStr = matchJson ? matchJson[0] : clean;
        const parsed = JSON.parse(jsonStr);

        return {
            is_porn: Boolean(parsed.is_porn),
            search_query: parsed.search_query || null,
            original_title: parsed.original_title || null,
            parent_series: parsed.parent_series || null,
            media_type: (parsed.media_type === 'movie' || parsed.media_type === 'tv') ? parsed.media_type : 'tv',
            season: typeof parsed.season === 'number' ? parsed.season : (parsed.season ? parseInt(parsed.season) : null),
            episode: typeof parsed.episode === 'number' ? parsed.episode : (parsed.episode ? parseInt(parsed.episode) : null)
        };
    } catch (e) {
        console.warn(`[AI METADATA] Falha ao consultar Gemini 3.5 Flash para "${rawTitle}":`, e.response?.data || e.message);
        return null;
    }
}
