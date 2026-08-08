import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const HLS_DIR = path.join(path.resolve(), 'data', 'hls');

// Ensure HLS dir exists
if (!fs.existsSync(HLS_DIR)) {
    fs.mkdirSync(HLS_DIR, { recursive: true });
}

// Stores active streams: { streamId: { process: FFmpegProcess, lastAccess: timestamp, targetUrl: string } }
const activeStreams = {};

// Clean up old streams every 10 seconds
setInterval(() => {
    const now = Date.now();
    for (const [streamId, data] of Object.entries(activeStreams)) {
        // If not accessed for 30 seconds, kill it
        if (now - data.lastAccess > 30000) {
            console.log(`[HlsManager] Stream ${streamId} inativo. Encerrando FFmpeg...`);
            data.process.kill('SIGKILL');
            delete activeStreams[streamId];

            // Limpa a pasta
            const streamFolder = path.join(HLS_DIR, streamId);
            if (fs.existsSync(streamFolder)) {
                fs.rmSync(streamFolder, { recursive: true, force: true });
            }
        }
    }
}, 10000);

/**
 * Retorna o ID do stream e o status (se já existe ou foi criado agora)
 */
function getOrCreateStream(targetUrl) {
    // Cria um hash seguro da URL para servir de pasta
    const streamId = crypto.createHash('md5').update(targetUrl).digest('hex');
    
    if (activeStreams[streamId]) {
        activeStreams[streamId].lastAccess = Date.now();
        return streamId;
    }

    const streamFolder = path.join(HLS_DIR, streamId);
    if (!fs.existsSync(streamFolder)) {
        fs.mkdirSync(streamFolder, { recursive: true });
    } else {
        // Limpa lixo de crashes anteriores
        fs.readdirSync(streamFolder).forEach(file => fs.unlinkSync(path.join(streamFolder, file)));
    }

    const m3u8Path = path.join(streamFolder, 'index.m3u8');

    // Muxing IPTV to HLS
    // -reconnect ensures it retries if the provider drops
    // -c copy is fast (no transcoding)
    // -hls_time 4 (4s segments)
    // -hls_list_size 5 (keep only latest 5 segments in m3u8)
    // -hls_flags delete_segments (auto delete old ts files)
    const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-user_agent', 'VLC/3.0.9 LibVLC/3.0.9',
        '-i', targetUrl,
        '-c', 'copy',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments', // Removido append_list que não era necessário
        m3u8Path
    ];

    console.log(`[HlsManager] Iniciando FFmpeg para o stream: ${streamId}`);
    const ffmpeg = spawn('ffmpeg', ffmpegArgs);

    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('403 Forbidden')) {
            console.error(`[HlsManager] Provedor bloqueou FFmpeg (${streamId}) com 403!`);
        } else {
            console.error(`[HlsManager/FFmpeg] ${msg.trim()}`);
        }
    });

    ffmpeg.on('close', (code) => {
        console.log(`[HlsManager] FFmpeg encerrado (${streamId}) com código ${code}`);
        if (activeStreams[streamId]) {
            delete activeStreams[streamId];
        }
    });

    activeStreams[streamId] = {
        process: ffmpeg,
        targetUrl,
        lastAccess: Date.now()
    };

    return streamId;
}

/**
 * Marca que o stream foi acessado para evitar o encerramento por inatividade
 */
function pingStream(streamId) {
    if (activeStreams[streamId]) {
        activeStreams[streamId].lastAccess = Date.now();
        return true;
    }
    return false;
}

export { getOrCreateStream, pingStream, HLS_DIR };
