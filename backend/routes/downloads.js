import express from 'express';
import Transmission from 'transmission-promise';
import fs from 'fs';
import path from 'path';

import { searchTorrents } from '../utils/torrentScraper.js';

let transmission;
try {
    transmission = new Transmission({
        host: 'localhost',
        port: 9091
    });
} catch (err) {
    console.warn("Aviso: Falha ao inicializar o Transmission. Certifique-se de que ele está rodando.");
}

async function filterEpisodeFiles(torrentId, episode, transmission) {
    if (!episode) return;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutos (60 * 2000ms)
    
    console.log(`[DOWNLOAD] Aguardando metadados do torrent ${torrentId} para filtrar o episódio ${episode}...`);

    const interval = setInterval(async () => {
        try {
            attempts++;
            const t_data = await transmission.get([torrentId], ['id', 'metadataPercentComplete', 'files']);
            if (t_data && t_data.torrents && t_data.torrents.length > 0) {
                const t = t_data.torrents[0];
                if (t.metadataPercentComplete === 1 && t.files && t.files.length > 0) {
                    clearInterval(interval);
                    
                    const epPad = episode.toString().padStart(2, '0');
                    const fileIndicesToKeep = [];
                    const fileIndicesToSkip = [];
                    
                    for (let i = 0; i < t.files.length; i++) {
                        const file = t.files[i];
                        const name = file.name.toLowerCase();
                        
                        const isEp = name.includes(`s01e${epPad}`) || 
                                     name.includes(`s02e${epPad}`) || 
                                     name.includes(`s03e${epPad}`) || 
                                     name.includes(`e${epPad}`) || 
                                     name.includes(`ep${epPad}`) || 
                                     name.includes(`episodio ${episode}`) ||
                                     name.includes(`episódio ${episode}`) ||
                                     name.includes(`episodio ${epPad}`) ||
                                     name.includes(`episódio ${epPad}`);
                                     
                        if (isEp && (name.endsWith('.mkv') || name.endsWith('.mp4') || name.endsWith('.avi'))) {
                            fileIndicesToKeep.push(i);
                        } else {
                            fileIndicesToSkip.push(i);
                        }
                    }
                    
                    if (fileIndicesToKeep.length > 0) {
                        console.log(`[DOWNLOAD] Metadados carregados! Filtrando episódio ${episode} (Mantendo ${fileIndicesToKeep.length} arquivo(s), Desmarcando ${fileIndicesToSkip.length} arquivo(s))`);
                        await transmission.set(torrentId, {
                            'files-wanted': fileIndicesToKeep,
                            'files-unwanted': fileIndicesToSkip
                        });
                    } else {
                        console.log(`[DOWNLOAD] Metadados carregados, mas não consegui identificar claramente o episódio ${episode} nos arquivos. Baixando tudo por segurança.`);
                    }
                }
            }
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                console.log(`[DOWNLOAD] Timeout ao aguardar metadados do torrent ${torrentId}. Vai baixar o pack inteiro.`);
            }
        } catch (e) {
            console.error(`Erro ao monitorar metadados do torrent ${torrentId}:`, e.message);
        }
    }, 2000);
}

