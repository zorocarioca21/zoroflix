import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader } from 'lucide-react';

export default function CustomVideoPlayer({ messageId, contentId, season, episode }) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isBuffering, setIsBuffering] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef(null);
    
    const [resumeData, setResumeData] = useState(null);
    const [showResumePopup, setShowResumePopup] = useState(false);
    const [videoError, setVideoError] = useState(false);

    // Buscar o progresso (se tem resume_time salvo)
    useEffect(() => {
        if (!contentId) return;

        const token = localStorage.getItem('cinegeek_token');
        const uuidVal = localStorage.getItem('cinegeek_uuid');
        const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        fetch(`/api/recents`, { headers })
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    // Tenta achar o vídeo exato no recents (usando content_id, e caso série, season/episode)
                    const found = data.find(r => 
                        String(r.content_id) === String(contentId) && 
                        r.season === (season ? parseInt(season) : null) &&
                        r.episode === (episode ? parseInt(episode) : null)
                    );

                    // Se tiver um resume_time maior que 15 segundos (pra não encher o saco se a pessoa abriu e fechou rapido)
                    if (found && found.resume_time > 15) {
                        setResumeData(found.resume_time);
                        setShowResumePopup(true);
                    }
                }
            })
            .catch(err => console.error("Erro ao buscar histórico:", err));
    }, [contentId, season, episode]);

    // Timer para salvar o progresso a cada 10 segundos
    useEffect(() => {
        const interval = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused && videoRef.current.currentTime > 5 && !videoError) {
                const token = localStorage.getItem('cinegeek_token');
                const uuidVal = localStorage.getItem('cinegeek_uuid');
                const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                fetch('/api/recents/progress', {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({
                        content_id: String(contentId),
                        season: season ? parseInt(season) : null,
                        episode: episode ? parseInt(episode) : null,
                        resume_time: Math.floor(videoRef.current.currentTime)
                    })
                }).catch(err => console.error("Erro ping progresso:", err));
            }
        }, 10000); // Salva a cada 10s

        return () => clearInterval(interval);
    }, [contentId, season, episode, videoError]);

    // Auto-hide controls
    useEffect(() => {
        const resetControls = () => {
            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            if (isPlaying) {
                controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
            }
        };

        const el = containerRef.current;
        if (el) {
            el.addEventListener('mousemove', resetControls);
            el.addEventListener('mouseleave', () => { if(isPlaying) setShowControls(false) });
        }
        return () => {
            if (el) {
                el.removeEventListener('mousemove', resetControls);
                el.removeEventListener('mouseleave', () => { if(isPlaying) setShowControls(false) });
            }
        };
    }, [isPlaying]);

    const togglePlay = () => {
        if (videoError) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
        } else {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    };

    const toggleMute = () => {
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => {
                console.error(`Erro ao ativar tela cheia: ${err.message}`);
            });
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const handleVolumeChange = (e) => {
        const val = parseFloat(e.target.value);
        videoRef.current.volume = val;
        setVolume(val);
        setIsMuted(val === 0);
    };

    const handleProgress = (e) => {
        const val = parseFloat(e.target.value);
        videoRef.current.currentTime = val;
        setCurrentTime(val);
    };

    const formatTime = (timeInSeconds) => {
        if (isNaN(timeInSeconds)) return "00:00";
        const h = Math.floor(timeInSeconds / 3600);
        const m = Math.floor((timeInSeconds % 3600) / 60);
        const s = Math.floor(timeInSeconds % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div ref={containerRef} className={`custom-player-container ${showControls ? '' : 'hide-controls'}`} style={{ width: '100%', height: '100%', position: 'relative', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <video
                ref={videoRef}
                src={`/api/stream/telegram/${messageId}`}
                style={{ width: '100%', height: '100%', objectFit: 'contain', zIndex: 1, display: videoError ? 'none' : 'block' }}
                onClick={togglePlay}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => setCurrentTime(videoRef.current.currentTime)}
                onLoadedMetadata={() => setDuration(videoRef.current.duration)}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => setIsBuffering(false)}
                onError={(e) => {
                    const err = e.target.error;
                    if (err && err.code === 4) {
                        setVideoError(true);
                    }
                }}
            />

            {/* Error Message */}
            {videoError && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: '#111', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
                    <div style={{ background: 'rgba(255, 68, 68, 0.1)', padding: '2rem', borderRadius: '16px', border: '2px solid #ff4444', maxWidth: '500px' }}>
                        <h3 style={{ color: '#ff4444', marginBottom: '1rem', fontSize: '1.5rem' }}>Problema no Servidor de Vídeo</h3>
                        <p style={{ color: '#ccc', lineHeight: '1.5', marginBottom: '1rem' }}>
                            Oops! Parece que o arquivo deste vídeo foi corrompido ou apagado na nuvem.
                        </p>
                        <p style={{ color: '#00ff88', fontWeight: 'bold' }}>
                            O nosso sistema inteligente já detectou o problema e mandou o robô baixar este filme de novo! Tente assistir novamente daqui a alguns minutos.
                        </p>
                    </div>
                </div>
            )}

            {/* Giant Center Play Button */}
            {!isPlaying && !isBuffering && !showResumePopup && !videoError && (
                <div onClick={togglePlay} style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    zIndex: 2, cursor: 'pointer', background: 'rgba(0, 255, 136, 0.2)',
                    borderRadius: '50%', padding: '20px', border: '3px solid #00ff88',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 20px rgba(0,255,136,0.3)', transition: 'transform 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'}
                >
                    <Play size={64} color="#00ff88" fill="#00ff88" style={{ marginLeft: '8px' }} />
                </div>
            )}

            {/* Buffering Indicator */}
            {isBuffering && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3, pointerEvents: 'none' }}>
                    <Loader size={64} color="#00ff88" className="spin-anim" />
                </div>
            )}

            {/* Resume Popup */}
            {showResumePopup && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#13131a', border: '2px solid #00ff88', padding: '2rem', borderRadius: '16px', textAlign: 'center', maxWidth: '400px', boxShadow: '0 10px 30px rgba(0,255,136,0.2)' }}>
                        <h3 style={{ color: '#00ff88', marginBottom: '1rem', fontSize: '1.4rem' }}>Continuar de onde parou?</h3>
                        <p style={{ color: '#ccc', marginBottom: '2rem', fontSize: '1rem' }}>
                            Você parou em: <strong style={{ color: '#fff' }}>{formatTime(resumeData)}</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button onClick={() => {
                                videoRef.current.currentTime = resumeData;
                                setShowResumePopup(false);
                                togglePlay();
                            }} style={{ background: '#00ff88', color: '#000', padding: '0.8rem 1.5rem', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>
                                Sim, continuar
                            </button>
                            <button onClick={() => {
                                videoRef.current.currentTime = 0;
                                setShowResumePopup(false);
                                togglePlay();
                            }} style={{ background: '#333', color: '#fff', padding: '0.8rem 1.5rem', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 }}>
                                Não, reiniciar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Controls Bar */}
            <div className="player-controls-overlay" style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2rem 1rem 1rem 1rem',
                background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                opacity: showControls || !isPlaying ? 1 : 0,
                transition: 'opacity 0.3s ease',
                display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 5
            }}>
                {/* Timeline */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ color: '#fff', fontSize: '0.85rem', width: '50px', textAlign: 'right' }}>{formatTime(currentTime)}</span>
                    <input 
                        type="range" 
                        min={0} max={duration || 100} value={currentTime}
                        onChange={handleProgress}
                        style={{ flex: 1, accentColor: '#00ff88', height: '4px', cursor: 'pointer' }}
                    />
                    <span style={{ color: '#888', fontSize: '0.85rem', width: '50px' }}>{formatTime(duration)}</span>
                </div>

                {/* Bottom Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button onClick={togglePlay} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                            {isPlaying ? <Pause size={28} /> : <Play size={28} />}
                        </button>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button onClick={toggleMute} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                            <input 
                                type="range" 
                                min={0} max={1} step={0.01} value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                style={{ width: '80px', accentColor: '#00ff88', height: '4px', cursor: 'pointer' }}
                            />
                        </div>
                    </div>

                    <button onClick={toggleFullscreen} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                        {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                    </button>
                </div>
            </div>

            <style>{`
                .spin-anim { animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
