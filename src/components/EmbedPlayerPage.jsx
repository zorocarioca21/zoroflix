import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CustomVideoPlayer from './CustomVideoPlayer';
import AntiDevTools from './AntiDevTools';
import AntiAdBlock from './AntiAdBlock';
import { checkTitleMatch, getBestMatches } from '../utils/titleMatch';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function EmbedPlayerPage() {
    const { type: paramType, id: rawId, season, episode } = useParams(); 
    const type = paramType || (season && episode ? 'serie' : 'filme');

    const [tmdbId, setTmdbId] = useState(rawId);
    const [telegramMessageId, setTelegramMessageId] = useState(null);
    const [streamUrl, setStreamUrl] = useState(null);
    const [languageOptions, setLanguageOptions] = useState(null);
    const [currentQuality, setCurrentQuality] = useState('Normal');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [isValidEmbed, setIsValidEmbed] = useState(false);
    const [isVipKey, setIsVipKey] = useState(false);
    const [checkingKey, setCheckingKey] = useState(true);

    const [showDebug, setShowDebug] = useState(false);
    const [debugMatches, setDebugMatches] = useState([]);

    const navigate = useNavigate();

    // Extrair API Key da URL
    const searchParams = new URLSearchParams(window.location.search);
    const apikey = searchParams.get('apikey') || searchParams.get('apiKey');

    // Validação da API Key
    useEffect(() => {
        const verifyKey = async () => {
            if (!apikey) {
                setCheckingKey(false);
                return;
            }
            try {
                const res = await fetch(`/api/embed/validate-key?key=${apikey}`);
                if (res.ok) setIsVipKey(true);
            } catch (err) {
                console.error("Erro validando key:", err);
            }
            setCheckingKey(false);
        };
        verifyKey();
    }, [apikey]);

    // Injeção de anúncios se for Free (não validou VIP)
    useEffect(() => {
        if (checkingKey) return;
        if (isVipKey) return; // VIPs não têm pop-under

        // Somente injeta o Adsterra Pop-under
        const script = document.createElement('script');
        script.src = "//pl30899842.effectivecpmnetwork.com/d9/5e/5e/d95e5e5709de2783f6993047886330c8.js";
        script.async = true;
        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, [checkingKey, isVipKey]);

    // Busca de título TMDB e Sync Telegram
    useEffect(() => {
        const fetchInfo = async () => {
            try {
                // 1. Pega nome oficial do TMDB para facilitar busca
                const mediaType = type === 'filme' ? 'movie' : 'tv';
                const tmdbRes = await fetch(`${BASE_URL}/${mediaType}/${rawId}?api_key=${API_KEY}&language=pt-BR`);
                const tmdbData = await tmdbRes.json();
                
                let searchName = tmdbData.name || tmdbData.title;
                let originalName = tmdbData.original_name || tmdbData.original_title;
                let releaseYear = tmdbData.release_date ? tmdbData.release_date.split('-')[0] : (tmdbData.first_air_date ? tmdbData.first_air_date.split('-')[0] : null);
                let baseName = searchName ? searchName.split(':')[0] : null;

                if (!searchName) {
                    setError(true);
                    setLoading(false);
                    return;
                }
                
                setTitle(searchName);
                
                const res = await fetch(`/api/embed/search?q=${encodeURIComponent(searchName)}`, {
                    headers: { 'Content-Type': 'application/json' }
                });

                if (res.ok) {
                    const data = await res.json();
                    
                    let foundMsgId = null;
                    let foundLangOpts = null;
                    const evaluatedItems = [];

                    if (data?.items?.length > 0) {
                        const validItems = data.items.filter(i => {
                            if (i.status !== 'completed' || (!i.telegram_message_id && !i.stream_url)) return false;
                            
                            const isTitleMatch = checkTitleMatch(i.title, searchName, originalName, baseName, releaseYear, season);
                            let hasEp = true;

                            if (type === 'serie' && season && episode) {
                                const seasonRegex = /\b(?:S|T)(?:EMPORADA\s*)?0?(\d{1,2})\b/i;
                                const sMatch = i.title.match(seasonRegex);
                                if (sMatch) {
                                    const fileSeason = parseInt(sMatch[1]);
                                    if (fileSeason !== parseInt(season)) {
                                        hasEp = false;
                                    }
                                }

                                if (hasEp) {
                                    const s = String(season).padStart(2, '0');
                                    const e = String(episode).padStart(2, '0');
                                    const patterns = [
                                        `S${s}E${e}`, `S${s} E${e}`,
                                        `S${season}E${episode}`, `S${season} E${episode}`,
                                        `Episódio ${episode}`, `EP${e}`, `EP ${e}`, `E${e}`
                                    ];
                                    const upperTitle = i.title.toUpperCase();
                                    hasEp = patterns.some(p => upperTitle.includes(p.toUpperCase()));
                                }
                            }

                            const isValid = isTitleMatch && hasEp;
                            
                            evaluatedItems.push({
                                title: i.title,
                                isMatch: isValid,
                                reason: !isTitleMatch ? 'Title Match Failed' : (!hasEp ? 'Episode Match Failed' : 'Matched')
                            });

                            return isValid;
                        });

                        setDebugMatches(evaluatedItems);

                        const matches = getBestMatches(evaluatedItems, type === 'filme' ? releaseYear : null);
                    
                        if (matches) {
                            setLanguageOptions(matches);
                            const qualityOrder = ['FHD', 'Normal', '4K', 'TS'];
                            let selectedQuality = Object.keys(matches)[0];
                            for (let q of qualityOrder) {
                                if (matches[q]) {
                                    selectedQuality = q;
                                    break;
                                }
                            }
                            setCurrentQuality(selectedQuality);
                            
                            const defaultOpt = matches[selectedQuality].dub || matches[selectedQuality].leg;
                            
                            if (defaultOpt) {
                                setTelegramMessageId(defaultOpt.id || defaultOpt);
                                if (defaultOpt.stream_url) {
                                    setStreamUrl(defaultOpt.stream_url);
                                }
                                setIsValidEmbed(true);
                            } else {
                                setError(true);
                            }
                        } else {
                            setError(true);
                        }
                    } else {
                        setError(true);
                    }
                } else {
                    setError(true);
                }
            } catch (err) {
                console.error("Erro carregando embed:", err);
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchInfo();
    }, [rawId, type, season, episode]);

    // Bloqueia teclado para inspecionar caso não confie no AntiDevTools global
    useEffect(() => {
        const preventKeys = (e) => {
            if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) || (e.ctrlKey && e.keyCode === 85)) {
                e.preventDefault();
                return false;
            }
        };
        document.addEventListener('keydown', preventKeys);
        return () => document.removeEventListener('keydown', preventKeys);
    }, []);

    if (loading) {
        return (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', zIndex: 9999 }}>
                <div className="loader"></div>
            </div>
        );
    }

    if (error || !isValidEmbed) {
        return (
            <div onContextMenu={(e) => e.preventDefault()} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#ff4444', fontFamily: 'Inter, sans-serif', zIndex: 9999 }}>
                <AntiDevTools />
                <h2>O vídeo ainda não está disponível ou não foi encontrado.</h2>
            </div>
        );
    }

    return (
        <div onContextMenu={(e) => e.preventDefault()} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', background: '#000', zIndex: 9999 }}>
            <AntiDevTools />
            {!isVipKey && <AntiAdBlock />}
            <CustomVideoPlayer 
                messageId={telegramMessageId}
                srcUrl={streamUrl}
                title={type === 'serie' ? `${title} T${season}E${episode}` : title}
                contentId={rawId}
                mediaType={type === 'filme' ? 'movie' : 'tv'}
                season={season}
                episode={episode}
                languageOptions={languageOptions ? languageOptions[currentQuality] : null}
                onLanguageChange={(id, type, stream) => {
                    setTelegramMessageId(id);
                    if (stream) setStreamUrl(stream);
                }}
                videoQualities={languageOptions}
                currentQuality={currentQuality}
                onQualityChange={(q, isDub) => {
                    setCurrentQuality(q);
                    if (languageOptions && languageOptions[q]) {
                        const opt = isDub ? languageOptions[q].dub || languageOptions[q].leg : languageOptions[q].leg || languageOptions[q].dub;
                        if (opt) {
                            setTelegramMessageId(opt.id || opt);
                            if (opt.stream_url) setStreamUrl(opt.stream_url);
                        }
                    }
                }}
                onNextEpisode={() => {
                    if (type === 'serie') {
                        const nextEp = parseInt(episode) + 1;
                        window.location.href = `/embed/serie/${rawId}/${season}/${nextEp}${apikey ? `?apikey=${apikey}` : ''}`;
                    }
                }}
            />

            {/* Painel de Debug temporário */}
            {showDebug && debugMatches.length > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    width: '400px',
                    maxHeight: '80vh',
                    background: 'rgba(0, 0, 0, 0.8)',
                    color: '#fff',
                    border: '1px solid #444',
                    borderRadius: '8px',
                    padding: '10px',
                    overflowY: 'auto',
                    zIndex: 999999,
                    fontFamily: 'monospace',
                    fontSize: '12px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid #555', paddingBottom: '5px' }}>
                        <h3 style={{ margin: 0, color: '#00e5ff' }}>🛠️ Debug: Busca de Título</h3>
                        <button onClick={() => setShowDebug(false)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <strong>TMDB Buscado:</strong> {title}<br/>
                        <strong>Resultados Analisados:</strong> {debugMatches.length}
                    </div>
                    {debugMatches.map((item, idx) => (
                        <div key={idx} style={{ 
                            marginBottom: '8px', 
                            padding: '6px', 
                            background: item.isMatch ? 'rgba(0, 255, 0, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                            borderLeft: `4px solid ${item.isMatch ? '#00e5ff' : '#666'}`,
                            borderRadius: '4px'
                        }}>
                            <div style={{ fontWeight: 'bold', color: item.isMatch ? '#00e5ff' : '#ccc' }}>{item.title}</div>
                            <div style={{ fontSize: '11px', color: item.isMatch ? '#aaa' : '#ff4444' }}>
                                Status: {item.reason}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
