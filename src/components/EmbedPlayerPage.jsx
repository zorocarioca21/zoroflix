import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import CustomVideoPlayer from './CustomVideoPlayer';
import AntiDevTools from './AntiDevTools';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function EmbedPlayerPage() {
    const { type: paramType, id: rawId, season, episode } = useParams(); 
    const type = paramType || (season && episode ? 'serie' : 'filme');

    const [tmdbId, setTmdbId] = useState(rawId);
    const [telegramMessageId, setTelegramMessageId] = useState(null);
    const [languageOptions, setLanguageOptions] = useState(null);
    const [currentQuality, setCurrentQuality] = useState('Normal');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [isValidEmbed, setIsValidEmbed] = useState(false);
    const [isVipKey, setIsVipKey] = useState(false);
    const [checkingKey, setCheckingKey] = useState(true);

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
                if (!searchName) {
                    setError(true);
                    setLoading(false);
                    return;
                }
                
                setTitle(searchName);
                
                // 2. Busca no nosso banco via Sync Queue (usando a mesma lógica do PlayerPage)
                // Para simplificar no Embed, fazemos uma query direta via /api/sync/queue
                let searchQuery = searchName;
                if (type === 'serie' && season && episode) {
                    const s = String(season).padStart(2, '0');
                    const e = String(episode).padStart(2, '0');
                    searchQuery = `${searchName} S${s} E${e}`;
                }

                const res = await fetch(`/api/embed/search?q=${encodeURIComponent(searchQuery)}`, {
                    headers: { 'Content-Type': 'application/json' }
                });

                if (res.ok) {
                    const queueData = await res.json();
                    if (queueData && queueData.message_id) {
                        setTelegramMessageId(queueData.message_id);
                        setIsValidEmbed(true);
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
            <CustomVideoPlayer 
                messageId={telegramMessageId}
                title={type === 'serie' ? `${title} T${season}E${episode}` : title}
                contentId={rawId}
                mediaType={type === 'filme' ? 'movie' : 'tv'}
                season={season}
                episode={episode}
                onNextEpisode={() => {
                    // Se a série tem próximo ep, nós redirecionamos a rota embed para lá
                    if (type === 'serie') {
                        const nextEp = parseInt(episode) + 1;
                        window.location.href = `/embed/serie/${rawId}/${season}/${nextEp}${apikey ? `?apikey=${apikey}` : ''}`;
                    }
                }}
            />
        </div>
    );
}
