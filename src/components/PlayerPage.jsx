import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChevronLeft, ChevronRight, List, ArrowLeft, Check, Download, Loader, Mic, Subtitles } from 'lucide-react';
import CommentSection from './CommentSection';
import { fetchWithProxy } from '../utils/api';
import CustomVideoPlayer from './CustomVideoPlayer';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function PlayerPage() {
    const { id: rawId, season, episode, canalId } = useParams();
    const [id, setId] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { user, loading } = useAuth();
    const state = location.state || {};

    const [episodes, setEpisodes] = useState([]);
    const [showList, setShowList] = useState(false);
    const [configs, setConfigs] = useState({});
    const [ready, setReady] = useState(false);
    const hasTracked = useRef(false);
    const [resolvedChannel, setResolvedChannel] = useState(null);
    const [seriesDetail, setSeriesDetail] = useState(null);
    const [showNextSeasonModal, setShowNextSeasonModal] = useState(false);
    const [activeSidebarSeason, setActiveSidebarSeason] = useState(null);
    const [isWatched, setIsWatched] = useState(false);
    const [telegramMessageId, setTelegramMessageId] = useState(null);
    const [languageOptions, setLanguageOptions] = useState(null); // Agora armazenará TODAS as qualidades: { Normal: { dub, leg }, FHD: { dub, leg } }
    const [currentQuality, setCurrentQuality] = useState('Normal'); // Qualidade selecionada atualmente
    const [showLanguageSelector, setShowLanguageSelector] = useState(false);
    const [downloadSelector, setDownloadSelector] = useState(false);
    const prevLanguageType = useRef(null); // 'dub' or 'leg'

    // Handler customizado para mudar messageId e guardar a preferência
    const handleSetMessageId = (id, type) => {
        setTelegramMessageId(id);
        prevLanguageType.current = type;
        localStorage.setItem('cinegeek_preferred_language', type);
    };

    const [isCheckingTelegram, setIsCheckingTelegram] = useState(() => {
        if (canalId) return false;
        return !!(user && (user.role === 'admin' || user.role === 'vip'));
    });

    // Resolvendo as informações do Canal (Nome e Logo_url)
    useEffect(() => {
        if (!canalId) return;

        // Se for canal customizado (Esportes rde-...)
        if (String(canalId).startsWith('rde-')) {
            setResolvedChannel({
                name: state.title || 'Evento Esportivo Ao Vivo',
                logo_url: '/cinegeek-icon.png'
            });
            return;
        }

        // Busca na lista oficial de canais do SuperFlix
        const url = 'https://superflixapi.fit/lista?category=canais&format=json';
        fetchWithProxy(url)
            .then(res => {
                if (res && res.data) {
                    const found = res.data.find(ch => String(ch.id) === String(canalId));
                    if (found) {
                        setResolvedChannel({
                            name: found.name,
                            logo_url: found.placeholder_url || found.logo_url || '/cinegeek-icon.png'
                        });
                    } else {
                        setResolvedChannel({
                            name: state.title || `Canal ${canalId}`,
                            logo_url: '/cinegeek-icon.png'
                        });
                    }
                }
            })
            .catch(() => {
                setResolvedChannel({
                    name: state.title || `Canal ${canalId}`,
                    logo_url: '/cinegeek-icon.png'
                });
            });
    }, [canalId, state]);

    // Resolvendo o ID do TMDB a partir do slug
    useEffect(() => {
        if (canalId) return;
        if (!rawId || loading) return;

        // Se o ID foi passado no state (novo padrão com slug)
        if (location.state?.id) {
            setId(location.state.id);
            return;
        }

        // Caso seja acesso direto pelo link (ex: usuário enviou link no whatsapp)
        // Busca o ID no TMDB pelo título no slug
        const isMovie = location.pathname.includes('/filme/');
        const type = isMovie ? 'movie' : 'tv';
        const query = rawId.replace(/-/g, ' ');
        const searchUrl = `${BASE_URL}/search/${type}?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}`;

        fetch(searchUrl)
            .then(r => r.json())
            .then(data => {
                const bestMatch = data.results?.[0];
                if (bestMatch) {
                    setId(bestMatch.id);
                } else if (/^\d+$/.test(rawId)) {
                    // Fallback para URLs antigas que usavam TMDB ID direto na URL
                    setId(rawId);
                }
            })
            .catch(() => {
                if (/^\d+$/.test(rawId)) setId(rawId);
            });
    }, [rawId, canalId, loading, location.state]);

    useEffect(() => {
        if (canalId) {
            if (resolvedChannel) {
                document.title = `${resolvedChannel.name} - CineGeek`;
            } else if (state.title) {
                document.title = `${state.title} - CineGeek`;
            }
        } else if (state.title) {
            document.title = `${state.title} - CineGeek`;
        }
    }, [state.title, canalId, resolvedChannel]);

    useEffect(() => {
        fetch('/api/admin/config/all')
            .then(r => r.json())
            .then(data => {
                setConfigs(data);
                setReady(true);
            });
    }, []);

    useEffect(() => {
        if (loading || !ready) return;
        if (!configs.ads_enabled || !configs.ads_popunder) return;
        if (user?.role && user.role !== 'free') return;
        if (!telegramMessageId) return; // Só carrega se estiver no player nativo

        const script = document.createElement('script');
        script.src = "https://pl30899842.effectivecpmnetwork.com/d9/5e/5e/d95e5e5709de2783f6993047886330c8.js";
        script.async = true;
        document.body.appendChild(script);
        return () => { try { document.body.removeChild(script); } catch (e) { } };
    }, [user, loading, configs, ready, telegramMessageId]);

    useEffect(() => {
        if (season) {
            setActiveSidebarSeason(parseInt(season));
        }
    }, [season]);

    useEffect(() => {
        if (activeSidebarSeason && id) {
            fetch(`${BASE_URL}/tv/${id}/season/${activeSidebarSeason}?api_key=${API_KEY}&language=pt-BR`)
                .then(r => r.json())
                .then(data => setEpisodes(data.episodes || []))
                .catch(() => { });
        }
    }, [id, activeSidebarSeason]);

    useEffect(() => {
        if (id && !canalId) {
            const isMovie = location.pathname.includes('/filme/');
            const type = isMovie ? 'movie' : 'tv';
            fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=pt-BR`)
                .then(r => r.json())
                .then(data => {
                    setSeriesDetail(data);
                    
                    const title = data.title || data.name;
                    if (title) {
                        fetch('/api/sync/auto-prioritize', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title, media_type: type })
                        }).catch(() => {});
                    }
                })
                .catch(() => { });
        }
    }, [id, canalId, location.pathname]);

    const lastSearched = useRef('');

    // Checa se existe no Telegram (Para Player Nativo VIP/Admin ou se Forçado p/ Todos)
    useEffect(() => {
        if (canalId) return;
        if (!id) return; // Evita buscar com id null (causando double-fetch)
        
        const isForced = configs.force_custom_player_all;
        if (!isForced && (!user || (user.role !== 'admin' && user.role !== 'vip'))) return;

        let seriesName = '';
        if (state.title) {
            // Apenas corta no traço se for série (para remover o nome do episódio). Filmes podem ter traço no nome oficial.
            seriesName = season ? state.title.split(' - ')[0].trim() : state.title.trim();
        } else if (seriesDetail && (seriesDetail.title || seriesDetail.name)) {
            seriesName = (seriesDetail.title || seriesDetail.name).trim();
        }

        let originalSeriesName = '';
        if (seriesDetail && (seriesDetail.original_title || seriesDetail.original_name)) {
            originalSeriesName = (seriesDetail.original_title || seriesDetail.original_name).trim();
        }

        let baseSeriesName = seriesName.includes(':') ? seriesName.split(':')[0].trim() : '';

        if (!seriesName) return;
        
        const searchKey = `${id}-${season}-${episode}-${seriesName}`;
        if (lastSearched.current === searchKey) return;
        lastSearched.current = searchKey;

        const token = localStorage.getItem('cinegeek_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const getBestMatches = (items, releaseYear = null) => {
            const validItems = items.filter(i => i.status === 'completed' && i.telegram_message_id);
            if (validItems.length === 0) return null;

            let targetItems = validItems;
            if (releaseYear) {
                const withYear = validItems.filter(i => i.title && i.title.includes(releaseYear));
                if (withYear.length > 0) targetItems = withYear;
            }

            const versions = {};
            
            for (const i of targetItems) {
                if (!i.title) continue; // Pular se não tiver título
                
                const isLeg = /leg|legendado/i.test(i.title);
                const titleUpper = i.title.toUpperCase();
                
                let version = 'Normal';
                if (titleUpper.includes('FHD') || titleUpper.includes('1080P') || titleUpper.includes('1080')) version = 'FHD';
                else if (titleUpper.includes('4K') || titleUpper.includes('2160P')) version = '4K';
                else if (titleUpper.includes('TS') || titleUpper.includes('CAMRIP') || titleUpper.includes('CAM RIP')) version = 'TS';
                
                if (!versions[version]) versions[version] = { dub: null, leg: null };
                
                if (isLeg && !versions[version].leg) versions[version].leg = i.telegram_message_id;
                if (!isLeg && !versions[version].dub) versions[version].dub = i.telegram_message_id;
            }

            // Remover chaves vazias
            for (const key in versions) {
                if (!versions[key].dub && !versions[key].leg) {
                    delete versions[key];
                }
            }
            
            return Object.keys(versions).length > 0 ? versions : null;
        };

        const handleMatches = (matches) => {
            if (!matches) {
                setTelegramMessageId(null);
                return;
            }
            setLanguageOptions(matches);
            
            const prefLang = localStorage.getItem('cinegeek_preferred_language') || 'dub';
            const autoLang = location.state?.autoPlayLanguage; // Passed when navigating to Next Episode
            
            // Choose best default quality (FHD > Normal > 4K > TS)
            const qualityOrder = ['FHD', 'Normal', '4K', 'TS'];
            let selectedQuality = Object.keys(matches)[0];
            for (let q of qualityOrder) {
                if (matches[q]) {
                    selectedQuality = q;
                    break;
                }
            }
            setCurrentQuality(selectedQuality);
            const currentOpts = matches[selectedQuality];
            
            // Se veio do 'Próximo Episódio' e tem o idioma preferido disponível, pula a tela de escolha
            if (autoLang && currentOpts[autoLang]) {
                handleSetMessageId(currentOpts[autoLang], autoLang);
                setShowLanguageSelector(false);
            } 
            // Se veio do 'Próximo Episódio' mas o idioma preferido não existe, toca o que tiver
            else if (autoLang && (currentOpts.dub || currentOpts.leg)) {
                const fallback = currentOpts.dub ? 'dub' : 'leg';
                handleSetMessageId(currentOpts[fallback], fallback);
                setShowLanguageSelector(false);
            } 
            // Caso padrão: Primeira vez abrindo o filme/série (Sempre mostra a tela se não for Next Episode)
            else {
                // Se já tinha um messageId tocando (troca via menu interno do player)
                if (telegramMessageId && prefLang && currentOpts[prefLang]) {
                    handleSetMessageId(currentOpts[prefLang], prefLang);
                    setShowLanguageSelector(false);
                } else {
                    // Novo acesso: mostra a tela de escolha
                    setShowLanguageSelector(true);
                    setTelegramMessageId(null);
                }
            }
        };

        const findEpisode = async () => {
            const checkTitleMatch = (itemTitle, targetSeriesName, originalName, baseName, targetYear) => {
                // Limpeza de possíveis sujeiras do M3U que vieram no título
                let cleanItemTitle = itemTitle;
                if (cleanItemTitle.includes('tvg-logo=') || cleanItemTitle.includes('group-title=')) {
                    const idx = cleanItemTitle.indexOf('",');
                    if (idx !== -1) {
                        cleanItemTitle = cleanItemTitle.substring(idx + 2).trim();
                    } else {
                        const parts = cleanItemTitle.split(',');
                        cleanItemTitle = parts[parts.length - 1].trim();
                    }
                }

                const seasonEpRegex = /\s*(S\d{1,2}\s*E\d{1,2}|S\d{1,2}E\d{1,2}|EPISÓDIO\s*\d+|EP\s*\d+|E\d{1,2}|TEMPORADA\s*\d+)/i;
                const match = cleanItemTitle.match(seasonEpRegex);
                
                let extractedName = cleanItemTitle;
                if (match && match.index > 0) {
                    extractedName = cleanItemTitle.substring(0, match.index).trim();
                } else {
                    const tagsRegex = /\s*(DUBLADO|LEGENDADO|LEG|FHD|4K|1080P|720P|2160P|TS|CAMRIP)/i;
                    const tagMatch = extractedName.match(tagsRegex);
                    if (tagMatch && tagMatch.index > 0) {
                        extractedName = extractedName.substring(0, tagMatch.index).trim();
                    }
                }
                const itemYearMatch = cleanItemTitle.match(/[\(\[](\d{4})[\)\]]/);
                const itemYear = itemYearMatch ? parseInt(itemYearMatch[1]) : null;
                
                extractedName = extractedName.replace(/[\(\[]\d{4}[\)\]]/g, '').trim();
                extractedName = extractedName.replace(/[-:]$/g, '').trim();
                
                let targetClean = targetSeriesName.replace(/[\(\[]\d{4}[\)\]]/g, '').trim();
                targetClean = targetClean.replace(/[-:]$/g, '').trim();
                
                let originalClean = originalName ? originalName.replace(/[\(\[]\d{4}[\)\]]/g, '').trim().replace(/[-:]$/g, '').trim() : null;
                
                if (extractedName.toLowerCase() === targetClean.toLowerCase()) return true;
                if (originalClean && extractedName.toLowerCase() === originalClean.toLowerCase()) return true;
                
                // Fuzzy match ignorando pontuações
                const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
                const normExtracted = normalize(extractedName);
                const normTarget = normalize(targetClean);
                const normOriginal = originalClean ? normalize(originalClean) : null;
                
                if (normExtracted === normTarget) return true;
                if (normOriginal && normExtracted === normOriginal) return true;
                
                // Se o ano bater exato, flexibiliza o limite de similaridade
                let isYearMatch = false;
                if (itemYear && targetYear) {
                    if (itemYear === parseInt(targetYear)) {
                        isYearMatch = true;
                    }
                }

                // Similaridade
                const calculateSimilarity = (s1, s2) => {
                    let longer = s1.length > s2.length ? s1 : s2;
                    let shorter = s1.length > s2.length ? s2 : s1;
                    if (longer.length === 0) return 1.0;
                    const costs = [];
                    for (let i = 0; i <= longer.length; i++) {
                        let lastValue = i;
                        for (let j = 0; j <= shorter.length; j++) {
                            if (i === 0) {
                                costs[j] = j;
                            } else if (j > 0) {
                                let newValue = costs[j - 1];
                                if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                                }
                                costs[j - 1] = lastValue;
                                lastValue = newValue;
                            }
                        }
                        if (i > 0) costs[shorter.length] = lastValue;
                    }
                    return (longer.length - costs[shorter.length]) / parseFloat(longer.length);
                };
                
                const threshold = isYearMatch ? 0.6 : 0.8;
                if (calculateSimilarity(normExtracted, normTarget) >= threshold) return true;
                if (normOriginal && calculateSimilarity(normExtracted, normOriginal) >= threshold) return true;
                
                if (extractedName.toLowerCase().startsWith(targetClean.toLowerCase())) {
                    const remaining = extractedName.substring(targetClean.length).trim();
                    if (remaining === '' || remaining === ':' || remaining === '-' || remaining.startsWith('-')) return true;
                }
                
                if (originalClean && extractedName.toLowerCase().startsWith(originalClean.toLowerCase())) {
                    const remaining = extractedName.substring(originalClean.length).trim();
                    if (remaining === '' || remaining === ':' || remaining === '-' || remaining.startsWith('-')) return true;
                }
                
                let baseClean = baseName ? baseName.replace(/[\(\[]\d{4}[\)\]]/g, '').trim().replace(/[-:]$/g, '').trim() : null;
                if (baseClean && extractedName.toLowerCase().startsWith(baseClean.toLowerCase())) {
                    if (season) return true;
                }
                
                return false;
            };

            try {
                if (season && episode) {
                    const s = String(season).padStart(2, '0');
                    const e = String(episode).padStart(2, '0');
                    const specificSearch = `${seriesName} S${s} E${e}`;

                    let res = await fetch(`/api/sync/queue?search=${encodeURIComponent(specificSearch)}&limit=20`, { headers });
                    let data = await res.json();
                    
                    if ((!data?.items || data.items.length === 0) && originalSeriesName) {
                        const origSearch = `${originalSeriesName} S${s} E${e}`;
                        res = await fetch(`/api/sync/queue?search=${encodeURIComponent(origSearch)}&limit=20`, { headers });
                        data = await res.json();
                    }
                    
                    if ((!data?.items || data.items.length === 0) && baseSeriesName) {
                        const baseSearch = `${baseSeriesName} S${s} E${e}`;
                        res = await fetch(`/api/sync/queue?search=${encodeURIComponent(baseSearch)}&limit=20`, { headers });
                        data = await res.json();
                    }

                    if (data?.items?.length > 0) {
                        const validSpecificItems = data.items.filter(i => {
                            if (i.status !== 'completed' || !i.telegram_message_id) return false;
                            if (!checkTitleMatch(i.title, seriesName, originalSeriesName, baseSeriesName)) return false;
                            return true;
                        });

                        if (validSpecificItems.length > 0) {
                            const matches = getBestMatches(validSpecificItems);
                            if (matches) {
                                handleMatches(matches);
                                return;
                            }
                        }
                    }

                    let res2 = await fetch(`/api/sync/queue?search=${encodeURIComponent(seriesName)}&limit=500`, { headers });
                    let data2 = await res2.json();
                    
                    if ((!data2?.items || data2.items.length === 0) && originalSeriesName) {
                        res2 = await fetch(`/api/sync/queue?search=${encodeURIComponent(originalSeriesName)}&limit=500`, { headers });
                        data2 = await res2.json();
                    }
                    
                    if ((!data2?.items || data2.items.length === 0) && baseSeriesName) {
                        res2 = await fetch(`/api/sync/queue?search=${encodeURIComponent(baseSeriesName)}&limit=500`, { headers });
                        data2 = await res2.json();
                    }

                    if (data2?.items?.length > 0) {
                        const patterns = [
                            `S${s}E${e}`, `S${s} E${e}`,
                            `S${season}E${episode}`, `S${season} E${episode}`,
                            `Episódio ${episode}`, `EP${e}`, `EP ${e}`, `E${e}`,
                        ];

                        const validItems = data2.items.filter(i => {
                            if (i.status !== 'completed' || !i.telegram_message_id) return false;
                            if (!checkTitleMatch(i.title, seriesName, originalSeriesName, baseSeriesName)) return false;

                            const upperTitle = i.title.toUpperCase();
                            const hasEp = patterns.some(p => upperTitle.includes(p.toUpperCase()));
                            if (!hasEp) return false;

                            const seasonMatch = upperTitle.match(/S(\d{1,2})/);
                            if (seasonMatch && parseInt(seasonMatch[1]) !== parseInt(season)) return false;

                            const seasonWordMatch = upperTitle.match(/TEMPORADA\s*(\d{1,2})/);
                            if (seasonWordMatch && parseInt(seasonWordMatch[1]) !== parseInt(season)) return false;

                            return true;
                        });

                        if (validItems.length > 0) {
                            const releaseYear = seriesDetail?.first_air_date ? seriesDetail.first_air_date.split('-')[0] : null;
                            const matches = getBestMatches(validItems, releaseYear);
                            if (matches) {
                                handleMatches(matches);
                                return;
                            }
                        }
                    }
                } else {
                    let res = await fetch(`/api/sync/queue?search=${encodeURIComponent(seriesName)}&limit=-1`, { headers });
                    let data = await res.json();
                    
                    if ((!data?.items || data.items.length === 0) && originalSeriesName) {
                        res = await fetch(`/api/sync/queue?search=${encodeURIComponent(originalSeriesName)}&limit=-1`, { headers });
                        data = await res.json();
                    }
                    
                    if ((!data?.items || data.items.length === 0) && baseSeriesName) {
                        res = await fetch(`/api/sync/queue?search=${encodeURIComponent(baseSeriesName)}&limit=-1`, { headers });
                        data = await res.json();
                    }

                    if (data?.items?.length > 0) {
                        const releaseYear = seriesDetail?.release_date ? seriesDetail.release_date.split('-')[0] : null;
                        const validItems = data.items.filter(i => {
                            if (i.status !== 'completed' || !i.telegram_message_id) return false;
                            if (!checkTitleMatch(i.title, seriesName, originalSeriesName, baseSeriesName, releaseYear)) return false;
                            return true;
                        });

                        if (validItems.length > 0) {
                            const matches = getBestMatches(validItems, releaseYear);
                            if (matches) {
                                handleMatches(matches);
                                return;
                            }
                        }
                    }
                }
                setTelegramMessageId(null);
            } catch {
                setTelegramMessageId(null);
            } finally {
                setIsCheckingTelegram(false);
            }
        };

        setIsCheckingTelegram(true);
        findEpisode();
    }, [id, season, episode, state.title, canalId, user, seriesDetail, configs]);

    useEffect(() => {
        hasTracked.current = false;
        if (canalId && !resolvedChannel) return;

        const timer = setTimeout(async () => {
            if (hasTracked.current) return;
            hasTracked.current = true;

            const token = localStorage.getItem('cinegeek_token');
            const uuid = localStorage.getItem('cinegeek_uuid');
            const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuid || '' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const mediaType = canalId ? 'canal' : (season ? 'tv' : 'movie');
            const trackId = canalId ? canalId : id;

            let targetTitle = canalId ? resolvedChannel?.name : (seriesDetail?.name || state?.title || null);
            let targetPoster = canalId ? resolvedChannel?.logo_url : (seriesDetail?.poster_path || state?.poster_path || null);

            if ((!targetTitle || targetTitle === 'Carregando...') && id && !canalId) {
                try {
                    const tmdbType = season ? 'tv' : 'movie';
                    const tmdbRes = await fetch(`${BASE_URL}/${tmdbType}/${id}?api_key=${API_KEY}&language=pt-BR`);
                    if (tmdbRes.ok) {
                        const tmdbData = await tmdbRes.json();
                        targetTitle = tmdbData.name || tmdbData.title || targetTitle;
                        if (!targetPoster) targetPoster = tmdbData.poster_path;
                    }
                } catch (e) { }
            }

            if (!targetTitle || targetTitle === 'Carregando...') {
                targetTitle = canalId ? `Canal ${canalId}` : (season ? `Série #${id}` : `Filme #${id}`);
            }

            try {
                await fetch('/api/recents', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        content_id: trackId,
                        media_type: mediaType,
                        title: targetTitle,
                        poster_path: targetPoster,
                        season: season ? parseInt(season) : null,
                        episode: episode ? parseInt(episode) : null,
                    })
                });
            } catch (e) { }
        }, 30000);

        return () => clearTimeout(timer);
    }, [id, season, episode, canalId, resolvedChannel]);

    useEffect(() => {
        if (!id || !season || !episode || canalId) return;

        let durationMin = 40;
        const currentEpObj = episodes.find(e => e.episode_number === parseInt(episode));
        if (currentEpObj && currentEpObj.runtime) {
            durationMin = currentEpObj.runtime;
        } else if (seriesDetail && seriesDetail.episode_run_time && seriesDetail.episode_run_time.length > 0) {
            durationMin = seriesDetail.episode_run_time[0];
        }

        const eightyPercentMs = Math.round(durationMin * 60 * 1000 * 0.8);

        const checkTimer = setTimeout(async () => {
            const token = localStorage.getItem('cinegeek_token');
            const uuidVal = localStorage.getItem('cinegeek_uuid');
            const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            try {
                await fetch('/api/recents/watched-episodes', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        content_id: String(id),
                        season: parseInt(season),
                        episode: parseInt(episode)
                    })
                });
            } catch (e) { }
        }, eightyPercentMs);

        return () => clearTimeout(checkTimer);
    }, [id, season, episode, canalId, episodes, seriesDetail]);

    useEffect(() => {
        if (!id || !season || !episode || canalId) {
            setIsWatched(false);
            return;
        }

        const token = localStorage.getItem('cinegeek_token');
        const uuidVal = localStorage.getItem('cinegeek_uuid');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (uuidVal) headers['x-device-uuid'] = uuidVal;

        fetch(`/api/recents/watched-episodes/${id}`, { headers })
            .then(r => r.json())
            .then(data => {
                const found = data.some(we => we.season === parseInt(season) && we.episode === parseInt(episode));
                setIsWatched(found);
            })
            .catch(() => { });
    }, [id, season, episode, canalId]);

    const handleToggleWatched = async () => {
        const token = localStorage.getItem('cinegeek_token');
        const uuidVal = localStorage.getItem('cinegeek_uuid');
        const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            if (isWatched) {
                const resp = await fetch(`/api/recents/watched-episodes/${id}/${season}/${episode}`, {
                    method: 'DELETE',
                    headers
                });
                if (resp.ok) setIsWatched(false);
            } else {
                const resp = await fetch('/api/recents/watched-episodes', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        content_id: String(id),
                        season: parseInt(season),
                        episode: parseInt(episode)
                    })
                });
                if (resp.ok) setIsWatched(true);
            }
        } catch (err) {
            console.error(err);
        }
    };

    let playerUrl = '';
    let title = canalId
        ? (resolvedChannel?.name || state.title || 'Carregando Canal...')
        : (state.title || 'Carregando...');

    if (canalId) {
        if (state.isVip) {
            playerUrl = state.embed_url;
        } else {
            playerUrl = (state.embed_url || `https://superflixapi.fit/canal/${canalId}`) + '#noEpList';
        }
    } else {
        const isMovie = location.pathname.includes('/filme/');
        const apiType = isMovie ? 'filme' : 'serie';
        if (season && episode) {
            playerUrl = `https://superflixapi.fit/${apiType}/${id}/${season}/${episode}#noEpList`;
        } else {
            playerUrl = `https://superflixapi.fit/${apiType}/${id}#noEpList`;
        }
    }

    const handleNext = () => {
        const nextEp = parseInt(episode) + 1;
        const exists = episodes.find(e => e.episode_number === nextEp);
        if (exists) {
            const autoLang = localStorage.getItem('cinegeek_preferred_language') || prevLanguageType.current || 'dub';
            navigate(`/serie/${rawId}/${season}/${nextEp}/player`, { state: { id, title: `${state.title?.split(' - ')[0]} - ${exists.name}`, poster_path: state.poster_path, autoPlayLanguage: autoLang } });
        } else {
            const nextSeasonNum = parseInt(season) + 1;
            const nextSeasonExists = seriesDetail?.seasons?.find(s => s.season_number === nextSeasonNum && s.episode_count > 0);
            if (nextSeasonExists) {
                setShowNextSeasonModal(true);
            }
        }
    };

    const handleConfirmNextSeason = () => {
        const nextSeasonNum = parseInt(season) + 1;
        setShowNextSeasonModal(false);
        const autoLang = localStorage.getItem('cinegeek_preferred_language') || prevLanguageType.current || 'dub';
        navigate(`/serie/${rawId}/${nextSeasonNum}/1/player`, {
            state: {
                id,
                title: `${state.title?.split(' - ')[0]} - Temporada ${nextSeasonNum}, Episódio 1`,
                poster_path: state.poster_path,
                autoPlayLanguage: autoLang
            }
        });
    };

    const handlePrev = () => {
        const prevEp = parseInt(episode) - 1;
        if (prevEp >= 1) {
            const exists = episodes.find(e => e.episode_number === prevEp);
            navigate(`/serie/${rawId}/${season}/${prevEp}/player`, { state: { id, title: `${state.title?.split(' - ')[0]} - ${exists?.name || `Episódio ${prevEp}`}`, poster_path: state.poster_path } });
        }
    };

    const handleGoBack = () => {
        if (canalId) navigate('/canais');
        else if (season) navigate(`/serie/${rawId}`, { state: { id } });
        else navigate(`/filme/${rawId}`, { state: { id } });
    }

    if (!canalId && !id) {
        return <div className="details-loading">Carregando Player...</div>;
    }

    return (
        <div className="player-page-container">
            <div className="player-view-layout">
                <div className="fullscreen-player-wrapper" style={{ position: 'relative' }}>
                    {(!telegramMessageId && isCheckingTelegram) ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#00ff88', flexDirection: 'column' }}>
                            <Loader size={48} className="spin-anim" style={{ marginBottom: '1rem' }} />
                            <span style={{ fontWeight: 'bold' }}>Carregando Player</span>
                        </div>
                    ) : (!telegramMessageId && showLanguageSelector) ? (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: '#fff', flexDirection: 'column' }}>
                            <h2 style={{ marginBottom: '2rem', fontSize: '1.5rem', color: '#00ff88' }}>Escolha o Idioma</h2>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                                {languageOptions && languageOptions[currentQuality]?.dub && (
                                    <button
                                        className="lang-btn"
                                        onClick={() => { handleSetMessageId(languageOptions[currentQuality].dub, 'dub'); setShowLanguageSelector(false); }}
                                    >
                                        <Mic size={24} /> Dublado
                                    </button>
                                )}
                                {languageOptions && languageOptions[currentQuality]?.leg && (
                                    <button
                                        className="lang-btn"
                                        onClick={() => { handleSetMessageId(languageOptions[currentQuality].leg, 'leg'); setShowLanguageSelector(false); }}
                                    >
                                        <Subtitles size={24} /> Legendado
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (telegramMessageId || state?.isVip) ? (
                        <CustomVideoPlayer
                            messageId={telegramMessageId}
                            srcUrl={state?.isVip ? playerUrl : null}
                            isVip={state?.isVip}
                            isLoadingEpisode={isCheckingTelegram}
                            languageOptions={languageOptions ? languageOptions[currentQuality] : null}
                            onLanguageChange={(id, type) => handleSetMessageId(id, type)}
                            videoQualities={languageOptions}
                            currentQuality={currentQuality}
                            onQualityChange={(newQuality) => setCurrentQuality(newQuality)}
                            contentId={id}
                            season={season}
                            episode={episode}
                            onNextEpisode={season && episode ? handleNext : null}
                        />
                    ) : (
                        <iframe src={playerUrl} allowFullScreen title="Zoroflix Player"></iframe>
                    )}
                </div>

                {showList && (
                    <div className="player-ep-sidebar">
                        {seriesDetail && seriesDetail.seasons && seriesDetail.seasons.length > 0 ? (
                            <div className="season-select-wrapper" style={{ margin: '0.2rem 0 1rem 0', width: '100%' }}>
                                <select
                                    value={activeSidebarSeason || season}
                                    onChange={(e) => {
                                        setActiveSidebarSeason(parseInt(e.target.value));
                                    }}
                                    style={{
                                        width: '100%',
                                        background: '#1c1c24',
                                        color: '#00ff88',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        padding: '0.6rem',
                                        fontSize: '0.95rem',
                                        fontWeight: '700',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {seriesDetail.seasons
                                        .filter(s => s.episode_count > 0)
                                        .map(s => (
                                            <option key={s.id} value={s.season_number} style={{ background: '#13131a', color: '#fff' }}>
                                                {s.name || `Temporada ${s.season_number}`} ({s.episode_count} eps)
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>
                        ) : (
                            <h4>Temporada {activeSidebarSeason || season}</h4>
                        )}
                        <div className="player-sidebar-list">
                            {episodes.map(ep => (
                                <div
                                    key={ep.id}
                                    className={`sidebar-ep-item ${parseInt(season) === parseInt(activeSidebarSeason || season) && parseInt(episode) === ep.episode_number ? 'active' : ''}`}
                                    onClick={() => {
                                        navigate(`/serie/${rawId}/${activeSidebarSeason || season}/${ep.episode_number}/player`, { state: { id, title: `${state.title?.split(' - ')[0]} - ${ep.name}`, poster_path: state.poster_path } });
                                        setShowList(false);
                                    }}
                                >
                                    <span className="ep-num">{ep.episode_number}</span>
                                    <span className="ep-name">{ep.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Info & Controls Area (Below Player) */}
            <div className="player-bottom-controls-area">
                <div className="player-info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
                    <div className="player-title-container">
                        <h1 className="player-title">{title}</h1>
                        {!canalId && season && episode && (
                            <h2 className="player-subtitle" style={{ color: '#d1d1d6', fontSize: '1.2rem', marginTop: '0.5rem', fontWeight: '500' }}>
                                Temporada {season} • Episódio {episode}
                            </h2>
                        )}
                    </div>
                    {!canalId && (
                        <div className="player-nav-group" style={{ width: '100%', justifyContent: 'flex-start', flexWrap: 'wrap', gap: '0.8rem', marginTop: '0.5rem' }}>
                            {season && (
                                <>
                                    <button className="nav-btn-modern" onClick={handlePrev} disabled={parseInt(episode) <= 1}><ChevronLeft size={20} /> Anterior</button>
                                    <button className="nav-btn-modern" onClick={() => setShowList(!showList)}><List size={20} /> Episódios</button>
                                    <button className="nav-btn-modern" onClick={handleNext}>Próximo <ChevronRight size={20} /></button>
                                    <button
                                        className={`nav-btn-modern toggle-watched-status-btn ${isWatched ? 'watched-active' : ''}`}
                                        onClick={handleToggleWatched}
                                        style={{
                                            borderColor: isWatched ? '#00ff88' : 'rgba(255, 255, 255, 0.1)',
                                            color: isWatched ? '#00ff88' : '#fff'
                                        }}
                                    >
                                        <Check size={20} style={{ color: isWatched ? '#00ff88' : '#fff' }} />
                                        {isWatched ? 'Desmarcar como Assistido' : 'Marcar como Assistido'}
                                    </button>
                                </>
                            )}
                            {(state?.isVip || user?.role === 'vip' || user?.role === 'admin') && (telegramMessageId || languageOptions) && (
                                <button 
                                    className="nav-btn-modern" 
                                    onClick={() => {
                                        let targetMsgId = telegramMessageId;
                                        
                                        if (!targetMsgId) {
                                            const opts = languageOptions && languageOptions[currentQuality];
                                            if (!opts) {
                                                window.alert('Nenhuma opção de vídeo encontrada.');
                                                return;
                                            }
                                            
                                            if (opts.dub && !opts.leg) {
                                                targetMsgId = opts.dub;
                                            } else if (!opts.dub && opts.leg) {
                                                targetMsgId = opts.leg;
                                            } else if (opts.dub && opts.leg) {
                                                setDownloadSelector(true);
                                                return;
                                            }
                                        }
                                        const cleanTitle = encodeURIComponent(title.split(' - ')[0].trim());
                                        window.location.href = `/api/stream/telegram/${targetMsgId}?download=true&title=${cleanTitle}`;
                                    }} 
                                    style={{ color: '#00ff88', borderColor: '#00ff88' }}
                                >
                                    <Download size={20} />
                                    Baixar
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="player-back-row">
                    <button className="btn-back-to-info" onClick={handleGoBack}>
                        <ArrowLeft size={18} /> {canalId ? 'VOLTAR PARA CANAIS' : 'VOLTAR PARA DETALHES'}
                    </button>
                </div>
            </div>

            <div className="player-comments-area">
                <CommentSection
                    contentId={id}
                    mediaType={canalId ? 'canal' : (season ? 'tv' : 'movie')}
                    episodeId={episode}
                />
            </div>

            {showNextSeasonModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(5px)'
                }}>
                    <div style={{
                        background: '#13131a',
                        border: '2px solid var(--primary, #00ff88)',
                        boxShadow: '0 0 25px rgba(0, 255, 136, 0.25)',
                        borderRadius: '16px',
                        width: '90%',
                        maxWidth: '450px',
                        padding: '2rem',
                        textAlign: 'center',
                        color: '#fff',
                        fontFamily: 'inherit'
                    }}>
                        <h3 style={{
                            fontSize: '1.4rem',
                            color: 'var(--primary, #00ff88)',
                            marginBottom: '1rem',
                            fontWeight: '700'
                        }}>Fim da Temporada!</h3>

                        <p style={{
                            fontSize: '0.95rem',
                            color: '#d1d1d6',
                            lineHeight: '1.6',
                            marginBottom: '2rem'
                        }}>
                            Você assistiu ao último episódio da <strong style={{ color: '#fff' }}>Temporada {season}</strong>. <br />
                            Deseja começar a assistir ao <strong style={{ color: '#fff' }}>Episódio 1 da Temporada {parseInt(season) + 1}</strong>?
                        </p>

                        <div style={{
                            display: 'flex',
                            gap: '1rem',
                            justifyContent: 'center'
                        }}>
                            <button
                                onClick={handleConfirmNextSeason}
                                style={{
                                    background: 'var(--primary, #00ff88)',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '30px',
                                    padding: '0.8rem 2rem',
                                    fontSize: '0.9rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 4px 10px rgba(0, 255, 136, 0.3)'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.transform = 'scale(1.05)';
                                    e.target.style.boxShadow = '0 6px 15px rgba(0, 255, 136, 0.5)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.transform = 'scale(1)';
                                    e.target.style.boxShadow = '0 4px 10px rgba(0, 255, 136, 0.3)';
                                }}
                            >
                                Sim, assistir
                            </button>

                            <button
                                onClick={() => setShowNextSeasonModal(false)}
                                style={{
                                    background: '#2c2c35',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '30px',
                                    padding: '0.8rem 2.2rem',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.target.style.transform = 'scale(1.05)'}
                                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                            >
                                Não
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Seleção de Download */}
            {downloadSelector && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 9999,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}>
                    <div style={{
                        background: '#13131a',
                        border: '1px solid #1a2f24',
                        borderRadius: '20px',
                        padding: '2rem',
                        width: '90%',
                        maxWidth: '400px',
                        textAlign: 'center'
                    }}>
                        <h3 style={{ color: '#fff', marginBottom: '1.5rem' }}>Qual versão deseja baixar?</h3>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button onClick={() => {
                                setDownloadSelector(false);
                                const cleanTitle = encodeURIComponent(title.split(' - ')[0].trim());
                                window.location.href = `/api/stream/telegram/${languageOptions[currentQuality].dub}?download=true&title=${cleanTitle}`;
                            }} style={{ background: '#00ff88', color: '#000', padding: '0.8rem 1.5rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Dublado</button>
                            
                            <button onClick={() => {
                                setDownloadSelector(false);
                                const cleanTitle = encodeURIComponent(title.split(' - ')[0].trim());
                                window.location.href = `/api/stream/telegram/${languageOptions[currentQuality].leg}?download=true&title=${cleanTitle}`;
                            }} style={{ background: '#00ff88', color: '#000', padding: '0.8rem 1.5rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Legendado</button>
                        </div>
                        <button onClick={() => setDownloadSelector(false)} style={{ marginTop: '1.5rem', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
}
