import React, { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader, RotateCcw, RotateCw, PictureInPicture, AlertTriangle, Headphones, Settings, Crop, Cast, Layers } from 'lucide-react';

export default function CustomVideoPlayer({ messageId, srcUrl, title, isVip, isAdmin, isLive, contentId, season, episode, onNextEpisode, isLoadingEpisode, languageOptions, onLanguageChange, videoQualities, currentQuality, onQualityChange, currentVersion, onVersionChange, liveOptions }) {
    const videoRef = useRef(null);
    const containerRef = useRef(null);
    const hlsRef = useRef(null);
    const mpegtsRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isBuffering, setIsBuffering] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef(null);
    const lastMousePos = useRef({x: 0, y: 0});
    const lastClickTime = useRef(0);
    
    const [resumeData, setResumeData] = useState(null);
    const [showResumePopup, setShowResumePopup] = useState(false);
    const [videoError, setVideoError] = useState(false);
    const [concurrencyError, setConcurrencyError] = useState(null); // Bloqueio de 1 tela por vez
    const [showLanguageMenu, setShowLanguageMenu] = useState(false);
    
    // Detecta iOS para fallback
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const [showVersionMenu, setShowVersionMenu] = useState(false);
    const [zoomMode, setZoomMode] = useState('contain'); // Novo estado de Zoom
    const [isCastAvailable, setIsCastAvailable] = useState(false);
    const [isAirPlayAvailable, setIsAirPlayAvailable] = useState(false);
    const prevMessageId = useRef(messageId);
    const prevSrcUrl = useRef(srcUrl);
    const prevEpisode = useRef(episode);
    const prevContentId = useRef(contentId);
    const savedSwitchTimeRef = useRef(null);

    // Debug State for Admins
    const [debugLogs, setDebugLogs] = useState([]);
    const [showDebug, setShowDebug] = useState(isAdmin);
    const seekStartTimeRef = useRef(0);
    const pointsAwardedRef = useRef(false);

    const addDebugLog = (msg) => {
        if (!isAdmin) return;
        const time = new Date().toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit', fractionalSecondDigits: 3 });
        setDebugLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
    };

    // Função de report que funciona para TODOS os usuários (não apenas admin)
    const reportBrokenVideo = async () => {
        if (!messageId) return;
        try {
            // Evita flood: só reporta uma vez POR VÍDEO na sessão
            if (!window._reportedBrokenVideos) window._reportedBrokenVideos = new Set();
            if (window._reportedBrokenVideos.has(messageId)) return;
            window._reportedBrokenVideos.add(messageId);
            
            await fetch('/api/audit/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId })
            });
            console.log('Vídeo reportado como quebrado automaticamente.');
        } catch (e) {
            console.error('Erro ao reportar vídeo quebrado', e);
        }
    };

    // Detector de buffering infinito - funciona para TODOS os usuários
    useEffect(() => {
        if (!videoRef.current) return;
        const vid = videoRef.current;

        let bufferingTimeout;
        const onWaitingReport = () => {
            if (!isIOS) {
                bufferingTimeout = setTimeout(() => {
                    reportBrokenVideo();
                }, 15000);
            }
        };
        const onPlayingReport = () => {
            if (bufferingTimeout) clearTimeout(bufferingTimeout);
        };
        const onErrorReport = () => {
            if (vid.error && (vid.error.code === 4 || vid.error.code === 3)) {
                reportBrokenVideo();
            }
        };

        vid.addEventListener('waiting', onWaitingReport);
        vid.addEventListener('playing', onPlayingReport);
        vid.addEventListener('error', onErrorReport);

        return () => {
            if (bufferingTimeout) clearTimeout(bufferingTimeout);
            vid.removeEventListener('waiting', onWaitingReport);
            vid.removeEventListener('playing', onPlayingReport);
            vid.removeEventListener('error', onErrorReport);
        };
    }, [messageId]);

    // Video Event Listeners for Debugging (Admin only)
    useEffect(() => {
        if (!isAdmin || !videoRef.current) return;
        const vid = videoRef.current;

        const onSeeking = () => {
            seekStartTimeRef.current = performance.now();
            addDebugLog(`SEEKING para ${vid.currentTime.toFixed(2)}s`);
        };
        const onSeeked = () => {
            const timeTaken = (performance.now() - seekStartTimeRef.current).toFixed(0);
            addDebugLog(`SEEKED concluído em ${timeTaken}ms`);
        };
        
        let bufferingTimeout;
        const onWaiting = () => {
            addDebugLog(`WAITING (Buffering iniciado no tempo ${vid.currentTime.toFixed(2)}s)`);
            seekStartTimeRef.current = performance.now();
            if (!isIOS) {
                bufferingTimeout = setTimeout(() => {
                    addDebugLog(`⚠️ Buffering infinito detectado (>15s). Reportando vídeo.`);
                }, 15000);
            }
        };
        const onPlaying = () => {
            if (bufferingTimeout) clearTimeout(bufferingTimeout);
            if (seekStartTimeRef.current > 0) {
                const timeTaken = (performance.now() - seekStartTimeRef.current).toFixed(0);
                addDebugLog(`PLAYING (Playback retomado. Buffer levou ${timeTaken}ms)`);
                seekStartTimeRef.current = 0;
            } else {
                addDebugLog(`PLAYING (Playback iniciado)`);
            }
        };
        const onStalled = () => addDebugLog('STALLED (Sem dados da rede)');
        const onSuspend = () => addDebugLog('SUSPEND (Download suspenso pelo navegador)');
        const onCanPlay = () => addDebugLog('CAN PLAY (Dados suficientes para iniciar)');
        const onCanPlayThrough = () => addDebugLog('CAN PLAY THROUGH (Pode tocar até o fim sem pausas estimadas)');
        const onError = () => {
            addDebugLog(`ERROR (${vid.error?.code}: ${vid.error?.message})`);
        };
        
        vid.addEventListener('seeking', onSeeking);
        vid.addEventListener('seeked', onSeeked);
        vid.addEventListener('waiting', onWaiting);
        vid.addEventListener('playing', onPlaying);
        vid.addEventListener('stalled', onStalled);
        vid.addEventListener('suspend', onSuspend);
        vid.addEventListener('canplay', onCanPlay);
        vid.addEventListener('canplaythrough', onCanPlayThrough);
        vid.addEventListener('error', onError);

        return () => {
            if (bufferingTimeout) clearTimeout(bufferingTimeout);
            vid.removeEventListener('seeking', onSeeking);
            vid.removeEventListener('seeked', onSeeked);
            vid.removeEventListener('waiting', onWaiting);
            vid.removeEventListener('playing', onPlaying);
            vid.removeEventListener('stalled', onStalled);
            vid.removeEventListener('suspend', onSuspend);
            vid.removeEventListener('canplay', onCanPlay);
            vid.removeEventListener('canplaythrough', onCanPlayThrough);
            vid.removeEventListener('error', onError);
        };
    }, [isAdmin, messageId, isIOS]);

    const toggleZoom = () => setZoomMode(prev => prev === 'contain' ? 'cover' : (prev === 'cover' ? 'fill' : 'contain'));

    // Cast & AirPlay Availability Check
    // Cast & AirPlay Availability Check
    useEffect(() => {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (window.WebKitPlaybackTargetAvailabilityEvent || isIOS) {
            setIsAirPlayAvailable(true);
        }

        const checkCast = () => {
            if ((window.isCastApiAvailable && window.cast && window.chrome) || isMobile) {
                setIsCastAvailable(true);
            }
        };
        checkCast();
        const castInterval = setInterval(checkCast, 1000);
        return () => clearInterval(castInterval);
    }, [isIOS]);

    const handleCastClick = () => {
        // AirPlay Priority (Safari/iOS)
        if (videoRef.current && videoRef.current.webkitShowPlaybackTargetPicker) {
            videoRef.current.webkitShowPlaybackTargetPicker();
            return;
        }

        // Chromecast Priority (Chrome/Android)
        if (isCastAvailable && window.cast && window.cast.framework) {
            const castContext = window.cast.framework.CastContext.getInstance();
            castContext.requestSession().then(
                () => {
                    const session = castContext.getCurrentSession();
                    if (session) {
                        const castUrl = srcUrl || (messageId ? `${window.location.origin}/api/stream/telegram/${messageId}` : '');
                        if (!castUrl) return;

                        const mediaInfo = new window.chrome.cast.media.MediaInfo(castUrl, 'video/mp4');
                        mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
                        mediaInfo.metadata.title = 'CineGeek Player';

                        const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
                        if (videoRef.current && videoRef.current.currentTime > 0) {
                            request.currentTime = videoRef.current.currentTime;
                        }

                        session.loadMedia(request).then(
                            () => { console.log('Cast loaded'); if (videoRef.current) videoRef.current.pause(); },
                            (error) => console.log('Cast load error:', error)
                        );
                    }
                },
                (error) => console.log('Cast session error:', error)
            );
        } else {
            alert('A transmissão (Chromecast/AirPlay) não pôde ser iniciada. Verifique se o seu dispositivo e a TV estão na mesma rede WiFi e se o navegador é compatível (Chrome/Safari).');
        }
    };

    // Seamlessly handle messageId / srcUrl changes (mudança de versão, qualidade ou idioma)
    useEffect(() => {
        const isMsgChanged = prevMessageId.current !== messageId;
        const isSrcChanged = prevSrcUrl.current !== srcUrl;

        if ((isMsgChanged || isSrcChanged) && videoRef.current) {
            const isSameEpisode = prevEpisode.current === episode && prevContentId.current === contentId;
            // Salva o tempo atual se ainda estivermos no mesmo episódio/filme
            if (isSameEpisode && videoRef.current.currentTime > 0) {
                savedSwitchTimeRef.current = videoRef.current.currentTime;
            } else if (!isSameEpisode) {
                savedSwitchTimeRef.current = null;
            }

            prevMessageId.current = messageId;
            prevSrcUrl.current = srcUrl;
            prevEpisode.current = episode;
            prevContentId.current = contentId;
            if (!isSameEpisode) {
                pointsAwardedRef.current = false;
            }
        }
    }, [messageId, srcUrl, episode, contentId]);

    // HLS.js Integration for Live Streams (.m3u8) & Telegram MP4
    useEffect(() => {
        if (!videoRef.current) return;
        
        // Limpa players anteriores
        if (hlsRef.current) {
            try {
                hlsRef.current.destroy();
            } catch (e) {}
            hlsRef.current = null;
        }
        if (mpegtsRef.current) {
            try {
                mpegtsRef.current.pause();
                mpegtsRef.current.unload();
                mpegtsRef.current.detachMediaElement();
                mpegtsRef.current.destroy();
            } catch (e) {}
            mpegtsRef.current = null;
        }
        if (videoRef.current) {
            try {
                videoRef.current.pause();
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            } catch (e) {}
        }

        if (srcUrl) {
            // === CHAVE SECRETA INVISÍVEL ===
            // Seta o cookie 'stk' ANTES de carregar o vídeo.
            // O cookie viaja junto com toda requisição ao /api/stream automaticamente,
            // mas NUNCA aparece na URL do src visível no DevTools!
            // A chave é montada em partes para dificultar busca no código-fonte.
            const _p1 = 'santo', _p2 = 'ryu15', _p3 = '1515';
            document.cookie = `stk=${_p1}${_p2}${_p3}; path=/api/stream; SameSite=Lax`;

            if (srcUrl.includes('.m3u8')) {
                // HLS NATTY
                if (Hls.isSupported()) {
                    const hls = new Hls();
                    hlsRef.current = hls;
                    hls.loadSource(srcUrl);
                    hls.attachMedia(videoRef.current);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        videoRef.current.play().catch(() => {});
                    });
                    
                    hls.on(Hls.Events.ERROR, function (event, data) {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log('fatal network error encountered, try to recover');
                                    hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log('fatal media error encountered, try to recover');
                                    hls.recoverMediaError();
                                    break;
                                default:
                                    hls.destroy();
                                    break;
                            }
                        }
                    });
                } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
                    videoRef.current.src = srcUrl;
                    const onMeta = () => {
                        if (savedSwitchTimeRef.current !== null) {
                            videoRef.current.currentTime = savedSwitchTimeRef.current;
                            savedSwitchTimeRef.current = null;
                        }
                        videoRef.current.play().catch(() => {});
                        videoRef.current.removeEventListener('loadedmetadata', onMeta);
                    };
                    videoRef.current.addEventListener('loadedmetadata', onMeta);
                }
            } else if (srcUrl.includes('.mp4')) {
                videoRef.current.src = srcUrl;
                const onMeta = () => {
                    if (savedSwitchTimeRef.current !== null) {
                        videoRef.current.currentTime = savedSwitchTimeRef.current;
                        savedSwitchTimeRef.current = null;
                    }
                    videoRef.current.play().catch(() => {});
                    videoRef.current.removeEventListener('loadedmetadata', onMeta);
                };
                videoRef.current.addEventListener('loadedmetadata', onMeta);
            } else {
                // MPEG-TS (Stream direto do provedor de IPTV/Live) via mpegts.js e Proxy do Backend
                if (mpegts.getFeatureList().mseLivePlayback) {
                    const proxyUrl = srcUrl.startsWith('/api/stream/proxy')
                        ? srcUrl 
                        : `/api/stream/proxy?url=${encodeURIComponent(srcUrl)}`;
                    mpegtsRef.current = mpegts.createPlayer({
                        type: 'mse',
                        isLive: true,
                        url: proxyUrl,
                        hasAudio: true,
                        hasVideo: true
                    }, {
                        enableStashBuffer: true,
                        stashInitialSize: 512, // Dá uma folga de buffer para não travar
                        liveBufferLatencyChasing: false, // DESLIGADO: evita que o player acelere o vídeo (1.5x/2x) tentando alcançar o live
                        liveSync: true,
                        autoCleanupSourceBuffer: true,
                        autoCleanupMaxBackwardDuration: 30,
                        autoCleanupMinBackwardDuration: 15
                    });
                    mpegtsRef.current.attachMediaElement(videoRef.current);
                    mpegtsRef.current.load();
                    mpegtsRef.current.play().catch(() => {});
                    if (videoRef.current) {
                        videoRef.current.playbackRate = 1.0;
                    }
                } else {
                    // Fallback para iOS (Player Nativo com link direto)
                    videoRef.current.src = srcUrl;
                    const onMeta = () => {
                        if (savedSwitchTimeRef.current !== null) {
                            videoRef.current.currentTime = savedSwitchTimeRef.current;
                            savedSwitchTimeRef.current = null;
                        }
                        videoRef.current.play().catch(() => {});
                        videoRef.current.removeEventListener('loadedmetadata', onMeta);
                    };
                    videoRef.current.addEventListener('loadedmetadata', onMeta);
                }
            }
        } else if (messageId) {
            // Telegram Video Injection via JS (Evita bug do Safari com a tag <source>)
            videoRef.current.src = `/api/stream/telegram/${messageId}`;
            videoRef.current.load();
            const onMeta = () => {
                if (savedSwitchTimeRef.current !== null) {
                    videoRef.current.currentTime = savedSwitchTimeRef.current;
                    savedSwitchTimeRef.current = null;
                }
                videoRef.current.play().catch(() => {});
                videoRef.current.removeEventListener('loadedmetadata', onMeta);
            };
            videoRef.current.addEventListener('loadedmetadata', onMeta);
        }

        return () => {
            if (hlsRef.current) {
                try {
                    hlsRef.current.destroy();
                } catch (e) {}
                hlsRef.current = null;
            }
            if (mpegtsRef.current) {
                try {
                    mpegtsRef.current.pause();
                    mpegtsRef.current.unload();
                    mpegtsRef.current.detachMediaElement();
                    mpegtsRef.current.destroy();
                } catch (e) {}
                mpegtsRef.current = null;
            }
        };
    }, [srcUrl, messageId]);

    // Oculta o menu de idiomas/qualidade se clicar fora ou esconder controles
    useEffect(() => {
        if (!showControls) {
            setShowLanguageMenu(false);
            setShowQualityMenu(false);
        }
    }, [showControls]);

    // Buscar o progresso (se tem resume_time salvo) - Somente para filmes e séries (nunca para canais ao vivo)
    useEffect(() => {
        if (!contentId || isLive) return;

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
    }, [contentId, season, episode, isLive]);

    // Pausar o vídeo se o popup de resume aparecer (para o autoplay não tocar o áudio por baixo)
    useEffect(() => {
        if (showResumePopup && videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    }, [showResumePopup]);

    // Timer para salvar o progresso a cada 10 segundos e ao sair (apenas para VOD, não para live)
    useEffect(() => {
        if (isLive) return;
        const saveProgress = () => {
            if (videoRef.current && videoRef.current.currentTime > 5 && !videoError) {
                const token = localStorage.getItem('cinegeek_token');
                const uuidVal = localStorage.getItem('cinegeek_uuid');
                const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                fetch('/api/recents/progress', {
                    method: 'PUT',
                    headers,
                    keepalive: true, // Garante que a requisição seja concluída mesmo se a página fechar
                    body: JSON.stringify({
                        content_id: String(contentId),
                        season: season ? parseInt(season) : null,
                        episode: episode ? parseInt(episode) : null,
                        resume_time: Math.floor(videoRef.current.currentTime)
                    })
                }).catch(err => console.error("Erro ping progresso:", err));

                // Sistema de Pontos: Concede 20 pontos ao assistir pelo menos 80% do conteúdo
                if (!pointsAwardedRef.current && token && duration > 0 && !isLive) {
                    const ratio = videoRef.current.currentTime / duration;
                    if (ratio >= 0.8) {
                        pointsAwardedRef.current = true;
                        fetch('/api/points/watch-reward', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify({
                                tmdb_id: String(contentId),
                                media_type: season ? 'tv' : 'movie',
                                season: season ? parseInt(season, 10) : null,
                                episode: episode ? parseInt(episode, 10) : null,
                                source: 'native_player'
                            })
                        }).then(r => r.json()).then(data => {
                            if (data && data.success) {
                                console.log('[Pontos] Recompensa de 80% concedida:', data.pointsAwarded);
                            }
                        }).catch(e => console.error('Erro ao conceder pontos:', e));
                    }
                }
            }
        };

        const interval = setInterval(() => {
            if (videoRef.current && !videoRef.current.paused) {
                saveProgress();
            }
        }, 10000); // Salva a cada 10s

        const handlePause = () => saveProgress();
        
        const videoElement = videoRef.current;
        if (videoElement) {
            videoElement.addEventListener('pause', handlePause);
        }

        return () => {
            clearInterval(interval);
            saveProgress(); // Salva exatamente no segundo em que saiu
            if (videoElement) {
                videoElement.removeEventListener('pause', handlePause);
            }
        };
    }, [contentId, season, episode, videoError]);

    // === HEARTBEAT DE CONCORRÊNCIA (1 TELA POR VEZ PARA USUÁRIOS FREE) ===
    useEffect(() => {
        if (isVip || isAdmin) return; // VIP e Admin têm telas simultâneas ilimitadas

        // Identificador único do conteúdo para não conflitar com episódios diferentes da mesma série
        const currentMediaId = String(
            (contentId && season && episode) ? `${contentId}_s${season}e${episode}` :
            (contentId ? `${contentId}` : (messageId || srcUrl || 'video'))
        );
        const mediaTitle = title || 'Conteúdo CineGeek';

        let isBlocked = false;

        const sendHeartbeat = async () => {
            try {
                const token = localStorage.getItem('cinegeek_token');
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;

                const res = await fetch('/api/stream/ping', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ mediaId: currentMediaId, title: mediaTitle })
                });

                if (res.status === 409) {
                    isBlocked = true;
                    if (videoRef.current) {
                        videoRef.current.pause();
                        setIsPlaying(false);
                    }
                    const data = await res.json().catch(() => ({}));
                    setConcurrencyError(data.message || 'Você já está assistindo a outro conteúdo. Seu plano permite 1 tela por vez.');
                } else if (res.ok) {
                    isBlocked = false;
                    setConcurrencyError(null);
                }
            } catch (e) {
                console.warn('Erro no heartbeat do player:', e);
            }
        };

        // Envia o primeiro ping imediatamente ao montar o player
        sendHeartbeat();

        // Heartbeat recorrente a cada 15 segundos
        const pingInterval = setInterval(() => {
            if (!isBlocked && videoRef.current && !videoRef.current.paused) {
                sendHeartbeat();
            }
        }, 15000);

        const handleBeforeUnload = () => {
            try {
                const token = localStorage.getItem('cinegeek_token');
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                fetch('/api/stream/close-session', {
                    method: 'POST',
                    headers,
                    keepalive: true
                }).catch(() => {});
            } catch (e) {}
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            clearInterval(pingInterval);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [contentId, season, episode, messageId, srcUrl, title, isVip, isAdmin]);

    // Auto-hide controls
    useEffect(() => {
        const handlePointerMove = (e) => {
            // No celular (touch), o tap simula um movimento que entra em conflito com o click. 
            // Só vamos considerar o "mover" se for com mouse de verdade.
            if (e && e.pointerType !== 'mouse') return;

            if (Date.now() - lastClickTime.current < 500) return;

            if (e && Math.abs(e.clientX - lastMousePos.current.x) < 5 && Math.abs(e.clientY - lastMousePos.current.y) < 5) {
                return; 
            }
            if (e) {
                lastMousePos.current = { x: e.clientX, y: e.clientY };
            }

            setShowControls(true);
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            if (isPlaying) {
                controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
            }
        };

        const handlePointerLeave = (e) => {
            // Ignora pointerleave se for touch (o dedo sair da tela nao deve esconder os controles instantaneamente)
            if (e && e.pointerType !== 'mouse') return;
            if (isPlaying) setShowControls(false);
        };

        const el = containerRef.current;
        if (el) {
            el.addEventListener('pointermove', handlePointerMove);
            el.addEventListener('pointerleave', handlePointerLeave);
        }
        return () => {
            if (el) {
                el.removeEventListener('pointermove', handlePointerMove);
                el.removeEventListener('pointerleave', handlePointerLeave);
            }
        };
    }, [isPlaying]);

    // Handle Fullscreen Change correctly (for ESC key or OS back button)
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
            setIsFullscreen(isFull);
            if (!isFull && screen.orientation && screen.orientation.unlock) {
                try { screen.orientation.unlock(); } catch (e) {}
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange); // Para Safari antigo
        
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        };
    }, []);

    const handleVideoClick = (e) => {
        e.stopPropagation();
        lastClickTime.current = Date.now();
        setShowQualityMenu(false);
        setShowVersionMenu(false);
        setShowLanguageMenu(false);
        setShowControls(prev => {
            const nextState = !prev;
            if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
            
            if (nextState && isPlaying) {
                controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
            }
            return nextState;
        });
    };

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

    const [switchLoadingMessage, setSwitchLoadingMessage] = useState(null);
    const switchTimeoutRef = useRef(null);

    const triggerSwitchLoading = (msg) => {
        if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current);
        setSwitchLoadingMessage(msg);
        // Fallback de segurança para esconder o aviso caso o evento de playing/loaded não dispare
        switchTimeoutRef.current = setTimeout(() => {
            setSwitchLoadingMessage(null);
        }, 5000);
    };

    const handleLanguageSelect = (e, id, type) => {
        e.stopPropagation();
        setShowLanguageMenu(false);
        setShowQualityMenu(false);
        setShowVersionMenu(false);
        if (onLanguageChange && id !== messageId) {
            onLanguageChange(id, type);
        }
    };

    const handleQualitySelect = (e, newQuality) => {
        e.stopPropagation();
        setShowQualityMenu(false);
        setShowLanguageMenu(false);
        setShowVersionMenu(false);
        if (onQualityChange && newQuality !== currentQuality) {
            triggerSwitchLoading(`Carregando qualidade ${newQuality}...`);
            onQualityChange(newQuality);
        }
    };

    const handleVersionSelect = (e, versionItem) => {
        e.stopPropagation();
        setShowVersionMenu(false);
        setShowQualityMenu(false);
        setShowLanguageMenu(false);
        if (onVersionChange) {
            const vLabel = versionItem?.displayIndex ? `V${versionItem.displayIndex}` : 'nova versão';
            triggerSwitchLoading(`Carregando ${vLabel}...`);
            onVersionChange(versionItem);
        }
    };

    const toggleMute = () => {
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const toggleFullscreen = async () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            try {
                if (containerRef.current.requestFullscreen) {
                    await containerRef.current.requestFullscreen();
                } else if (containerRef.current.webkitRequestFullscreen) {
                    await containerRef.current.webkitRequestFullscreen();
                } else if (videoRef.current.webkitEnterFullscreen) {
                    // Fallback nativo do iOS para iPhones (só permite tela cheia no elemento de vídeo)
                    videoRef.current.webkitEnterFullscreen();
                }
                
                // Tenta forçar a orientação para paisagem (útil para celulares)
                if (screen.orientation && screen.orientation.lock) {
                    await screen.orientation.lock('landscape').catch(e => console.warn("Orientação não suportada ou bloqueada", e));
                }
            } catch (err) {
                console.error(`Erro ao ativar tela cheia: ${err.message}`);
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    };

    const togglePip = async () => {
        if (!videoRef.current) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (document.pictureInPictureEnabled) {
                await videoRef.current.requestPictureInPicture();
            }
        } catch (err) {
            console.error(`Erro ao ativar PiP: ${err.message}`);
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

    const skipTime = (seconds) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = Math.min(Math.max(videoRef.current.currentTime + seconds, 0), duration);
        setCurrentTime(videoRef.current.currentTime);
    };

    return (
        <div ref={containerRef} className={`custom-player-container ${showControls ? '' : 'hide-controls'}`} style={{ flex: 1, width: '100%', height: '100%', minHeight: '100%', position: 'relative', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', cursor: showControls ? 'default' : 'none' }}>
            <video
                ref={videoRef}
                autoPlay
                style={{ width: '100%', height: '100%', objectFit: zoomMode, zIndex: 0, display: videoError ? 'none' : 'block' }}
                playsInline
                webkit-playsinline="true"
                preload="auto"
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
                onPlay={() => {
                    setIsPlaying(true);
                    setSwitchLoadingMessage(null);
                }}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => setCurrentTime(videoRef.current.currentTime)}
                onLoadedMetadata={() => setDuration(videoRef.current.duration)}
                onDurationChange={() => {
                    if (videoRef.current && isFinite(videoRef.current.duration)) {
                        setDuration(videoRef.current.duration);
                    }
                }}
                onLoadedData={() => {
                    if (videoRef.current && isFinite(videoRef.current.duration)) {
                        setDuration(videoRef.current.duration);
                    }
                    // Se o buffer do novo vídeo já estiver pronto, tira a mensagem de troca
                    setSwitchLoadingMessage(null);
                }}
                onWaiting={() => setIsBuffering(true)}
                onPlaying={() => {
                    setIsBuffering(false);
                    setSwitchLoadingMessage(null);
                }}
                onError={(e) => {
                    const err = e.target.error;
                    if (err && err.code === 4) {
                        setVideoError(true);
                        setSwitchLoadingMessage(null);
                    }
                }}
            >
            </video>

            {/* Click Catcher Overlay - Garante que 100% da tela registre os cliques, até fora do video */}
            <div 
                onClick={handleVideoClick} 
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, cursor: showControls ? 'pointer' : 'none', WebkitTapHighlightColor: 'transparent' }} 
            />

            {/* Switch Quality / Version Loading Overlay */}
            {switchLoadingMessage && !isLoadingEpisode && !videoError && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', zIndex: 25, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backdropFilter: 'blur(6px)', pointerEvents: 'none' }}>
                    <Loader size={48} className="spin-anim" style={{ color: '#00ff88', marginBottom: '1rem' }} />
                    <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.2rem', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{switchLoadingMessage}</span>
                </div>
            )}

            {/* Error Message */}
            {videoError && !isLoadingEpisode && !isVip && (
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

            {/* Aviso de Limite de Telas Simultâneas (Opção A) */}
            {concurrencyError && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.92)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 9999,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '2rem', textAlign: 'center'
                }}>
                    <div style={{
                        background: '#13131a',
                        padding: '2.5rem 2rem',
                        borderRadius: '20px',
                        border: '1px solid #ff4444',
                        maxWidth: '460px',
                        width: '90%',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
                    }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: 'rgba(255, 68, 68, 0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 1.2rem auto',
                            color: '#ff4444'
                        }}>
                            <AlertTriangle size={36} />
                        </div>
                        <h3 style={{ color: '#fff', marginBottom: '0.8rem', fontSize: '1.4rem', fontWeight: 'bold' }}>
                            Você já está assistindo
                        </h3>
                        <p style={{ color: '#bbb', lineHeight: '1.6', fontSize: '0.95rem', marginBottom: '1.8rem' }}>
                            {concurrencyError}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                            <a
                                href="/vip"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    background: '#00ff88',
                                    color: '#000',
                                    fontWeight: 'bold',
                                    padding: '0.9rem',
                                    borderRadius: '12px',
                                    textDecoration: 'none',
                                    fontSize: '0.95rem',
                                    display: 'block'
                                }}
                            >
                                ✨ Fazer Upgrade para VIP (Telas Ilimitadas)
                            </a>
                            <button
                                onClick={() => {
                                    setConcurrencyError(null);
                                    if (videoRef.current) {
                                        videoRef.current.play().catch(() => {});
                                    }
                                }}
                                style={{
                                    background: 'transparent',
                                    color: '#888',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    padding: '0.5rem'
                                }}
                            >
                                Tentar assistir aqui mesmo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Is Loading Episode Overlay */}
            {isLoadingEpisode && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', backdropFilter: 'blur(5px)' }}>
                    <Loader size={48} className="spin-anim" style={{ color: '#00ff88', marginBottom: '1rem' }} />
                    <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '1.2rem' }}>Carregando próximo episódio...</span>
                </div>
            )}

            {/* Skip Backward Button */}
            {!isLive && showControls && !videoError && !showResumePopup && !isLoadingEpisode && (
                <div onClick={(e) => { e.stopPropagation(); skipTime(-10); }} style={{
                    position: 'absolute', top: '50%', left: '15%', transform: 'translateY(-50%)',
                    zIndex: 2, cursor: 'pointer', background: 'transparent',
                    color: '#fff',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    textShadow: '0 2px 5px rgba(0,0,0,0.8)'
                }}>
                    <RotateCcw size={isFullscreen ? 32 : 24} />
                    <span style={{ fontSize: isFullscreen ? '0.8rem' : '0.7rem', marginTop: '4px', fontWeight: 'bold' }}>-10s</span>
                </div>
            )}

            {/* Center Play/Pause Button */}
            {(showControls || !isPlaying) && !isBuffering && !showResumePopup && !videoError && !isLoadingEpisode && (
                <div onClick={(e) => { e.stopPropagation(); togglePlay(); }} style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    zIndex: 10, cursor: 'pointer', background: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'transform 0.2s',
                    filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.6))'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)'}
                >
                    {isPlaying ? <Pause size={isFullscreen ? 48 : 32} color="#00ff88" /> : <Play size={isFullscreen ? 48 : 32} color="#00ff88" fill="#00ff88" style={{ marginLeft: '8px' }} />}
                </div>
            )}

            {/* Skip Forward Button */}
            {!isLive && showControls && !videoError && !showResumePopup && !isLoadingEpisode && (
                <div onClick={(e) => { e.stopPropagation(); skipTime(10); }} style={{
                    position: 'absolute', top: '50%', right: '15%', transform: 'translateY(-50%)',
                    zIndex: 2, cursor: 'pointer', background: 'transparent',
                    color: '#fff',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    textShadow: '0 2px 5px rgba(0,0,0,0.8)'
                }}>
                    <RotateCw size={isFullscreen ? 32 : 24} />
                    <span style={{ fontSize: isFullscreen ? '0.8rem' : '0.7rem', marginTop: '4px', fontWeight: 'bold' }}>+10s</span>
                </div>
            )}

            {/* Buffering Indicator */}
            {isBuffering && !isLoadingEpisode && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3, pointerEvents: 'none' }}>
                    <Loader size={64} color="#00ff88" className="spin-anim" />
                </div>
            )}

            {/* Next Episode Floating Button */}
            {onNextEpisode && duration > 0 && (duration - currentTime) <= 90 && !showResumePopup && !videoError && !isLoadingEpisode && (
                <div 
                    onClick={(e) => { e.stopPropagation(); onNextEpisode(); }}
                    className={`next-ep-btn ${isFullscreen ? 'fullscreen' : 'windowed'}`}
                    style={{
                        position: 'absolute', bottom: isFullscreen ? '90px' : '60px', right: '20px', zIndex: 10,
                        background: 'rgba(0, 255, 136, 0.95)', color: '#000',
                        padding: isFullscreen ? '12px 24px' : '6px 12px', borderRadius: '30px', cursor: 'pointer',
                        fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
                        boxShadow: '0 4px 15px rgba(0, 255, 136, 0.3)',
                        transition: '0.2s', fontSize: isFullscreen ? '1rem' : '0.75rem',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.background = '#00ff88'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(0, 255, 136, 0.95)'; }}
                >
                    Próximo Episódio ⏭
                </div>
            )}

            {/* Resume Popup */}
            {showResumePopup && !isLoadingEpisode && (
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
            {isAdmin && showDebug && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    zIndex: 50,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: '#00ff00',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    padding: '10px',
                    borderRadius: '5px',
                    width: '350px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    pointerEvents: 'none',
                    border: '1px solid #333'
                }}>
                    <div style={{ borderBottom: '1px solid #444', marginBottom: '5px', paddingBottom: '3px', fontWeight: 'bold' }}>
                        DEBUG DO PLAYER (ADMIN)
                    </div>
                    {debugLogs.length === 0 ? 'Aguardando eventos...' : debugLogs.map((log, i) => (
                        <div key={i}>{log}</div>
                    ))}
                </div>
            )}

        {/* Player Controls Overlay */}
        <div className="player-controls-overlay" style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2rem 1rem 1rem 1rem',
                background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                opacity: showControls || !isPlaying ? 1 : 0,
                pointerEvents: showControls || !isPlaying ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
                display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 5
            }}>
                {/* Timeline (Oculta se for Transmissão Ao Vivo) */}
                {!isLive && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minHeight: '24px' }}>
                        <span style={{ color: '#fff', fontSize: '0.85rem', width: '50px', textAlign: 'right' }}>{formatTime(currentTime)}</span>
                        <input 
                            type="range" 
                            min={0} max={duration > 0 && isFinite(duration) ? duration : 100} value={currentTime}
                            onChange={handleProgress}
                            style={{ flex: 1, accentColor: '#00ff88', height: '4px', cursor: 'pointer' }}
                        />
                        <span style={{ color: '#888', fontSize: '0.85rem', width: '50px' }}>{duration > 0 && isFinite(duration) ? formatTime(duration) : '00:00'}</span>
                    </div>
                )}

                {/* Bottom Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        
                        {/* Volume Control */}
                        <div className="volume-container" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); toggleMute(); }}>
                                {isMuted || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}
                            </button>
                            <input
                                type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                                onClick={(e) => e.stopPropagation()}
                                onChange={handleVolumeChange}
                                className="volume-slider"
                                style={{ width: '80px', accentColor: '#00ff88', height: '4px', cursor: 'pointer' }}
                            />
                        </div>

                        {/* Badge AO VIVO */}
                        {isLive && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '4px', background: 'rgba(255, 0, 50, 0.2)', border: '1px solid rgba(255, 0, 50, 0.4)' }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff0033', display: 'inline-block', boxShadow: '0 0 6px #ff0033' }}></span>
                                <span style={{ color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.5px' }}>AO VIVO</span>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        
                        {/* Language Selector */}
                        {languageOptions && (languageOptions.dub || languageOptions.leg) && (
                            <div style={{ position: 'relative' }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }} title="Idiomas" onClick={(e) => { e.stopPropagation(); setShowLanguageMenu(!showLanguageMenu); }}>
                                    <Headphones size={24} color={showLanguageMenu ? '#00ff88' : '#fff'} />
                                </button>
                                
                                {showLanguageMenu && (
                                    <div style={{
                                        position: 'absolute', bottom: '100%', right: '0',
                                        marginBottom: '15px', background: 'rgba(20,20,20,0.95)',
                                        borderRadius: '8px', padding: '10px', minWidth: '150px',
                                        border: '1px solid #333', display: 'flex', flexDirection: 'column',
                                        gap: '5px', backdropFilter: 'blur(10px)', zIndex: 100
                                    }}>
                                        <div style={{ color: '#aaa', fontSize: '0.8rem', padding: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Áudio</div>
                                        {languageOptions.dub && (
                                            <button 
                                                onClick={(e) => handleLanguageSelect(e, languageOptions.dub, 'dub')}
                                                style={{
                                                    padding: '8px 12px', background: messageId === languageOptions.dub ? '#00ff88' : 'transparent',
                                                    color: messageId === languageOptions.dub ? '#000' : '#fff',
                                                    border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold'
                                                }}
                                            >
                                                Dublado
                                            </button>
                                        )}
                                        {languageOptions.leg && (
                                            <button 
                                                onClick={(e) => handleLanguageSelect(e, languageOptions.leg, 'leg')}
                                                style={{
                                                    padding: '8px 12px', background: messageId === languageOptions.leg ? '#00ff88' : 'transparent',
                                                    color: messageId === languageOptions.leg ? '#000' : '#fff',
                                                    border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold'
                                                }}
                                            >
                                                Legendado
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Quality Selector (Sempre visível) */}
                        <div style={{ position: 'relative' }}>
                            <button 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }} 
                                title="Qualidade de Reprodução" 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setShowQualityMenu(!showQualityMenu); 
                                    setShowVersionMenu(false);
                                    setShowLanguageMenu(false); 
                                }}
                            >
                                <Settings size={22} color={showQualityMenu ? '#00ff88' : '#fff'} />
                                <span style={{ color: showQualityMenu ? '#00ff88' : '#fff', marginLeft: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                    {liveOptions ? (liveOptions.currentQuality || 'SD') : (currentQuality || 'HD')}
                                </span>
                            </button>
                            
                            {showQualityMenu && (
                                <div style={{
                                    position: 'absolute', bottom: '100%', right: '0',
                                    marginBottom: '15px', background: 'rgba(20,20,20,0.95)',
                                    borderRadius: '8px', padding: '10px', minWidth: '120px',
                                    border: '1px solid #333', display: 'flex', flexDirection: 'column',
                                    gap: '5px', backdropFilter: 'blur(10px)', zIndex: 100
                                }}>
                                    <div style={{ color: '#aaa', fontSize: '0.8rem', padding: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>Qualidade</div>
                                    {liveOptions && liveOptions.qualities && liveOptions.qualities.length > 0 ? (
                                        liveOptions.qualities.map((q) => (
                                            <button 
                                                key={q}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowQualityMenu(false);
                                                    if (liveOptions.onQualitySelect) liveOptions.onQualitySelect(q);
                                                }}
                                                style={{
                                                    padding: '8px 12px', background: (liveOptions.currentQuality || currentQuality) === q ? '#00ff88' : 'transparent',
                                                    color: (liveOptions.currentQuality || currentQuality) === q ? '#000' : '#fff',
                                                    border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold'
                                                }}
                                            >
                                                {q}
                                            </button>
                                        ))
                                    ) : videoQualities && Object.keys(videoQualities).length > 0 ? (
                                        Object.keys(videoQualities).map((q) => (
                                            <button 
                                                key={q}
                                                onClick={(e) => handleQualitySelect(e, q)}
                                                style={{
                                                    padding: '8px 12px', background: currentQuality === q ? '#00ff88' : 'transparent',
                                                    color: currentQuality === q ? '#000' : '#fff',
                                                    border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold'
                                                }}
                                            >
                                                {q}
                                            </button>
                                        ))
                                    ) : (
                                        <button 
                                            onClick={(e) => handleQualitySelect(e, currentQuality || 'Auto')}
                                            style={{
                                                padding: '8px 12px', background: '#00ff88',
                                                color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold'
                                            }}
                                        >
                                            {currentQuality || 'Auto'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Version Selector (Sempre visível ao lado de Qualidade) */}
                        <div style={{ position: 'relative' }}>
                            <button 
                                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }} 
                                title={liveOptions ? "Opções do Canal" : "Versão do Arquivo"} 
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setShowVersionMenu(!showVersionMenu); 
                                    setShowQualityMenu(false);
                                    setShowLanguageMenu(false); 
                                }}
                            >
                                <Layers size={22} color={showVersionMenu ? '#00ff88' : '#fff'} />
                                <span style={{ color: showVersionMenu ? '#00ff88' : '#fff', marginLeft: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                    {liveOptions ? (liveOptions.currentLabel || 'Opção') : (currentVersion ? `V${currentVersion}` : 'Versão')}
                                </span>
                            </button>
                            
                            {showVersionMenu && (
                                <div style={{
                                    position: 'absolute', bottom: '100%', right: '0',
                                    marginBottom: '15px', background: 'rgba(20,20,20,0.95)',
                                    borderRadius: '8px', padding: '10px', minWidth: '200px', maxWidth: '300px',
                                    border: '1px solid #333', display: 'flex', flexDirection: 'column',
                                    gap: '5px', backdropFilter: 'blur(10px)', zIndex: 100,
                                    maxHeight: '260px', overflowY: 'auto'
                                }}>
                                    <div style={{ color: '#aaa', fontSize: '0.8rem', padding: '5px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        {liveOptions ? "Opções / Listas do Canal" : "Versão"}
                                    </div>
                                    {liveOptions && liveOptions.channels && liveOptions.channels.length > 0 ? (
                                        liveOptions.channels.map((ch, idx) => {
                                            const isSelected = String(ch.id) === String(liveOptions.currentChannelId);
                                            const badgeColor = ch.vip_badge?.includes('3') ? '#a855f7' : ch.vip_badge?.includes('2') ? '#00ff88' : '#ffd700';
                                            return (
                                                <button 
                                                    key={ch.id || idx}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowVersionMenu(false);
                                                        if (liveOptions.onChannelSelect) liveOptions.onChannelSelect(ch);
                                                    }}
                                                    style={{
                                                        padding: '8px 10px', 
                                                        background: isSelected ? 'rgba(0, 255, 136, 0.2)' : 'transparent',
                                                        color: isSelected ? '#00ff88' : '#fff',
                                                        border: isSelected ? '1px solid #00ff88' : 'none',
                                                        borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold',
                                                        fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px'
                                                    }}
                                                >
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {ch.displayOptionName || ch.name}
                                                    </span>
                                                    <span style={{ fontSize: '10px', background: badgeColor, color: '#000', padding: '2px 5px', borderRadius: '3px', fontWeight: 'bold', flexShrink: 0 }}>
                                                        {ch.vip_badge || 'VIP'}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    ) : (() => {
                                        const currentGroup = videoQualities && videoQualities[currentQuality];
                                        const versionsList = [];
                                        if (currentGroup) {
                                            if (currentGroup.allDub && currentGroup.allDub.length > 0) {
                                                currentGroup.allDub.forEach((item, idx) => {
                                                    versionsList.push({ ...item, langType: 'dub', displayIndex: idx + 1 });
                                                });
                                            } else if (currentGroup.dub) {
                                                versionsList.push({ ...(typeof currentGroup.dub === 'object' ? currentGroup.dub : { id: currentGroup.dub }), langType: 'dub', displayIndex: 1 });
                                            }

                                            if (currentGroup.allLeg && currentGroup.allLeg.length > 0) {
                                                currentGroup.allLeg.forEach((item, idx) => {
                                                    versionsList.push({ ...item, langType: 'leg', displayIndex: idx + 1 });
                                                });
                                            } else if (currentGroup.leg) {
                                                versionsList.push({ ...(typeof currentGroup.leg === 'object' ? currentGroup.leg : { id: currentGroup.leg }), langType: 'leg', displayIndex: 1 });
                                            }
                                        }

                                        if (versionsList.length === 0) {
                                            return (
                                                <button 
                                                    style={{
                                                        padding: '8px 12px', background: '#00ff88',
                                                        color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold'
                                                    }}
                                                >
                                                    Versão 1 (Padrão)
                                                </button>
                                            );
                                        }

                                        return versionsList.map((ver, idx) => {
                                            const isSelected = messageId === ver.id;
                                            const label = `Versão ${idx + 1} (${ver.langType === 'leg' ? 'Leg' : 'Dub'})`;
                                            return (
                                                <button 
                                                    key={`${ver.id}-${idx}`}
                                                    onClick={(e) => handleVersionSelect(e, ver)}
                                                    style={{
                                                        padding: '8px 12px', 
                                                        background: isSelected ? '#00ff88' : 'transparent',
                                                        color: isSelected ? '#000' : '#fff',
                                                        border: 'none', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold',
                                                        fontSize: '0.85rem', whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    {label}
                                                </button>
                                            );
                                        });
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* PiP & Fullscreen Buttons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {(isCastAvailable || isAirPlayAvailable) && (
                                <button onClick={handleCastClick} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} title="Transmitir para TV">
                                    <Cast size={22} />
                                </button>
                            )}
                            {isAdmin && (
                                <button className="control-btn tool-btn" onClick={(e) => { e.stopPropagation(); setShowDebug(!showDebug); }} title="Debug Admin" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                                    <AlertTriangle size={20} />
                                </button>
                            )}
                            <button onClick={toggleZoom} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} title={zoomMode === 'contain' ? "Zoom (Cortar Bordas)" : (zoomMode === 'cover' ? "Esticar (Preencher Tela)" : "Ajustar à Tela (Padrão)")}>
                                <Crop size={22} color={zoomMode === 'contain' ? '#fff' : (zoomMode === 'cover' ? '#00ff88' : '#00ccff')} />
                            </button>
                            <button onClick={togglePip} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} title="Minimizar (PiP)">
                                <PictureInPicture size={22} />
                            </button>
                            <button onClick={toggleFullscreen} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                                {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

                <style>{`
                .spin-anim { animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
