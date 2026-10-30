// src/components/WatchPartyLobby.jsx
// Lobby de Salas de Transmissão (Watch Party estilo Rave) do Zoroflix / CineGeek
// Listagem moderna de salas ativas com cards horizontais, criador, capa do filme, contador de pessoas e badge Pública/Privada
// 100% livre de emojis na interface (apenas ícones vetoriais Lucide)

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { 
    Tv, Plus, PlusCircle, Users, Lock, Unlock, Globe, Film, 
    Search, Play, KeyRound, Shield, AlertCircle, RefreshCw, X
} from 'lucide-react';

export default function WatchPartyLobby() {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    const [rooms, setRooms] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [searchFilter, setSearchFilter] = useState('');

    // Modal de Criação de Sala
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createRoomName, setCreateRoomName] = useState('');
    const [createIsPrivate, setCreateIsPrivate] = useState(false);
    const [createPassword, setCreatePassword] = useState('');

    // Modal de Senha para Entrar em Sala Privada
    const [selectedPrivateRoom, setSelectedPrivateRoom] = useState(null);
    const [inputPassword, setInputPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');

    // Socket para receber atualizações do Lobby em tempo real
    useEffect(() => {
        const socket = io({ path: '/socket.io' });

        socket.on('connect', () => {
            socket.emit('wp_get_rooms');
        });

        socket.on('wp_lobby_update', (roomList) => {
            setRooms(roomList || []);
            setLoadingRooms(false);
        });

        // Polling de fallback caso necessário a cada 10s
        const interval = setInterval(() => {
            socket.emit('wp_get_rooms');
        }, 10000);

        return () => {
            clearInterval(interval);
            socket.disconnect();
        };
    }, []);

    // Bloqueio Estrito para Usuários Não Logados (Auth Guard)
    if (!authLoading && !user) {
        return (
            <div style={{
                minHeight: '85vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem 1rem',
                background: '#09090b',
                fontFamily: 'Inter, system-ui, sans-serif'
            }}>
                <div style={{
                    background: '#13131a',
                    border: '1px solid #27272a',
                    borderRadius: '24px',
                    padding: '2.5rem 2rem',
                    maxWidth: '460px',
                    width: '100%',
                    textAlign: 'center',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(16px)'
                }}>
                    <div style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '50%',
                        background: 'rgba(0, 230, 118, 0.12)',
                        color: '#00e676',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem auto',
                        border: '1px solid rgba(0, 230, 118, 0.3)'
                    }}>
                        <Lock size={34} />
                    </div>

                    <h2 style={{ color: '#fff', fontSize: '1.45rem', fontWeight: '800', margin: '0 0 0.8rem 0' }}>
                        Crie uma conta para entrar nas salas
                    </h2>
                    
                    <p style={{ color: '#a1a1aa', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 2rem 0' }}>
                        O acesso ao Watch Party é exclusivo para usuários cadastrados. Faça login ou crie sua conta agora para assistir em sincronia com seus amigos.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                        <button
                            onClick={() => navigate('/login?tab=register')}
                            style={{
                                background: 'linear-gradient(135deg, #00e676 0%, #00b0ff 100%)',
                                color: '#000',
                                border: 'none',
                                padding: '13px 20px',
                                borderRadius: '12px',
                                fontWeight: '800',
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(0, 230, 118, 0.35)',
                                transition: 'all 0.2s'
                            }}
                        >
                            Criar Conta
                        </button>
                        <button
                            onClick={() => navigate('/login')}
                            style={{
                                background: '#27272a',
                                color: '#f4f4f5',
                                border: '1px solid #3f3f46',
                                padding: '12px 20px',
                                borderRadius: '12px',
                                fontWeight: '600',
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Fazer Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Criar Nova Sala
    const handleCreateRoom = (e) => {
        if (e) e.preventDefault();
        const baseSlug = createRoomName.trim()
            ? createRoomName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')
            : (user ? user.nick.toLowerCase().replace(/[^a-z0-9]/g, '') : 'sala');
        const finalRoomId = `${baseSlug}-${Math.random().toString(36).substr(2, 4)}`;

        // Guarda os parâmetros no sessionStorage para a WatchPartyPage usar ao conectar
        sessionStorage.setItem(`wp_room_init_${finalRoomId}`, JSON.stringify({
            name: createRoomName.trim() || `Sala de ${user?.nick || 'Amigos'}`,
            isPrivate: createIsPrivate,
            password: createIsPrivate ? createPassword.trim() : ''
        }));

        setIsCreateModalOpen(false);
        navigate(`/sala/${finalRoomId}`);
    };

    // Entrar em uma Sala Existente
    const handleJoinClick = (room) => {
        // Se a sala for privada e o usuário logado não for o criador, solicita senha
        const isCreator = user && room.creatorId && Number(user.id) === Number(room.creatorId);
        if (room.isPrivate && !isCreator) {
            setSelectedPrivateRoom(room);
            setInputPassword('');
            setPasswordError('');
            return;
        }

        navigate(`/sala/${room.id}`);
    };

    // Confirmar Senha da Sala Privada
    const handleConfirmPrivatePassword = (e) => {
        if (e) e.preventDefault();
        if (!inputPassword.trim()) {
            setPasswordError('Digite a senha da sala');
            return;
        }

        // Armazena a senha informada no sessionStorage para ser enviada no wp_join_room
        sessionStorage.setItem(`wp_room_pass_${selectedPrivateRoom.id}`, inputPassword.trim());
        const targetId = selectedPrivateRoom.id;
        setSelectedPrivateRoom(null);
        navigate(`/sala/${targetId}`);
    };

    // Filtragem de Salas
    const filteredRooms = rooms.filter(r => {
        const query = searchFilter.toLowerCase();
        return (
            (r.name && r.name.toLowerCase().includes(query)) ||
            (r.creatorNick && r.creatorNick.toLowerCase().includes(query)) ||
            (r.currentMedia?.title && r.currentMedia.title.toLowerCase().includes(query))
        );
    });

    return (
        <div style={{
            minHeight: '100vh',
            background: 'transparent',
            color: '#f8fafc',
            padding: '2rem 1.5rem',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                
                {/* CABEÇALHO DO LOBBY */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '2rem',
                    paddingBottom: '1.5rem',
                    borderBottom: '1px solid rgba(0, 230, 118, 0.25)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '14px',
                            background: 'rgba(0, 230, 118, 0.12)',
                            border: '1px solid rgba(0, 230, 118, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#00e676',
                            boxShadow: '0 0 15px rgba(0, 230, 118, 0.25)'
                        }}>
                            <Tv size={26} />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.5px', color: '#fff' }}>
                                Watch Party
                            </h1>
                            <p style={{ margin: '3px 0 0 0', fontSize: '0.88rem', color: '#94a3b8' }}>
                                Assista filmes e séries sincronizados em tempo real com amigos
                            </p>
                        </div>
                    </div>

                    {/* BOTÃO CRIAR SALA */}
                    <button
                        onClick={() => {
                            setCreateRoomName('');
                            setCreateIsPrivate(false);
                            setCreatePassword('');
                            setIsCreateModalOpen(true);
                        }}
                        style={{
                            background: 'linear-gradient(135deg, #00e676 0%, #00b35c 100%)',
                            color: '#051912',
                            border: 'none',
                            padding: '12px 22px',
                            borderRadius: '12px',
                            fontWeight: '800',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 20px rgba(0, 230, 118, 0.35)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <PlusCircle size={20} />
                        Criar Sala
                    </button>
                </div>

                {/* BARRA DE FILTRO E PESQUISA */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                    flexWrap: 'wrap'
                }}>
                    <div style={{
                        position: 'relative',
                        flex: 1,
                        minWidth: '240px'
                    }}>
                        <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nome da sala, criador ou filme..."
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            style={{
                                width: '100%',
                                background: 'rgba(9, 42, 28, 0.75)',
                                border: '1px solid rgba(0, 230, 118, 0.25)',
                                borderRadius: '12px',
                                padding: '12px 14px 12px 42px',
                                color: '#fff',
                                fontSize: '0.9rem',
                                outline: 'none',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.85rem' }}>
                        <span>Salas ativas:</span>
                        <strong style={{ color: '#00e676', background: 'rgba(0, 230, 118, 0.12)', border: '1px solid rgba(0, 230, 118, 0.3)', padding: '3px 10px', borderRadius: '8px' }}>
                            {rooms.length}
                        </strong>
                    </div>
                </div>

                {/* LISTAGEM DE SALAS (CARDS HORIZONTAIS MODERNOS) */}
                {loadingRooms ? (
                    <div style={{ textAlign: 'center', padding: '4rem 0', color: '#94a3b8' }}>
                        <RefreshCw size={32} className="spin-anim" style={{ marginBottom: '1rem', color: '#00e676' }} />
                        <p style={{ margin: 0, fontSize: '0.95rem' }}>Carregando salas ativas...</p>
                    </div>
                ) : filteredRooms.length === 0 ? (
                    <div style={{
                        background: 'rgba(9, 42, 28, 0.65)',
                        border: '1px solid rgba(0, 230, 118, 0.25)',
                        borderRadius: '20px',
                        padding: '4rem 2rem',
                        textAlign: 'center',
                        color: '#94a3b8',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'rgba(0, 230, 118, 0.1)',
                            color: '#00e676',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem auto',
                            border: '1px solid rgba(0, 230, 118, 0.3)'
                        }}>
                            <Film size={32} />
                        </div>
                        <h3 style={{ color: '#fff', fontSize: '1.25rem', margin: '0 0 0.5rem 0' }}>
                            Nenhuma sala ativa encontrada
                        </h3>
                        <p style={{ maxWidth: '420px', margin: '0 auto 1.5rem auto', fontSize: '0.9rem', lineHeight: '1.5' }}>
                            Seja o primeiro a abrir uma transmissão e convide seus amigos para assistir juntos.
                        </p>
                        <button
                            onClick={() => {
                                setCreateRoomName('');
                                setCreateIsPrivate(false);
                                setCreatePassword('');
                                setIsCreateModalOpen(true);
                            }}
                            style={{
                                background: '#00e676',
                                color: '#051912',
                                border: 'none',
                                padding: '11px 24px',
                                borderRadius: '12px',
                                fontWeight: '800',
                                fontSize: '0.9rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 15px rgba(0, 230, 118, 0.3)'
                            }}
                        >
                            <Plus size={18} />
                            Criar Primeira Sala
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {filteredRooms.map((room) => {
                            const posterUrl = room.currentMedia?.poster
                                ? (room.currentMedia.poster.startsWith('http') ? room.currentMedia.poster : `https://image.tmdb.org/t/p/w300${room.currentMedia.poster}`)
                                : null;

                            return (
                                <div
                                    key={room.id}
                                    onClick={() => handleJoinClick(room)}
                                    style={{
                                        background: 'rgba(9, 42, 28, 0.75)',
                                        border: '1px solid rgba(0, 230, 118, 0.25)',
                                        borderRadius: '16px',
                                        padding: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1.2rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                                        backdropFilter: 'blur(10px)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = '#00e676';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = 'rgba(0, 230, 118, 0.25)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    {/* Capa / Poster do Filme ou Série em exibição */}
                                    <div style={{
                                        width: '80px',
                                        height: '110px',
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        background: 'linear-gradient(135deg, #092a1c 0%, #051912 100%)',
                                        border: '1px solid rgba(0, 230, 118, 0.2)',
                                        flexShrink: 0,
                                        position: 'relative',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {posterUrl ? (
                                            <img
                                                src={posterUrl}
                                                alt={room.currentMedia?.title || 'Watch Party'}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#00e676', opacity: 0.8 }}>
                                                <Tv size={28} />
                                                <span style={{ fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SALA</span>
                                            </div>
                                        )}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: 0, left: 0, right: 0,
                                            height: '40%',
                                            background: 'linear-gradient(to top, rgba(5,25,18,0.85), transparent)'
                                        }} />
                                    </div>

                                    {/* Detalhes da Sala e Conteúdo */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            <h3 style={{
                                                margin: 0,
                                                fontSize: '1.1rem',
                                                fontWeight: '700',
                                                color: '#fff',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {room.name}
                                            </h3>

                                            {/* Badge Pública / Privada com Ícone Vetorial */}
                                            {room.isPrivate ? (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                    color: '#ef4444',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700'
                                                }}>
                                                    <Lock size={12} />
                                                    Privada
                                                </span>
                                            ) : (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    background: 'rgba(16, 185, 129, 0.15)',
                                                    color: '#10b981',
                                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700'
                                                }}>
                                                    <Globe size={12} />
                                                    Pública
                                                </span>
                                            )}
                                        </div>

                                        {/* Informaçõe                                        <p style={{
                                            margin: '0 0 10px 0',
                                            fontSize: '0.85rem',
                                            color: '#e4e4e7',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}>
                                            <Film size={15} style={{ color: '#00e676', flexShrink: 0 }} />
                                            <span>
                                                {room.currentMedia ? (
                                                    <strong>{room.currentMedia.title}</strong>
                                                ) : (
                                                    <span style={{ color: '#71717a' }}>Nenhum filme selecionado (em espera)</span>
                                                )}
                                            </span>
                                        </p>

                                        {/* Criador e Usuários Assistindo */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.78rem', color: '#a1a1aa' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <img
                                                    src={room.creatorAvatar || '/default-avatar.svg'}
                                                    alt={room.creatorNick}
                                                    style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                                                    onError={(e) => { e.target.src = '/default-avatar.svg'; }}
                                                />
                                                <span>Criado por <strong style={{ color: '#fff' }}>{room.creatorNick}</strong></span>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <Users size={14} style={{ color: '#00e676' }} />
                                                <span style={{ color: '#00e676', fontWeight: '700' }}>
                                                    {room.participantsCount || 1}
                                                </span>
                                                <span>assistindo</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Botão Entrar */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleJoinClick(room);
                                        }}
                                        style={{
                                            background: 'rgba(0, 230, 118, 0.1)',
                                            color: '#00e676',
                                            border: '1px solid rgba(0, 230, 118, 0.3)',
                                            padding: '10px 18px',
                                            borderRadius: '10px',
                                            fontWeight: '700',
                                            fontSize: '0.88rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            flexShrink: 0,
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = '#00e676';
                                            e.currentTarget.style.color = '#000';
                                            e.currentTarget.style.borderColor = '#00e676';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(0, 230, 118, 0.1)';
                                            e.currentTarget.style.color = '#00e676';
                                            e.currentTarget.style.borderColor = 'rgba(0, 230, 118, 0.3)';
                                        }}
                                    >
                                        <Play size={15} />
                                        Entrar
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ========================================================= */}
            {/* MODAL: CRIAR SALA */}
            {/* ========================================================= */}
            {isCreateModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)',
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
                        overflow: 'hidden',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{
                            padding: '1.2rem 1.5rem',
                            borderBottom: '1px solid #27272a',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <PlusCircle size={20} style={{ color: '#00e676' }} />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#fff' }}>
                                    Criar Nova Sala
                                </h3>
                            </div>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateRoom} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '6px', fontWeight: '600' }}>
                                    Nome da Sala:
                                </label>
                                <input
                                    type="text"
                                    placeholder={`Ex: Sala do ${user?.nick || 'Cinefilo'}`}
                                    value={createRoomName}
                                    onChange={(e) => setCreateRoomName(e.target.value)}
                                    maxLength={50}
                                    style={{
                                        width: '100%',
                                        background: '#09090b',
                                        border: '1px solid #27272a',
                                        borderRadius: '10px',
                                        padding: '11px 14px',
                                        color: '#fff',
                                        fontSize: '0.9rem',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Seleção Pública / Privada */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#a1a1aa', marginBottom: '8px', fontWeight: '600' }}>
                                    Visibilidade da Sala:
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div
                                        onClick={() => setCreateIsPrivate(false)}
                                        style={{
                                            background: !createIsPrivate ? 'rgba(16, 185, 129, 0.15)' : '#18181f',
                                            border: !createIsPrivate ? '2px solid #10b981' : '1px solid #27272a',
                                            borderRadius: '12px',
                                            padding: '12px',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <Globe size={22} style={{ color: !createIsPrivate ? '#10b981' : '#71717a', marginBottom: '4px' }} />
                                        <p style={{ margin: 0, fontWeight: '700', fontSize: '0.88rem', color: !createIsPrivate ? '#fff' : '#a1a1aa' }}>
                                            Pública
                                        </p>
                                        <span style={{ fontSize: '0.7rem', color: '#71717a' }}>Qualquer um pode entrar</span>
                                    </div>

                                    <div
                                        onClick={() => setCreateIsPrivate(true)}
                                        style={{
                                            background: createIsPrivate ? 'rgba(239, 68, 68, 0.15)' : '#18181f',
                                            border: createIsPrivate ? '2px solid #ef4444' : '1px solid #27272a',
                                            borderRadius: '12px',
                                            padding: '12px',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <Lock size={22} style={{ color: createIsPrivate ? '#ef4444' : '#71717a', marginBottom: '4px' }} />
                                        <p style={{ margin: 0, fontWeight: '700', fontSize: '0.88rem', color: createIsPrivate ? '#fff' : '#a1a1aa' }}>
                                            Privada
                                        </p>
                                        <span style={{ fontSize: '0.7rem', color: '#71717a' }}>Exige senha para entrar</span>
                                    </div>
                                </div>
                            </div>

                            {/* Campo de Senha se for Privada */}
                            {createIsPrivate && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#ef4444', marginBottom: '6px', fontWeight: '600' }}>
                                        Defina a Senha da Sala:
                                    </label>
                                    <input
                                        type="password"
                                        placeholder="Digite uma senha para os amigos..."
                                        value={createPassword}
                                        onChange={(e) => setCreatePassword(e.target.value)}
                                        required={createIsPrivate}
                                        style={{
                                            width: '100%',
                                            background: '#09090b',
                                            border: '1px solid #ef4444',
                                            borderRadius: '10px',
                                            padding: '11px 14px',
                                            color: '#fff',
                                            fontSize: '0.9rem',
                                            outline: 'none',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    style={{
                                        flex: 1,
                                        background: '#27272a',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        flex: 1,
                                        background: 'linear-gradient(135deg, #00e676 0%, #00b0ff 100%)',
                                        color: '#000',
                                        border: 'none',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 15px rgba(0, 230, 118, 0.4)'
                                    }}
                                >
                                    Criar e Entrar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL: DIGITAR SENHA PARA ENTRAR EM SALA PRIVADA */}
            {/* ========================================================= */}
            {selectedPrivateRoom && (
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
                        maxWidth: '420px',
                        overflow: 'hidden',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{
                            padding: '1.2rem 1.5rem',
                            borderBottom: '1px solid #27272a',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Lock size={20} style={{ color: '#ef4444' }} />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700' }}>
                                    Sala Protegida
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedPrivateRoom(null)}
                                style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmPrivatePassword} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ margin: 0, fontSize: '0.88rem', color: '#a1a1aa', lineHeight: '1.5' }}>
                                A sala <strong style={{ color: '#fff' }}>{selectedPrivateRoom.name}</strong> é privada. Digite a senha para liberar o acesso:
                            </p>

                            <div style={{ position: 'relative' }}>
                                <KeyRound size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
                                <input
                                    type="password"
                                    placeholder="Senha da sala..."
                                    value={inputPassword}
                                    onChange={(e) => {
                                        setInputPassword(e.target.value);
                                        setPasswordError('');
                                    }}
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        background: '#09090b',
                                        border: passwordError ? '1px solid #ef4444' : '1px solid #27272a',
                                        borderRadius: '10px',
                                        padding: '11px 14px 11px 38px',
                                        color: '#fff',
                                        fontSize: '0.9rem',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {passwordError && (
                                <span style={{ fontSize: '0.8rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <AlertCircle size={14} />
                                    {passwordError}
                                </span>
                            )}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedPrivateRoom(null)}
                                    style={{
                                        flex: 1,
                                        background: '#27272a',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '11px',
                                        borderRadius: '10px',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    style={{
                                        flex: 1,
                                        background: 'linear-gradient(135deg, #00e676 0%, #00b0ff 100%)',
                                        color: '#000',
                                        border: 'none',
                                        padding: '11px',
                                        borderRadius: '10px',
                                        fontWeight: '800',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 15px rgba(0, 230, 118, 0.4)'
                                    }}
                                >
                                    Acessar Sala
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
