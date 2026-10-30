// src/components/WatchPartyPage.jsx
// Sala de Transmissão Sincronizada (Watch Party estilo Rave) integrada ao Zoroflix
// 100% livre de emojis na interface do sistema (apenas ícones vetoriais Lucide)
// Seletor de Emojis integrado exclusivamente no Chat
// Sincronização via WebSockets / Socket.io em tempo real

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { 
    Tv, Film, PlusCircle, ListVideo, Users, Share2, Settings, 
    Play, Pause, RotateCcw, Volume2, VolumeX, Maximize, Minimize,
    Crown, ShieldCheck, Shield, MicOff, MessageSquareOff, Lock,
    ChevronUp, ChevronDown, Trash2, Send, Smile, X, Search, Check,
    AlertCircle, LogOut, Loader, UserMinus, ShieldAlert, Sparkles, ArrowLeft
} from 'lucide-react';

const COMMON_EMOJIS = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','🥲','🥹','😊','😇','🙂','🙃','😉','😌',
    '😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸',
    '🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢',
    '😭','😮‍💨','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🫣',
    '🤔','🫡','🤫','🫠','🤐','😴','🥱','😵','😵‍💫','🤐','😷','🤒','🤕','🤢','🤮','🤧',
    '🍿','🥤','🎬','📺','🎉','🔥','💯','❤️','💔','✨','👏','🙌','👍','👎','👊','✌️'
];