export default function(db) {
    const router = express.Router();

    // Helper to get user/uuid
    const getAuth = (req) => {
        let user_id = null;
        let uuid = req.headers['x-device-uuid'] || null;
        if (req.user) user_id = req.user.id;
        return { user_id, uuid };
    };

    // Inicia um download
    router.post('/request', async (req, res) => {
        try {
            const { title, type, year, season, episode, poster_path } = req.body;
            if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

            const { user_id, uuid } = getAuth(req);

            const opts = {
                tipo: type === 'tv' ? 'serie' : 'filme',
                ano: year || null,
                temporada: season || null,
                episodio: episode || null
            };
            
            console.log(`[DOWNLOAD] Buscando torrent: "${title}" | Tipo: ${opts.tipo} | Temp: ${opts.temporada || '-'} | Ep: ${opts.episodio || '-'}`);

            const results = await searchTorrents(title, opts);
            
            if (results.dubbed) {
                console.log(`[DOWNLOAD] Encontrado: ${results.dubbed.title} (Qualidade: ${results.dubbed.quality})`);
            } else {
                console.log(`[DOWNLOAD] Nenhum torrent encontrado para: "${title}"`);
            }
            
            if (!results.dubbed) {
                return res.status(404).json({ error: 'Nenhum torrent dublado encontrado.' });
            }

            if (!transmission) return res.status(503).json({ error: 'Servidor Transmission indisponível' });

            // Adiciona ao transmission
            const torrent = await transmission.addUrl(results.dubbed.url, { paused: false });
            
            // Inicia o processo assíncrono de filtragem do episódio no pack
            if (opts.episodio) {
                filterEpisodeFiles(torrent.id, opts.episodio, transmission);
            }
            
            // Salvar no BD
            const savedTitle = opts.episodio ? `${results.dubbed.title} (Episódio ${opts.episodio})` : results.dubbed.title;
            await db.run(
                `INSERT INTO user_downloads (uuid, user_id, transmission_id, title, poster_path, media_type)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [uuid, user_id, torrent.id, savedTitle, poster_path, type]
            );

            res.json({ success: true, torrent, title: results.dubbed.title });
        } catch (err) {
            console.error("Erro no download request:", err);
            res.status(500).json({ error: 'Erro ao iniciar download' });
        }
    });

    // Lista os downloads do usuário
    router.get('/list', async (req, res) => {
        try {
            const { user_id, uuid } = getAuth(req);
            let query = `SELECT * FROM user_downloads WHERE uuid = ?`;
            let params = [uuid];
            
            if (user_id) {
                query = `SELECT * FROM user_downloads WHERE user_id = ? OR uuid = ?`;
                params = [user_id, uuid];
            }

            const downloads = await db.all(query, params);
            
            // Atualiza status dinamicamente do Transmission se disponível
            if (transmission && downloads.length > 0) {
                try {
                    const t_ids = downloads.map(d => d.transmission_id);
                    const t_data = await transmission.get(t_ids);
                    
                    const t_map = {};
                    if (t_data && t_data.torrents) {
                        t_data.torrents.forEach(t => {
                            t_map[t.id] = t;
                        });
                    }

                    for (let d of downloads) {
                        const tInfo = t_map[d.transmission_id];
                        if (tInfo) {
                            d.percentDone = tInfo.percentDone;
                            d.t_status = tInfo.status; // Transmission status code
                            d.rateDownload = tInfo.rateDownload;
                        } else {
                            d.percentDone = -1; // Missing from transmission
                        }
                    }
                } catch (e) {
                    // Ignore transmission errors on list, just return db info
                }
            }

            res.json(downloads);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Falha ao listar downloads' });
        }
    });

    // Exclui um download
    router.delete('/:id', async (req, res) => {
        try {
            const { user_id, uuid } = getAuth(req);
            let query = `SELECT * FROM user_downloads WHERE id = ? AND uuid = ?`;
            let params = [req.params.id, uuid];
            
            if (user_id) {
                query = `SELECT * FROM user_downloads WHERE id = ? AND (user_id = ? OR uuid = ?)`;
                params = [req.params.id, user_id, uuid];
            }

            const download = await db.get(query, params);
            
            if (!download) {
                return res.status(404).json({ error: 'Download não encontrado ou sem permissão' });
            }

            if (transmission) {
                try {
                    await transmission.remove([download.transmission_id], true);
                } catch(e) {
                    console.log("Transmission error on remove:", e.message);
                }
            }

            await db.run(`DELETE FROM user_downloads WHERE id = ?`, [download.id]);

            res.json({ success: true });
        } catch (err) {
            console.error("Erro no delete de download:", err);
            res.status(500).json({ error: 'Erro ao remover download' });
        }
    });

    // Pausar um torrent
    router.post('/pause/:t_id', async (req, res) => {
        try {
            const { user_id, uuid } = getAuth(req);
            if (!transmission) return res.status(503).json({ error: 'Transmission offline' });
            await transmission.stop(parseInt(req.params.t_id));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Continuar (Resume) um torrent
    router.post('/resume/:t_id', async (req, res) => {
        try {
            const { user_id, uuid } = getAuth(req);
            if (!transmission) return res.status(503).json({ error: 'Transmission offline' });
            await transmission.start(parseInt(req.params.t_id));
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Pega o status do torrent (ou de todos)
    router.get('/status/:id', async (req, res) => {
        if (!transmission) return res.status(503).json({ error: 'Transmission indisponível' });
        try {
            const id = parseInt(req.params.id);
            const data = await transmission.get(id);
            if (!data.torrents || data.torrents.length === 0) return res.status(404).json({ error: 'Torrent não encontrado' });
            
            const t = data.torrents[0];
            res.json({ 
                id: t.id, 
                name: t.name,
                percentDone: t.percentDone,
                status: t.status, 
                downloadDir: t.downloadDir,
                files: t.files
            });
        } catch (err) {
            res.status(500).json({ error: 'Falha ao buscar status do torrent' });
        }
    });

    // Pega o link para o arquivo já baixado
    router.get('/file/:id', async (req, res) => {
        if (!transmission) return res.status(503).json({ error: 'Transmission indisponível' });
        try {
            const id = parseInt(req.params.id); // transmission_id
            const data = await transmission.get(id);
            if (!data.torrents || data.torrents.length === 0) return res.status(404).json({ error: 'Torrent não encontrado no transmission' });
            
            const t = data.torrents[0];
            if (t.percentDone < 1) {
                return res.status(400).json({ error: 'Download ainda não terminou.' });
            }

            // Acha o maior arquivo (geralmente o video)
            let largestFile = t.files[0];
            for(let f of t.files) {
                if(f.length > largestFile.length) largestFile = f;
            }

            const filePath = path.join(t.downloadDir, largestFile.name);
            
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Arquivo físico não encontrado no disco.' });
            }

            // Inicia o download do arquivo
            res.download(filePath);
        } catch (err) {
            res.status(500).json({ error: 'Falha ao baixar arquivo' });
        }
    });

    return router;
}