export default function WatchPartyPage() {
    const { roomId: rawRoomId } = useParams();
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    // ID padrão da sala se não for fornecido na URL
    const roomId = rawRoomId || (user ? `sala-${user.nick ? user.nick.toLowerCase().replace(/[^a-z0-9]/g, '') : user.id}` : 'sala-principal');

    const [socket, setSocket] = useState(null);
    const [roomState, setRoomState] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);

    // Modais
    const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
    const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
    const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [participantsTab, setParticipantsTab] = useState('active'); // 'active' | 'history'

    // Busca do Catálogo
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [selectedMediaDetail, setSelectedMediaDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Chat
    const [chatInput, setChatInput] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const chatEndRef = useRef(null);

    // Player Ref e Estado Local
    const videoRef = useRef(null);
    const [isLocallyPaused, setIsLocallyPaused] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Ignora eventos de sync disparados por ações próprias para evitar loop
    const ignoreNextSyncRef = useRef(false);

    // 1. Conexão WebSocket com o Servidor
    useEffect(() => {
        if (authLoading) return;

        const newSocket = io({ path: '/socket.io' });

        newSocket.on('connect', () => {
            console.log('[WatchParty] Conectado ao servidor Socket.io:', newSocket.id);
            newSocket.emit('wp_join_room', {
                roomId,
                user: user ? { id: user.id, nick: user.nick, avatar: user.avatar, role: user.role } : null
            });
        });

        newSocket.on('wp_room_state', (state) => {
            setRoomState(state);
        });

        newSocket.on('wp_chat_message', (msg) => {
            setRoomState(prev => {
                if (!prev) return prev;
                // Evita duplicar mensagem se já constar
                if (prev.chatMessages?.some(m => m.id === msg.id)) return prev;
                return {
                    ...prev,
                    chatMessages: [...(prev.chatMessages || []), msg]
                };
            });
        });

        newSocket.on('wp_kicked', (data) => {
            alert(data.message || 'Você foi expulso da sala.');
            navigate('/');
        });

        newSocket.on('wp_error', (data) => {
            if (data.code === 'banned') {
                alert(data.message);
                navigate('/');
            } else {
                setErrorMsg(data.message);
                setTimeout(() => setErrorMsg(null), 4000);
            }
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [roomId, user, authLoading]);

    // Rola o chat para o final ao receber mensagem
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [roomState?.chatMessages]);

    // 2. Sincronização do Player de Vídeo
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !roomState?.playerState?.currentMedia) return;

        const targetTime = roomState.playerState.currentTime || 0;
        const targetPlaying = roomState.playerState.isPlaying;

        // Se a diferença de tempo for maior que 2 segundos, sincroniza o seek
        if (Math.abs(video.currentTime - targetTime) > 2) {
            video.currentTime = targetTime;
        }

        if (targetPlaying && video.paused) {
            video.play().catch(() => {
                // Navegadores bloqueiam autoplay sem interação prévia; mudo resolve
                video.muted = true;
                setIsMuted(true);
                video.play().catch(() => {});
            });
        } else if (!targetPlaying && !video.paused) {
            video.pause();
        }
    }, [roomState?.playerState]);

    // Permissões
    const canControl = roomState?.canControl || false;
    const isMutedInChat = roomState?.amIMuted || false;

    // Controles de Play/Pause emitidos para a sala (Apenas Criador e Subdonos)
    const handleTogglePlay = () => {
        if (!canControl || !socket) return;
        const video = videoRef.current;
        const currentTime = video ? video.currentTime : 0;
        const isPlaying = roomState?.playerState?.isPlaying;

        socket.emit('wp_player_sync', {
            action: isPlaying ? 'pause' : 'play',
            time: currentTime
        });
    };

    const handleSeek = (seconds) => {
        if (!canControl || !socket || !videoRef.current) return;
        const newTime = Math.max(0, videoRef.current.currentTime + seconds);
        socket.emit('wp_player_sync', {
            action: 'seek',
            time: newTime
        });
    };

    const handleTimelineChange = (e) => {
        if (!canControl || !socket) return;
        const newTime = parseFloat(e.target.value);
        socket.emit('wp_player_sync', {
            action: 'seek',
            time: newTime
        });
    };

    // Chat
    const handleSendMessage = (e) => {
        if (e) e.preventDefault();
        if (!chatInput.trim() || !socket || isMutedInChat) return;
        socket.emit('wp_send_chat', chatInput);
        setChatInput('');
        setShowEmojiPicker(false);
    };

    const handleAddEmoji = (emoji) => {
        setChatInput(prev => prev + emoji);
    };

    // Copiar Link da Sala para Convidar
    const handleCopyInvite = () => {
        const inviteUrl = `${window.location.origin}/sala/${roomId}`;
        navigator.clipboard.writeText(inviteUrl).then(() => {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 3000);
        });
    };

    // Busca do Catálogo para Adicionar à Fila
    const handleSearchCatalog = async (e) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim()) return;
        setSearching(true);
        setSelectedMediaDetail(null);
        try {
            const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setSearchResults(data.results || []);
        } catch (err) {
            console.error('Erro na busca:', err);
        } finally {
            setSearching(false);
        }
    };

    // Abre detalhes da mídia escolhida para selecionar áudio / episódio
    const handleSelectMediaForQueue = async (item) => {
        setDetailLoading(true);
        try {
            const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
            const res = await fetch(`/api/tmdb/${mediaType}/${item.id}`);
            const data = await res.json();
            setSelectedMediaDetail({
                ...data,
                media_type: mediaType
            });
        } catch (err) {
            console.error('Erro ao buscar detalhes da mídia:', err);
        } finally {
            setDetailLoading(false);
        }
    };

    // Adiciona o item selecionado à Fila da Watch Party
    const handleConfirmAddToQueue = (mediaPayload) => {
        if (!socket) return;
        socket.emit('wp_add_queue', mediaPayload);
        setIsCatalogModalOpen(false);
        setSelectedMediaDetail(null);
        setSearchQuery('');
        setSearchResults([]);
    };

    // Gerenciar Fila (Subir, Descer, Tocar agora, Remover)
    const handleQueueAction = (action, queueId) => {
        if (!canControl || !socket) return;
        socket.emit('wp_manage_queue', { action, queueId });
    };

    // Moderação: Promover Subdono, Mute, Kick
    const handleToggleSubowner = (targetUserId) => {
        if (!socket) return;
        socket.emit('wp_toggle_subowner', targetUserId);
    };

    const handleToggleMute = (targetUserId) => {
        if (!socket) return;
        socket.emit('wp_toggle_mute', targetUserId);
    };

    const handleKickUser = (targetUserId) => {
        if (!socket || !window.confirm('Tem certeza que deseja expulsar este participante da sala?')) return;
        socket.emit('wp_kick_user', targetUserId);
    };

    // Configurações
    const handleUpdateSetting = (key, value) => {
        if (!canControl || !socket) return;
        socket.emit('wp_update_settings', { [key]: value });
    };

    const currentMedia = roomState?.playerState?.currentMedia;

    return (
        <div style={{
            minHeight: '100vh',
            background: '#09090b',
            color: '#f4f4f5',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
            {/* Notificação de Erro Flutuante */}
            {errorMsg && (
                <div style={{
                    position: 'fixed',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#dc2626',
                    color: '#fff',
                    padding: '12px 24px',
                    borderRadius: '12px',
                    zIndex: 100000,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontWeight: '600',
                    fontSize: '0.9rem'
                }}>
                    <AlertCircle size={20} />
                    {errorMsg}
                </div>
            )}

            {/* BARRA SUPERIOR: Informações da Sala e Controles */}
            <header style={{
                background: 'rgba(18, 18, 23, 0.95)',
                borderBottom: '1px solid #27272a',
                padding: isMobile ? '0.6rem 0.8rem' : '0.8rem 1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.8rem',
                backdropFilter: 'blur(10px)',
                position: 'sticky',
                top: 0,
                zIndex: 100
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <button
                        onClick={() => navigate('/')}
                        style={{
                            background: '#27272a',
                            border: '1px solid #3f3f46',
                            color: '#e4e4e7',
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                        title="Voltar ao início"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: isMobile ? '36px' : '42px',
                        height: isMobile ? '36px' : '42px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                        color: '#fff',
                        flexShrink: 0
                    }}>
                        <Tv size={isMobile ? 20 : 24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h1 style={{ fontSize: isMobile ? '1rem' : '1.15rem', fontWeight: '700', margin: 0, letterSpacing: '-0.3px' }}>
                                Watch Party
                            </h1>
                            <span style={{
                                background: '#27272a',
                                color: '#a1a1aa',
                                fontSize: '0.7rem',
                                padding: '2px 6px',
                                borderRadius: '6px',
                                fontWeight: '600'
                            }}>
                                {roomId}
                            </span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#a1a1aa' }}>
                            Criador: <strong style={{ color: '#fff' }}>{roomState?.creatorNick || 'Iniciando...'}</strong>
                        </p>
                    </div>
                </div>

                {/* Barra de Ações da Sala (Ícones Vetoriais SVG) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
                    {/* 1. Escolher Filme/Série */}
                    <button
                        onClick={() => setIsCatalogModalOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#27272a',
                            color: '#fff',
                            border: '1px solid #3f3f46',
                            padding: isMobile ? '6px 10px' : '8px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: isMobile ? '0.75rem' : '0.85rem',
                            fontWeight: '600',
                            transition: 'all 0.2s',
                            flex: isMobile ? '1 1 auto' : 'none',
                            justifyContent: 'center'
                        }}
                        title="Escolher Filme ou Série do catálogo"
                    >
                        <PlusCircle size={16} style={{ color: '#ec4899' }} />
                        Escolher Filme/Série
                    </button>

                    {/* 2. Lista de Reprodução */}
                    <button
                        onClick={() => setIsQueueModalOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#27272a',
                            color: '#fff',
                            border: '1px solid #3f3f46',
                            padding: isMobile ? '6px 10px' : '8px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: isMobile ? '0.75rem' : '0.85rem',
                            fontWeight: '600',
                            flex: isMobile ? '1 1 auto' : 'none',
                            justifyContent: 'center'
                        }}
                        title="Lista de Próxima Reprodução"
                    >
                        <ListVideo size={16} style={{ color: '#38bdf8' }} />
                        Fila ({roomState?.queue?.length || 0})
                    </button>

                    {/* 3. Participantes */}
                    <button
                        onClick={() => setIsParticipantsModalOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#27272a',
                            color: '#fff',
                            border: '1px solid #3f3f46',
                            padding: isMobile ? '6px 10px' : '8px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: isMobile ? '0.75rem' : '0.85rem',
                            fontWeight: '600',
                            flex: isMobile ? '1 1 auto' : 'none',
                            justifyContent: 'center'
                        }}
                        title="Membros na sala e histórico"
                    >
                        <Users size={16} style={{ color: '#a855f7' }} />
                        ({roomState?.participantsCount || 1})
                    </button>

                    {/* 4. Convidar (Liberado para todos copiarem) */}
                    <button
                        onClick={handleCopyInvite}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: copySuccess ? '#059669' : '#ec4899',
                            color: '#fff',
                            border: 'none',
                            padding: isMobile ? '6px 12px' : '8px 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontSize: isMobile ? '0.75rem' : '0.85rem',
                            fontWeight: '700',
                            transition: 'all 0.2s',
                            flex: isMobile ? '1 1 auto' : 'none',
                            justifyContent: 'center'
                        }}
                        title="Copiar link para convidar amigos"
                    >
                        {copySuccess ? <Check size={16} /> : <Share2 size={16} />}
                        {copySuccess ? 'Copiado!' : 'Convidar'}
                    </button>

                    {/* 5. Configurações da Sala */}
                    <button
                        onClick={() => setIsSettingsModalOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: isMobile ? '32px' : '38px',
                            height: isMobile ? '32px' : '38px',
                            background: '#27272a',
                            color: '#e4e4e7',
                            border: '1px solid #3f3f46',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            flexShrink: 0
                        }}
                        title="Configurações da Sala"
                    >
                        <Settings size={16} />
                    </button>
                </div>
            </header>

            {/* ÁREA PRINCIPAL: NO CELULAR (PLAYER TOPO + CHAT BASE); NO PC (GRID LADO A LADO) */}
            <main style={{
                flex: 1,
                display: 'grid',
                gridTemplateColumns: isMobile ? '100%' : 'minmax(0, 1fr) 380px',
                gridTemplateRows: isMobile ? 'auto 1fr' : '1fr',
                gap: 0,
                height: isMobile ? 'auto' : 'calc(100vh - 67px)',
                minHeight: isMobile ? 'calc(100vh - 120px)' : 'auto',
                overflow: isMobile ? 'visible' : 'hidden'
            }}>
                {/* COLUNA ESQUERDA / SUPERIOR: PLAYER DE VÍDEO SINCRONIZADO */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#000',
                    borderRight: isMobile ? 'none' : '1px solid #27272a',
                    borderBottom: isMobile ? '2px solid #27272a' : 'none',
                    height: isMobile ? 'auto' : '100%',
                    position: isMobile ? 'sticky' : 'relative',
                    top: isMobile ? 0 : 'auto',
                    zIndex: isMobile ? 50 : 1
                }}>
                    {currentMedia ? (
                        <div style={{
                            flex: isMobile ? 'none' : 1,
                            position: 'relative',
                            background: '#000',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            aspectRatio: isMobile ? '16/9' : 'auto',
                            minHeight: isMobile ? '220px' : 'auto'
                        }}>
                            <video
                                ref={videoRef}
                                src={currentMedia.streamUrl}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    maxHeight: isMobile ? '45vh' : 'calc(100vh - 150px)',
                                    objectFit: 'contain',
                                    display: 'block'
                                }}
                                playsInline
                                webkit-playsinline="true"
                                controls={false}
                                onEnded={() => {
                                    if (canControl) {
                                        handleQueueAction('play_next', null);
                                    }
                                }}
                            />

                            {/* Aviso de Modo Somente Leitura para Membros */}
                            {!canControl && (
                                <div style={{
                                    position: 'absolute',
                                    top: '16px',
                                    left: '16px',
                                    background: 'rgba(0,0,0,0.75)',
                                    backdropFilter: 'blur(8px)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    padding: '6px 14px',
                                    borderRadius: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    fontSize: '0.75rem',
                                    color: '#a1a1aa'
                                }}>
                                    <Lock size={14} style={{ color: '#ec4899' }} />
                                    Sincronizado pelo Dono/Subdono
                                </div>
                            )}

                            {/* Badge do Título Atual */}
                            <div style={{
                                position: 'absolute',
                                top: '16px',
                                right: '16px',
                                background: 'rgba(0,0,0,0.75)',
                                backdropFilter: 'blur(8px)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                fontSize: '0.85rem',
                                color: '#fff',
                                fontWeight: '600'
                            }}>
                                <Film size={15} style={{ color: '#ec4899' }} />
                                {currentMedia.title}
                            </div>
                        </div>
                    ) : (
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '2rem',
                            textAlign: 'center',
                            color: '#71717a'
                        }}>
                            <div style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '50%',
                                background: 'rgba(236, 72, 153, 0.1)',
                                color: '#ec4899',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '1.5rem'
                            }}>
                                <Film size={40} />
                            </div>
                            <h2 style={{ color: '#f4f4f5', fontSize: '1.4rem', margin: '0 0 0.5rem 0' }}>
                                Nenhum filme ou série em reprodução
                            </h2>
                            <p style={{ maxWidth: '400px', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                Clique no botão abaixo para pesquisar e escolher o primeiro conteúdo da sala.
                            </p>
                            <button
                                onClick={() => setIsCatalogModalOpen(true)}
                                style={{
                                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '12px 28px',
                                    borderRadius: '12px',
                                    fontWeight: '700',
                                    fontSize: '0.95rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 20px rgba(236, 72, 153, 0.3)'
                                }}
                            >
                                <PlusCircle size={20} />
                                Escolher Conteúdo
                            </button>
                        </div>
                    )}

                    {/* BARRA DE CONTROLES DO PLAYER (PLAY/PAUSE/SEEK) */}
                    {currentMedia && (
                        <div style={{
                            background: '#121217',
                            borderTop: '1px solid #27272a',
                            padding: '1rem 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '1rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                {canControl ? (
                                    <>
                                        <button
                                            onClick={handleTogglePlay}
                                            style={{
                                                background: '#ec4899',
                                                border: 'none',
                                                color: '#fff',
                                                width: '42px',
                                                height: '42px',
                                                borderRadius: '50%',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 0 15px rgba(236, 72, 153, 0.4)'
                                            }}
                                            title={roomState?.playerState?.isPlaying ? 'Pausar para todos' : 'Iniciar para todos'}
                                        >
                                            {roomState?.playerState?.isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: '2px' }} />}
                                        </button>

                                        <button
                                            onClick={() => handleSeek(-10)}
                                            style={{
                                                background: '#27272a',
                                                border: '1px solid #3f3f46',
                                                color: '#e4e4e7',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                fontWeight: '600'
                                            }}
                                            title="Voltar 10 segundos"
                                        >
                                            -10s
                                        </button>

                                        <button
                                            onClick={() => handleSeek(10)}
                                            style={{
                                                background: '#27272a',
                                                border: '1px solid #3f3f46',
                                                color: '#e4e4e7',
                                                padding: '8px 12px',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                fontSize: '0.8rem',
                                                fontWeight: '600'
                                            }}
                                            title="Avançar 10 segundos"
                                        >
                                            +10s
                                        </button>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '0.85rem' }}>
                                        <Lock size={16} style={{ color: '#ec4899' }} />
                                        <span>Controle exclusivo do Criador/Subdonos</span>
                                    </div>
                                )}
                            </div>

                            {/* Controles de Volume Local e Tela Cheia */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <button
                                    onClick={() => {
                                        if (videoRef.current) {
                                            videoRef.current.muted = !isMuted;
                                            setIsMuted(!isMuted);
                                        }
                                    }}
                                    style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
                                    title={isMuted ? 'Ativar som' : 'Silenciar áudio local'}
                                >
                                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                </button>

                                <button
                                    onClick={() => {
                                        if (videoRef.current) {
                                            if (!document.fullscreenElement) {
                                                videoRef.current.requestFullscreen().catch(() => {});
                                            } else {
                                                document.exitFullscreen().catch(() => {});
                                            }
                                        }
                                    }}
                                    style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
                                    title="Tela cheia"
                                >
                                    <Maximize size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* COLUNA DIREITA: CHAT EM TEMPO REAL ESTILO RAVE */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: '#121217',
                    height: isMobile ? 'calc(100vh - 360px)' : '100%',
                    minHeight: isMobile ? '350px' : 'auto',
                    position: 'relative'
                }}>
                    {/* Cabeçalho do Chat */}
                    <div style={{
                        padding: '1rem',
                        borderBottom: '1px solid #27272a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#10b981',
                                boxShadow: '0 0 8px #10b981'
                            }}></div>
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700' }}>Chat da Sala</h3>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>
                            {roomState?.participantsCount || 1} online
                        </span>
                    </div>

                    {/* Mensagens do Chat */}
                    <div style={{
                        flex: 1,
                        padding: '1rem',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.8rem'
                    }}>
                        {roomState?.chatMessages?.map((msg) => (
                            <div key={msg.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <img
                                    src={msg.avatar || '/default-avatar.svg'}
                                    alt={msg.nick}
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: msg.role === 'creator' ? '2px solid #eab308' : msg.role === 'subowner' ? '2px solid #38bdf8' : '1px solid #27272a'
                                    }}
                                    onError={(e) => { e.target.src = '/default-avatar.svg'; }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f4f4f5' }}>
                                            {msg.nick}
                                        </span>
                                        {/* Badges com Ícones Vetoriais SVG */}
                                        {msg.role === 'creator' && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                <Crown size={11} /> Dono
                                            </span>
                                        )}
                                        {msg.role === 'subowner' && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                <ShieldCheck size={11} /> Subdono
                                            </span>
                                        )}
                                        {msg.role === 'system' && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                <Sparkles size={11} /> Sala
                                            </span>
                                        )}
                                        <span style={{ fontSize: '0.7rem', color: '#71717a', marginLeft: 'auto' }}>
                                            {msg.timeSp || ''}
                                        </span>
                                    </div>
                                    <p style={{
                                        margin: 0,
                                        fontSize: '0.85rem',
                                        color: msg.role === 'system' ? '#a1a1aa' : '#d4d4d8',
                                        wordBreak: 'break-word',
                                        lineHeight: '1.4',
                                        fontStyle: msg.role === 'system' ? 'italic' : 'normal'
                                    }}>
                                        {msg.text}
                                    </p>
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    {/* SELETOR DE EMOJIS (EXCLUSIVO DO CHAT) */}
                    {showEmojiPicker && (
                        <div style={{
                            position: 'absolute',
                            bottom: '75px',
                            right: '15px',
                            background: '#1c1c24',
                            border: '1px solid #3f3f46',
                            borderRadius: '16px',
                            padding: '12px',
                            width: '280px',
                            maxHeight: '220px',
                            overflowY: 'auto',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                            zIndex: 1000,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(6, 1fr)',
                            gap: '6px'
                        }}>
                            {COMMON_EMOJIS.map((emoji, index) => (
                                <button
                                    key={index}
                                    onClick={() => handleAddEmoji(emoji)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        fontSize: '1.3rem',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        borderRadius: '8px',
                                        transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={(e) => e.target.style.background = '#27272a'}
                                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* BARRA DE DIGITAÇÃO COM TRAVA DE MUTE */}
                    <div style={{
                        padding: '0.8rem 1rem',
                        borderTop: '1px solid #27272a',
                        background: '#18181f'
                    }}>
                        {isMutedInChat ? (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                color: '#f87171',
                                fontSize: '0.8rem',
                                fontWeight: '600'
                            }}>
                                <MessageSquareOff size={18} />
                                Você foi silenciado na sala e está apenas no modo leitura.
                            </div>
                        ) : (
                            <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                    style={{
                                        background: showEmojiPicker ? '#ec4899' : '#27272a',
                                        color: showEmojiPicker ? '#fff' : '#a1a1aa',
                                        border: 'none',
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    title="Seletor de Emojis do Chat"
                                >
                                    <Smile size={18} />
                                </button>

                                <input
                                    type="text"
                                    placeholder="Digite uma mensagem..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    style={{
                                        flex: 1,
                                        background: '#09090b',
                                        border: '1px solid #27272a',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        color: '#fff',
                                        fontSize: '0.85rem',
                                        outline: 'none'
                                    }}
                                />

                                <button
                                    type="submit"
                                    disabled={!chatInput.trim()}
                                    style={{
                                        background: '#ec4899',
                                        color: '#fff',
                                        border: 'none',
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        cursor: chatInput.trim() ? 'pointer' : 'default',
                                        opacity: chatInput.trim() ? 1 : 0.5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    title="Enviar mensagem"
                                >
                                    <Send size={16} />
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </main>

            {/* ========================================================= */}
            {/* MODAL 1: ESCOLHER FILME / SÉRIE DO CATÁLOGO (COM ABAS/EPISÓDIOS) */}
            {/* ========================================================= */}
            {isCatalogModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        background: '#13131a',
                        border: '1px solid #27272a',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '680px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.7)'
                    }}>
                        <div style={{
                            padding: '1.2rem 1.5rem',
                            borderBottom: '1px solid #27272a',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Film size={20} style={{ color: '#ec4899' }} />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700' }}>
                                    {selectedMediaDetail ? selectedMediaDetail.title || selectedMediaDetail.name : 'Escolher do Catálogo'}
                                </h3>
                            </div>
                            <button
                                onClick={() => {
                                    setIsCatalogModalOpen(false);
                                    setSelectedMediaDetail(null);
                                }}
                                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                            {!selectedMediaDetail ? (
                                <>
                                    <form onSubmit={handleSearchCatalog} style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
                                            <input
                                                type="text"
                                                placeholder="Digite o nome do filme ou série..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    background: '#09090b',
                                                    border: '1px solid #27272a',
                                                    borderRadius: '10px',
                                                    padding: '10px 14px 10px 38px',
                                                    color: '#fff',
                                                    fontSize: '0.9rem',
                                                    outline: 'none',
                                                    boxSizing: 'border-box'
                                                }}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={searching}
                                            style={{
                                                background: '#ec4899',
                                                color: '#fff',
                                                border: 'none',
                                                padding: '0 20px',
                                                borderRadius: '10px',
                                                fontWeight: '600',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {searching ? 'Buscando...' : 'Buscar'}
                                        </button>
                                    </form>

                                    {searchResults.length > 0 ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
                                            {searchResults.map((item) => (
                                                <div
                                                    key={item.id}
                                                    onClick={() => handleSelectMediaForQueue(item)}
                                                    style={{
                                                        background: '#18181f',
                                                        borderRadius: '12px',
                                                        overflow: 'hidden',
                                                        cursor: 'pointer',
                                                        border: '1px solid #27272a',
                                                        transition: 'all 0.2s',
                                                        textAlign: 'center'
                                                    }}
                                                >
                                                    <img
                                                        src={item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : '/no-poster.svg'}
                                                        alt={item.title || item.name}
                                                        style={{ width: '100%', height: '180px', objectFit: 'cover' }}
                                                        onError={(e) => { e.target.src = '/no-poster.svg'; }}
                                                    />
                                                    <div style={{ padding: '8px' }}>
                                                        <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {item.title || item.name}
                                                        </p>
                                                        <span style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>
                                                            {item.media_type === 'tv' || item.first_air_date ? 'Série' : 'Filme'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '2rem 0', color: '#71717a', fontSize: '0.9rem' }}>
                                            Digite um título acima para pesquisar filmes ou séries disponíveis.
                                        </div>
                                    )}
                                </>
                            ) : (
                                /* Detalhes do item selecionado para escolher versão ou episódio */
                                <div>
                                    <button
                                        onClick={() => setSelectedMediaDetail(null)}
                                        style={{ background: 'transparent', border: 'none', color: '#ec4899', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', marginBottom: '1rem' }}
                                    >
                                        ← Voltar para a pesquisa
                                    </button>

                                    <div style={{ display: 'flex', gap: '1.2rem', marginBottom: '1.5rem' }}>
                                        <img
                                            src={selectedMediaDetail.poster_path ? `https://image.tmdb.org/t/p/w200${selectedMediaDetail.poster_path}` : '/no-poster.svg'}
                                            alt={selectedMediaDetail.title || selectedMediaDetail.name}
                                            style={{ width: '100px', height: '150px', borderRadius: '10px', objectFit: 'cover' }}
                                            onError={(e) => { e.target.src = '/no-poster.svg'; }}
                                        />
                                        <div>
                                            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>
                                                {selectedMediaDetail.title || selectedMediaDetail.name}
                                            </h4>
                                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#a1a1aa', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {selectedMediaDetail.overview || 'Sem sinopse disponível.'}
                                            </p>
                                        </div>
                                    </div>

                                    {selectedMediaDetail.media_type === 'movie' ? (
                                        /* Para Filmes: Iniciar ou Adicionar */
                                        <div>
                                            <h5 style={{ margin: '0 0 0.8rem 0', fontSize: '0.95rem' }}>Adicionar Filme à Sala:</h5>
                                            <button
                                                onClick={() => handleConfirmAddToQueue({
                                                    id: selectedMediaDetail.id,
                                                    title: selectedMediaDetail.title,
                                                    type: 'movie',
                                                    streamUrl: selectedMediaDetail.stream_url || `/api/stream/proxy?tmdbId=${selectedMediaDetail.id}`,
                                                    poster: selectedMediaDetail.poster_path
                                                })}
                                                style={{
                                                    background: '#ec4899',
                                                    color: '#fff',
                                                    border: 'none',
                                                    padding: '12px 24px',
                                                    borderRadius: '12px',
                                                    fontWeight: '700',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}
                                            >
                                                <PlusCircle size={18} />
                                                Confirmar Adição à Sala
                                            </button>
                                        </div>
                                    ) : (
                                        /* Para Séries: Selecionar Temporada / Episódio */
                                        <div>
                                            <h5 style={{ margin: '0 0 0.8rem 0', fontSize: '0.95rem' }}>Escolha a Temporada e Episódio:</h5>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {selectedMediaDetail.seasons?.filter(s => s.season_number > 0).map((s) => (
                                                    <button
                                                        key={s.id}
                                                        onClick={async () => {
                                                            try {
                                                                const res = await fetch(`/api/tmdb/tv/${selectedMediaDetail.id}/season/${s.season_number}`);
                                                                const seasonData = await res.json();
                                                                setSelectedMediaDetail(prev => ({
                                                                    ...prev,
                                                                    currentSeasonEps: seasonData.episodes || [],
                                                                    selectedSeasonNum: s.season_number
                                                                }));
                                                            } catch (e) {}
                                                        }}
                                                        style={{
                                                            background: selectedMediaDetail.selectedSeasonNum === s.season_number ? '#ec4899' : '#27272a',
                                                            color: '#fff',
                                                            border: 'none',
                                                            padding: '8px 16px',
                                                            borderRadius: '8px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.85rem',
                                                            fontWeight: '600'
                                                        }}
                                                    >
                                                        Temp {s.season_number}
                                                    </button>
                                                ))}
                                            </div>

                                            {selectedMediaDetail.currentSeasonEps && (
                                                <div style={{ marginTop: '1.2rem', maxHeight: '200px', overflowY: 'auto' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {selectedMediaDetail.currentSeasonEps.map((ep) => (
                                                            <div
                                                                key={ep.id}
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    background: '#18181f',
                                                                    padding: '8px 12px',
                                                                    borderRadius: '8px'
                                                                }}
                                                            >
                                                                <span style={{ fontSize: '0.85rem' }}>
                                                                    Ep {ep.episode_number} - {ep.name || `Episódio ${ep.episode_number}`}
                                                                </span>
                                                                <button
                                                                    onClick={() => handleConfirmAddToQueue({
                                                                        id: selectedMediaDetail.id,
                                                                        title: `${selectedMediaDetail.name} S${String(selectedMediaDetail.selectedSeasonNum).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`,
                                                                        type: 'tv',
                                                                        season: selectedMediaDetail.selectedSeasonNum,
                                                                        episode: ep.episode_number,
                                                                        streamUrl: ep.stream_url || `/api/stream/proxy?tmdbId=${selectedMediaDetail.id}&season=${selectedMediaDetail.selectedSeasonNum}&episode=${ep.episode_number}`,
                                                                        poster: selectedMediaDetail.poster_path
                                                                    })}
                                                                    style={{
                                                                        background: '#ec4899',
                                                                        color: '#fff',
                                                                        border: 'none',
                                                                        padding: '4px 12px',
                                                                        borderRadius: '6px',
                                                                        cursor: 'pointer',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: '700'
                                                                    }}
                                                                >
                                                                    Tocar na Sala
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 2: LISTA DE PRÓXIMA REPRODUÇÃO (FILA / QUEUE) */}
            {/* ========================================================= */}
            {isQueueModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        background: '#13131a',
                        border: '1px solid #27272a',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '520px',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '1.2rem 1.5rem',
                            borderBottom: '1px solid #27272a',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ListVideo size={20} style={{ color: '#38bdf8' }} />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700' }}>
                                    Lista de Próxima Reprodução
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsQueueModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '1.2rem 1.5rem', overflowY: 'auto', flex: 1 }}>
                            {/* Tocando Agora */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <span style={{ fontSize: '0.75rem', color: '#ec4899', fontWeight: '700', textTransform: 'uppercase' }}>
                                    Reproduzindo Agora
                                </span>
                                {currentMedia ? (
                                    <div style={{
                                        background: 'rgba(236, 72, 153, 0.1)',
                                        border: '1px solid rgba(236, 72, 153, 0.3)',
                                        padding: '10px 14px',
                                        borderRadius: '12px',
                                        marginTop: '6px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <Play size={16} style={{ color: '#ec4899' }} />
                                            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{currentMedia.title}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '6px' }}>
                                        Nenhum conteúdo em reprodução.
                                    </div>
                                )}
                            </div>

                            {/* Próximos na Fila */}
                            <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: '700', textTransform: 'uppercase' }}>
                                A Seguir ({roomState?.queue?.length || 0})
                            </span>

                            {roomState?.queue && roomState.queue.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                                    {roomState.queue.map((item, index) => (
                                        <div
                                            key={item.id}
                                            style={{
                                                background: '#18181f',
                                                border: '1px solid #27272a',
                                                borderRadius: '12px',
                                                padding: '10px 14px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '10px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                <span style={{ color: '#71717a', fontWeight: '700', fontSize: '0.85rem' }}>
                                                    #{index + 1}
                                                </span>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontWeight: '600', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {item.title}
                                                    </p>
                                                    <span style={{ fontSize: '0.7rem', color: '#71717a' }}>
                                                        Adicionado por {item.addedBy}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Controles de Prioridade da Fila (Apenas Moderadores) */}
                                            {canControl && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <button
                                                        onClick={() => handleQueueAction('move_up', item.id)}
                                                        disabled={index === 0}
                                                        style={{ background: '#27272a', border: 'none', color: index === 0 ? '#52525b' : '#fff', padding: '6px', borderRadius: '6px', cursor: index === 0 ? 'default' : 'pointer' }}
                                                        title="Mover para cima (maior prioridade)"
                                                    >
                                                        <ChevronUp size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleQueueAction('move_down', item.id)}
                                                        disabled={index === roomState.queue.length - 1}
                                                        style={{ background: '#27272a', border: 'none', color: index === roomState.queue.length - 1 ? '#52525b' : '#fff', padding: '6px', borderRadius: '6px', cursor: index === roomState.queue.length - 1 ? 'default' : 'pointer' }}
                                                        title="Mover para baixo"
                                                    >
                                                        <ChevronDown size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleQueueAction('play_now', item.id)}
                                                        style={{ background: 'rgba(56, 189, 248, 0.15)', border: 'none', color: '#38bdf8', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                                                        title="Tocar agora"
                                                    >
                                                        <Play size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleQueueAction('remove', item.id)}
                                                        style={{ background: 'rgba(239, 68, 68, 0.15)', border: 'none', color: '#ef4444', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                                                        title="Remover da fila"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: '#71717a', fontSize: '0.85rem', marginTop: '8px' }}>
                                    A fila está vazia. Adicione títulos pelo botão "Escolher Filme/Série".
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 3: PARTICIPANTES E HISTÓRICO COM FUSO DE SÃO PAULO */}
            {/* ========================================================= */}
            {isParticipantsModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        background: '#13131a',
                        border: '1px solid #27272a',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '540px',
                        maxHeight: '80vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '1.2rem 1.5rem',
                            borderBottom: '1px solid #27272a',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Users size={20} style={{ color: '#a855f7' }} />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700' }}>
                                    Participantes da Sala
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsParticipantsModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Abas: Ativos vs Já Saíram */}
                        <div style={{ display: 'flex', borderBottom: '1px solid #27272a', background: '#0d0d12' }}>
                            <button
                                onClick={() => setParticipantsTab('active')}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: participantsTab === 'active' ? '2px solid #a855f7' : 'none',
                                    color: participantsTab === 'active' ? '#fff' : '#71717a',
                                    fontWeight: '700',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Na Sala Agora ({roomState?.participantsCount || 1})
                            </button>
                            <button
                                onClick={() => setParticipantsTab('history')}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: participantsTab === 'history' ? '2px solid #a855f7' : 'none',
                                    color: participantsTab === 'history' ? '#fff' : '#71717a',
                                    fontWeight: '700',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Já Saíram / Expulsos ({roomState?.pastParticipants?.length || 0})
                            </button>
                        </div>

                        <div style={{ padding: '1.2rem 1.5rem', overflowY: 'auto', flex: 1 }}>
                            {participantsTab === 'active' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {roomState?.participants?.map((p) => {
                                        const isCreator = p.role === 'creator';
                                        const isSubowner = p.role === 'subowner';
                                        const isMe = user?.id && Number(user.id) === Number(p.userId);

                                        return (
                                            <div
                                                key={p.socketId}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: '#18181f',
                                                    padding: '10px 14px',
                                                    borderRadius: '12px',
                                                    border: '1px solid #27272a'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <img
                                                        src={p.avatar || '/default-avatar.svg'}
                                                        alt={p.nick}
                                                        style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }}
                                                        onError={(e) => { e.target.src = '/default-avatar.svg'; }}
                                                    />
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{p.nick}</span>
                                                            {/* Badges Vetoriais */}
                                                            {isCreator && (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                                    <Crown size={11} /> Criador
                                                                </span>
                                                            )}
                                                            {isSubowner && (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                                    <ShieldCheck size={11} /> Subdono
                                                                </span>
                                                            )}
                                                            {p.isMuted && (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                                    <MicOff size={11} /> Silenciado
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Botões de Ação para o Criador e Subdonos */}
                                                {canControl && !isCreator && !isMe && p.userId && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {/* Criador pode dar/tirar Subdono */}
                                                        {roomState.myRole === 'creator' && (
                                                            <button
                                                                onClick={() => handleToggleSubowner(p.userId)}
                                                                style={{
                                                                    background: isSubowner ? 'rgba(56, 189, 248, 0.15)' : '#27272a',
                                                                    color: isSubowner ? '#38bdf8' : '#e4e4e7',
                                                                    border: 'none',
                                                                    padding: '6px 10px',
                                                                    borderRadius: '8px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '600',
                                                                    cursor: 'pointer'
                                                                }}
                                                                title={isSubowner ? 'Remover cargo de Subdono' : 'Promover a Subdono'}
                                                            >
                                                                <Shield size={14} />
                                                            </button>
                                                        )}

                                                        {/* Silenciar / Desmutar */}
                                                        <button
                                                            onClick={() => handleToggleMute(p.userId)}
                                                            style={{
                                                                background: p.isMuted ? 'rgba(239, 68, 68, 0.15)' : '#27272a',
                                                                color: p.isMuted ? '#ef4444' : '#e4e4e7',
                                                                border: 'none',
                                                                padding: '6px 10px',
                                                                borderRadius: '8px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: '600',
                                                                cursor: 'pointer'
                                                            }}
                                                            title={p.isMuted ? 'Desmutar no chat' : 'Silenciar no chat'}
                                                        >
                                                            <MicOff size={14} />
                                                        </button>

                                                        {/* Expulsar */}
                                                        <button
                                                            onClick={() => handleKickUser(p.userId)}
                                                            style={{
                                                                background: 'rgba(239, 68, 68, 0.1)',
                                                                color: '#ef4444',
                                                                border: 'none',
                                                                padding: '6px 10px',
                                                                borderRadius: '8px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: '600',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Expulsar da sala"
                                                        >
                                                            <UserMinus size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* Aba 2: Histórico com Fuso de São Paulo */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {roomState?.pastParticipants && roomState.pastParticipants.length > 0 ? (
                                        roomState.pastParticipants.map((past, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: '#18181f',
                                                    padding: '10px 14px',
                                                    borderRadius: '12px',
                                                    border: '1px solid #27272a'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <img
                                                        src={past.avatar || '/default-avatar.svg'}
                                                        alt={past.nick}
                                                        style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                                                        onError={(e) => { e.target.src = '/default-avatar.svg'; }}
                                                    />
                                                    <div>
                                                        <p style={{ margin: 0, fontWeight: '600', fontSize: '0.85rem' }}>{past.nick}</p>
                                                        <span style={{
                                                            fontSize: '0.75rem',
                                                            color: past.action === 'Expulso da sala' ? '#ef4444' : '#a1a1aa'
                                                        }}>
                                                            {past.action}
                                                        </span>
                                                    </div>
                                                </div>

                                                <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: '600' }}>
                                                    {past.timeSp} (SP)
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '2rem 0', color: '#71717a', fontSize: '0.85rem' }}>
                                            Nenhum histórico de saídas registrado nesta sessão.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL 4: CONFIGURAÇÕES DA SALA */}
            {/* ========================================================= */}
            {isSettingsModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.85)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        background: '#13131a',
                        border: '1px solid #27272a',
                        borderRadius: '20px',
                        width: '100%',
                        maxWidth: '460px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '1.2rem 1.5rem',
                            borderBottom: '1px solid #27272a',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Settings size={20} style={{ color: '#ec4899' }} />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700' }}>
                                    Configurações da Sala
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsSettingsModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            {!canControl && (
                                <div style={{
                                    background: 'rgba(236, 72, 153, 0.1)',
                                    border: '1px solid rgba(236, 72, 153, 0.3)',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    fontSize: '0.8rem',
                                    color: '#ec4899',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}>
                                    <Lock size={15} />
                                    Modo de visualização. Apenas o Criador e Subdonos podem alterar.
                                </div>
                            )}

                            {/* Config 1: Chat Ativo */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>Chat em Tempo Real</p>
                                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Permite que os membros conversem</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={roomState?.settings?.allowChat || false}
                                    disabled={!canControl}
                                    onChange={(e) => handleUpdateSetting('allowChat', e.target.checked)}
                                    style={{ width: '20px', height: '20px', cursor: canControl ? 'pointer' : 'default', accentColor: '#ec4899' }}
                                />
                            </div>

                            {/* Config 2: Adicionar à Fila */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>Membros podem adicionar à Fila</p>
                                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Permite que qualquer pessoa sugira títulos</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={roomState?.settings?.anyoneCanAddQueue || false}
                                    disabled={!canControl}
                                    onChange={(e) => handleUpdateSetting('anyoneCanAddQueue', e.target.checked)}
                                    style={{ width: '20px', height: '20px', cursor: canControl ? 'pointer' : 'default', accentColor: '#ec4899' }}
                                />
                            </div>

                            {/* Config 3: Convidar amigos */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>Link de Convite Liberado</p>
                                    <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Todos os membros podem copiar o link da sala</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={roomState?.settings?.anyoneCanInvite || false}
                                    disabled={!canControl}
                                    onChange={(e) => handleUpdateSetting('anyoneCanInvite', e.target.checked)}
                                    style={{ width: '20px', height: '20px', cursor: canControl ? 'pointer' : 'default', accentColor: '#ec4899' }}
                                />
                            </div>

                            <button
                                onClick={() => setIsSettingsModalOpen(false)}
                                style={{
                                    marginTop: '1rem',
                                    background: '#27272a',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px',
                                    borderRadius: '10px',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                }}
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
