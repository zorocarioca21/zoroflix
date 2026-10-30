// backend/services/watchPartyService.js
// Gerenciador de Watch Party (Salas Sincronizadas estilo Rave) com Lobby, Senhas, Histórico e Recompensas

class WatchPartyService {
    constructor() {
        // Map: roomId -> RoomState
        this.rooms = new Map();
        this.io = null;
        this.db = null;
    }

    init(io, db) {
        this.io = io;
        this.db = db;
        console.log('[WatchParty] Serviço de Watch Party inicializado com WebSockets.');

        // Intervalo periódico para salvar o progresso de todos os usuários em watch_history
        setInterval(() => {
            this.syncWatchProgressAllRooms();
        }, 15000); // A cada 15 segundos
    }

    // Salva progresso individual de cada usuário na sala na tabela watch_history
    async syncWatchProgressAllRooms() {
        if (!this.db) return;

        for (const [roomId, room] of this.rooms.entries()) {
            if (!room.playerState?.isPlaying || !room.playerState?.currentMedia) continue;
            
            const media = room.playerState.currentMedia;
            const contentId = media.id || media.tmdb_id;
            if (!contentId) continue;

            let computedTime = room.playerState.currentTime || 0;
            if (room.playerState.updatedAt) {
                computedTime += (Date.now() - room.playerState.updatedAt) / 1000;
            }
            const finalTime = Math.floor(computedTime);

            const season = media.season !== undefined ? media.season : null;
            const episode = media.episode !== undefined ? media.episode : null;
            const mediaType = media.type || (season ? 'tv' : 'movie');
            const title = media.title || 'Conteúdo';
            const posterPath = media.poster || media.poster_path || null;

            // Percorre cada participante ativo com conta logada
            for (const participant of room.participants.values()) {
                if (!participant.userId) continue;

                try {
                    const existing = await this.db.get(
                        'SELECT id FROM watch_history WHERE user_id = ? AND content_id = ?',
                        [participant.userId, contentId]
                    );

                    if (existing) {
                        await this.db.run(
                            'UPDATE watch_history SET resume_time = ?, season = ?, episode = ?, watched_at = CURRENT_TIMESTAMP WHERE id = ?',
                            [finalTime, season, episode, existing.id]
                        );
                    } else {
                        await this.db.run(
                            'INSERT INTO watch_history (user_id, content_id, media_type, title, poster_path, season, episode, resume_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                            [participant.userId, contentId, mediaType, title, posterPath, season, episode, finalTime]
                        );
                    }
                } catch (err) {
                    // Ignora falhas pontuais de banco
                }
            }
        }
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }

    // Lista de salas públicas e privadas para o Lobby
    getRoomsList() {
        const list = [];
        for (const [roomId, room] of this.rooms.entries()) {
            list.push({
                id: room.id,
                name: room.name || `Sala de ${room.creatorNick}`,
                creatorId: room.creatorId,
                creatorNick: room.creatorNick,
                creatorAvatar: room.creatorAvatar,
                participantsCount: room.participants.size,
                currentMedia: room.playerState.currentMedia ? {
                    id: room.playerState.currentMedia.id,
                    title: room.playerState.currentMedia.title,
                    type: room.playerState.currentMedia.type,
                    poster: room.playerState.currentMedia.poster,
                    season: room.playerState.currentMedia.season,
                    episode: room.playerState.currentMedia.episode
                } : null,
                isPrivate: !!room.isPrivate,
                createdAt: room.createdAt
            });
        }
        // Ordena por quantidade de participantes (mais cheias no topo)
        return list.sort((a, b) => b.participantsCount - a.participantsCount);
    }

    broadcastLobbyList() {
        if (!this.io) return;
        this.io.emit('wp_lobby_update', this.getRoomsList());
    }

    // Cria ou recupera uma sala
    createOrGetRoom(roomId, creatorUser, roomOptions = {}) {
        if (this.rooms.has(roomId)) {
            const existing = this.rooms.get(roomId);
            if (roomOptions.name) existing.name = roomOptions.name;
            if (roomOptions.isPrivate !== undefined) existing.isPrivate = !!roomOptions.isPrivate;
            if (roomOptions.password !== undefined) existing.password = roomOptions.password;
            return existing;
        }

        const room = {
            id: roomId,
            name: roomOptions.name || (creatorUser ? `Sala de ${creatorUser.nick}` : 'Watch Party'),
            creatorId: creatorUser ? creatorUser.id : null,
            creatorNick: creatorUser ? creatorUser.nick : 'Anônimo',
            creatorAvatar: creatorUser ? creatorUser.avatar : '/default-avatar.svg',
            isPrivate: !!roomOptions.isPrivate,
            password: roomOptions.password || '',
            createdAt: Date.now(),
            subowners: new Set(), // Set of userIds
            mutedUsers: new Set(), // Set of userIds
            bannedUsers: new Set(), // Set of userIds (expulsos que não podem voltar)
            participants: new Map(), // socketId -> { socketId, userId, nick, avatar, role, joinedAt, clientTimestamp }
            pastParticipants: [], // [{ userId, nick, avatar, role, action: 'Saiu da sala' | 'Expulso da sala', timeSp: 'HH:mm:ss' }]
            
            // Estado do Player Sincronizado
            playerState: {
                currentMedia: null, // { id, title, type, streamUrl, poster, backdrop, season, episode, dubLeg }
                isPlaying: false,
                currentTime: 0,
                updatedAt: Date.now()
            },

            // Fila de Próxima Reprodução
            queue: [], // [{ id, title, type, streamUrl, poster, backdrop, season, episode, dubLeg, addedBy }]

            // Configurações da Sala
            settings: {
                isPublic: !roomOptions.isPrivate,
                allowChat: true,
                anyoneCanAddQueue: true,
                anyoneCanInvite: true
            },

            chatMessages: [] // [{ id, userId, nick, avatar, role, text, timestamp, timeSp }]
        };

        this.rooms.set(roomId, room);
        this.broadcastLobbyList();
        return room;
    }

    // Formata hora no fuso horário de São Paulo (America/Sao_Paulo)
    getSaoPauloTime() {
        const now = new Date();
        return new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(now);
    }

    // Calcula o papel atual do usuário na sala: 'creator' | 'subowner' | 'member'
    resolveUserRole(room, userId) {
        if (!userId) return 'member';
        if (room.creatorId && Number(room.creatorId) === Number(userId)) {
            return 'creator';
        }
        if (room.subowners.has(Number(userId))) {
            return 'subowner';
        }
        return 'member';
    }

    // Regra de Sucessão Automática caso Criador saia sem deixar Subdono
    checkAutomaticSuccession(room) {
        if (!room) return;

        // Se houver algum subdono presente na sala, não precisa de sucessão emergencial
        const activeSubowners = Array.from(room.participants.values()).filter(p => 
            p.userId && room.subowners.has(Number(p.userId))
        );
        if (activeSubowners.length > 0) return;

        // Se o criador estiver presente, tudo normal
        const isCreatorPresent = Array.from(room.participants.values()).some(p => 
            p.userId && Number(p.userId) === Number(room.creatorId)
        );
        if (isCreatorPresent) return;

        // Caso o criador NÃO esteja e NÃO haja subdonos na sala:
        // Pega o participante mais antigo (menor joinedAt) dentre os ativos
        const activeMembers = Array.from(room.participants.values())
            .filter(p => p.userId && !room.bannedUsers.has(Number(p.userId)))
            .sort((a, b) => a.joinedAt - b.joinedAt);

        if (activeMembers.length > 0) {
            const nextInLine = activeMembers[0];
            room.subowners.add(Number(nextInLine.userId));
            console.log(`[WatchParty] Sucessão automática: Usuário ${nextInLine.nick} (${nextInLine.userId}) promovido a Subdono da sala ${room.id}`);
            
            // Adiciona mensagem de sistema no chat
            this.addSystemMessage(room, `Sucessão: ${nextInLine.nick} assumiu temporariamente como Subdono da sala.`);
        }
    }

    addSystemMessage(room, text) {
        const msg = {
            id: `sys_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            userId: 0,
            nick: 'Sistema',
            avatar: '/default-avatar.svg',
            role: 'system',
            text,
            timestamp: Date.now(),
            timeSp: this.getSaoPauloTime()
        };
        room.chatMessages.push(msg);
        if (room.chatMessages.length > 200) room.chatMessages.shift();
        
        if (this.io) {
            this.io.to(`room_${room.id}`).emit('wp_chat_message', msg);
        }
    }

    // Serializa o estado público da sala para os clientes
    serializeRoom(room, currentUserId) {
        if (!room) return null;

        // Calcula tempo decorrido atual se estiver tocando
        let computedTime = room.playerState.currentTime;
        if (room.playerState.isPlaying && room.playerState.updatedAt) {
            computedTime += (Date.now() - room.playerState.updatedAt) / 1000;
        }

        // Lista de participantes ativos com papéis recalculados
        const participantsList = Array.from(room.participants.values()).map(p => ({
            socketId: p.socketId,
            userId: p.userId,
            nick: p.nick,
            avatar: p.avatar,
            role: this.resolveUserRole(room, p.userId),
            joinedAt: p.joinedAt,
            isMuted: p.userId ? room.mutedUsers.has(Number(p.userId)) : false
        }));

        const myRole = this.resolveUserRole(room, currentUserId);
        const amIMuted = currentUserId ? room.mutedUsers.has(Number(currentUserId)) : false;

        return {
            id: room.id,
            name: room.name || `Sala de ${room.creatorNick}`,
            creatorId: room.creatorId,
            creatorNick: room.creatorNick,
            creatorAvatar: room.creatorAvatar,
            isPrivate: !!room.isPrivate,
            myRole,
            amIMuted,
            canControl: myRole === 'creator' || myRole === 'subowner',
            participantsCount: participantsList.length,
            participants: participantsList,
            pastParticipants: room.pastParticipants.slice(-50),
            playerState: {
                ...room.playerState,
                currentTime: computedTime
            },
            queue: room.queue,
            settings: room.settings,
            chatMessages: room.chatMessages.slice(-100)
        };
    }

    broadcastRoomState(room) {
        if (!this.io || !room) return;
        
        // Emite para cada socket na sala com seu papel individual correto
        const socketsInRoom = this.io.sockets.adapter.rooms.get(`room_${room.id}`);
        if (!socketsInRoom) return;

        for (const socketId of socketsInRoom) {
            const socket = this.io.sockets.sockets.get(socketId);
            if (socket) {
                const userId = socket.data?.user?.id;
                socket.emit('wp_room_state', this.serializeRoom(room, userId));
            }
        }

        this.broadcastLobbyList();
    }

    handleJoin(socket, { roomId, user, password, roomName, isPrivate }) {
        // Trava Estrita: Acesso Anônimo Bloqueado
        if (!user || !user.id) {
            socket.emit('wp_error', { code: 'auth_required', message: 'Crie uma conta para entrar nas salas.' });
            return;
        }

        let room = this.createOrGetRoom(roomId, user, { name: roomName, isPrivate, password });

        // Validação de Senha para Salas Privadas
        if (room.isPrivate && room.password) {
            const isCreatorOrSubowner = room.creatorId && Number(room.creatorId) === Number(user.id);
            if (!isCreatorOrSubowner) {
                if (!password || String(password).trim() !== String(room.password).trim()) {
                    socket.emit('wp_error', { code: 'password_required', message: 'Senha incorreta para esta sala.' });
                    return;
                }
            }
        }

        // Verifica se o usuário foi expulso
        if (room.bannedUsers.has(Number(user.id))) {
            socket.emit('wp_error', { code: 'banned', message: 'Você foi expulso desta sala.' });
            return;
        }

        // Se for o primeiro a entrar e a sala não tinha criador definido, define
        if (!room.creatorId) {
            room.creatorId = user.id;
            room.creatorNick = user.nick;
            room.creatorAvatar = user.avatar || '/default-avatar.svg';
        }

        socket.data.user = user;
        socket.data.roomId = roomId;
        socket.join(`room_${roomId}`);

        const participant = {
            socketId: socket.id,
            userId: user.id,
            nick: user.nick || 'Usuário',
            avatar: user.avatar || '/default-avatar.svg',
            joinedAt: Date.now()
        };

        room.participants.set(socket.id, participant);

        console.log(`[WatchParty] ${participant.nick} entrou na sala ${roomId} (Total: ${room.participants.size})`);
        this.addSystemMessage(room, `${participant.nick} entrou na sala.`);

        this.broadcastRoomState(room);
    }

    handleLeave(socket) {
        const roomId = socket.data?.roomId;
        if (!roomId || !this.rooms.has(roomId)) return;

        const room = this.rooms.get(roomId);
        const participant = room.participants.get(socket.id);

        if (participant) {
            room.participants.delete(socket.id);
            
            // Registra no histórico de saída com o fuso de São Paulo
            room.pastParticipants.push({
                userId: participant.userId,
                nick: participant.nick,
                avatar: participant.avatar,
                role: this.resolveUserRole(room, participant.userId),
                action: 'Saiu da sala',
                timeSp: this.getSaoPauloTime()
            });

            this.addSystemMessage(room, `${participant.nick} saiu da sala.`);
            
            // Checa regra de sucessão automática se o Criador saiu sem deixar Subdono
            this.checkAutomaticSuccession(room);

            this.broadcastRoomState(room);
        }
    }

    // Play / Pause / Seek do Player Sincronizado
    handlePlayerSync(socket, { action, time, media }) {
        const roomId = socket.data?.roomId;
        const user = socket.data?.user;
        const room = this.getRoom(roomId);
        if (!room) return;

        const role = this.resolveUserRole(room, user?.id);
        if (role !== 'creator' && role !== 'subowner') {
            socket.emit('wp_error', { message: 'Apenas o Criador e Subdonos podem controlar o player.' });
            return;
        }

        if (action === 'play') {
            room.playerState.isPlaying = true;
            room.playerState.currentTime = Number(time) || room.playerState.currentTime;
            room.playerState.updatedAt = Date.now();
        } else if (action === 'pause') {
            room.playerState.isPlaying = false;
            room.playerState.currentTime = Number(time) || room.playerState.currentTime;
            room.playerState.updatedAt = Date.now();
        } else if (action === 'seek') {
            room.playerState.currentTime = Number(time) || 0;
            room.playerState.updatedAt = Date.now();
        } else if (action === 'switch_source' && media) {
            room.playerState.currentMedia = {
                ...room.playerState.currentMedia,
                ...media
            };
            if (time !== undefined && time !== null) {
                room.playerState.currentTime = Number(time);
            }
            room.playerState.updatedAt = Date.now();
        } else if (action === 'change_media' && media) {
            room.playerState.currentMedia = media;
            room.playerState.currentTime = 0;
            room.playerState.isPlaying = true;
            room.playerState.updatedAt = Date.now();
            this.addSystemMessage(room, `${user?.nick || 'Um moderador'} iniciou: ${media.title}`);
        }

        this.broadcastRoomState(room);
    }

    // Adiciona à Fila (Queue)
    handleAddToQueue(socket, media) {
        const roomId = socket.data?.roomId;
        const user = socket.data?.user;
        const room = this.getRoom(roomId);
        if (!room) return;

        const role = this.resolveUserRole(room, user?.id);
        if (!room.settings.anyoneCanAddQueue && role === 'member') {
            socket.emit('wp_error', { message: 'A adição à fila está restrita apenas para moderadores.' });
            return;
        }

        const queueItem = {
            id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            ...media,
            addedBy: user?.nick || 'Membro'
        };

        // Se não houver nada tocando, inicia imediatamente!
        if (!room.playerState.currentMedia) {
            room.playerState.currentMedia = queueItem;
            room.playerState.currentTime = 0;
            room.playerState.isPlaying = true;
            room.playerState.updatedAt = Date.now();
            this.addSystemMessage(room, `${user?.nick || 'Alguém'} iniciou: ${media.title}`);
        } else {
            // Se já tem algo rodando, coloca no fim da fila
            room.queue.push(queueItem);
            this.addSystemMessage(room, `${user?.nick || 'Alguém'} adicionou à fila: ${media.title}`);
        }

        this.broadcastRoomState(room);
    }

    // Reordenar ou Remover item da Fila
    handleManageQueue(socket, { action, queueId, newIndex }) {
        const roomId = socket.data?.roomId;
        const user = socket.data?.user;
        const room = this.getRoom(roomId);
        if (!room) return;

        const role = this.resolveUserRole(room, user?.id);
        if (role !== 'creator' && role !== 'subowner') {
            socket.emit('wp_error', { message: 'Apenas moderadores podem gerenciar a fila.' });
            return;
        }

        const itemIndex = room.queue.findIndex(q => q.id === queueId);
        if (itemIndex === -1 && action !== 'play_next') return;

        if (action === 'remove') {
            const removed = room.queue.splice(itemIndex, 1)[0];
            this.addSystemMessage(room, `Removido da fila: ${removed.title}`);
        } else if (action === 'move_up' && itemIndex > 0) {
            const item = room.queue.splice(itemIndex, 1)[0];
            room.queue.splice(itemIndex - 1, 0, item);
        } else if (action === 'move_down' && itemIndex < room.queue.length - 1) {
            const item = room.queue.splice(itemIndex, 1)[0];
            room.queue.splice(itemIndex + 1, 0, item);
        } else if (action === 'play_now') {
            const item = room.queue.splice(itemIndex, 1)[0];
            room.playerState.currentMedia = item;
            room.playerState.currentTime = 0;
            room.playerState.isPlaying = true;
            room.playerState.updatedAt = Date.now();
            this.addSystemMessage(room, `Reproduzindo agora da fila: ${item.title}`);
        } else if (action === 'play_next') {
            // Toca o próximo item do topo da fila se existir
            if (room.queue.length > 0) {
                const nextItem = room.queue.shift();
                room.playerState.currentMedia = nextItem;
                room.playerState.currentTime = 0;
                room.playerState.isPlaying = true;
                room.playerState.updatedAt = Date.now();
                this.addSystemMessage(room, `Próximo da fila iniciado: ${nextItem.title}`);
            } else {
                room.playerState.currentMedia = null;
                room.playerState.isPlaying = false;
                room.playerState.currentTime = 0;
            }
        }

        this.broadcastRoomState(room);
    }

    // Chat: Enviar mensagem com checagem de silenciamento
    handleChatMessage(socket, text) {
        const roomId = socket.data?.roomId;
        const user = socket.data?.user;
        const room = this.getRoom(roomId);
        if (!room) return;

        if (!room.settings.allowChat) {
            socket.emit('wp_error', { message: 'O chat da sala está temporariamente desativado.' });
            return;
        }

        // Validação estrita de Mute no Backend
        if (user?.id && room.mutedUsers.has(Number(user.id))) {
            socket.emit('wp_error', { message: 'Você foi silenciado na sala e está apenas no modo leitura.' });
            return;
        }

        if (!text || !text.trim()) return;

        const msg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            userId: user?.id || null,
            nick: user?.nick || 'Convidado',
            avatar: user?.avatar || '/default-avatar.svg',
            role: this.resolveUserRole(room, user?.id),
            text: text.trim().substring(0, 500),
            timestamp: Date.now(),
            timeSp: this.getSaoPauloTime()
        };

        room.chatMessages.push(msg);
        if (room.chatMessages.length > 200) room.chatMessages.shift();

        if (this.io) {
            this.io.to(`room_${room.id}`).emit('wp_chat_message', msg);
        }
    }

    // Moderação: Promover / Rebaixar Subdono
    handleToggleSubowner(socket, targetUserId) {
        const roomId = socket.data?.roomId;
        const user = socket.data?.user;
        const room = this.getRoom(roomId);
        if (!room || !user) return;

        const myRole = this.resolveUserRole(room, user.id);
        if (myRole !== 'creator') {
            socket.emit('wp_error', { message: 'Apenas o Criador da sala pode nomear ou remover Subdonos.' });
            return;
        }

        const tId = Number(targetUserId);
        if (tId === Number(room.creatorId)) {
            socket.emit('wp_error', { message: 'O Criador já possui autoridade máxima na sala.' });
            return;
        }

        if (room.subowners.has(tId)) {
            room.subowners.delete(tId);
            this.addSystemMessage(room, `Cargo de Subdono revogado para o usuário.`);
        } else {
            room.subowners.add(tId);
            this.addSystemMessage(room, `Um novo Subdono foi nomeado na sala.`);
        }

        this.broadcastRoomState(room);
    }

    // Moderação: Silenciar / Desmutar
    handleToggleMute(socket, targetUserId) {
        const roomId = socket.data?.roomId;
        const user = socket.data?.user;
        const room = this.getRoom(roomId);
        if (!room || !user) return;

        const myRole = this.resolveUserRole(room, user.id);
        if (myRole !== 'creator' && myRole !== 'subowner') {
            socket.emit('wp_error', { message: 'Apenas o Criador e Subdonos podem silenciar participantes.' });
            return;
        }

        const tId = Number(targetUserId);
        // Trava de segurança: Criador jamais pode ser mutado
        if (tId === Number(room.creatorId)) {
            socket.emit('wp_error', { message: 'O Criador da sala é imune e não pode ser silenciado.' });
            return;
        }

        // Subdono não pode mutar outro Subdono
        if (myRole === 'subowner' && room.subowners.has(tId)) {
            socket.emit('wp_error', { message: 'Subdonos não podem silenciar outros Subdonos.' });
            return;
        }

        if (room.mutedUsers.has(tId)) {
            room.mutedUsers.delete(tId);
            this.addSystemMessage(room, `Usuário foi desmutado.`);
        } else {
            room.mutedUsers.add(tId);
            this.addSystemMessage(room, `Usuário foi silenciado no chat.`);
        }

        this.broadcastRoomState(room);
    }

    // Moderação: Expulsar Usuário
    handleKickUser(socket, targetUserId) {
        const roomId = socket.data?.roomId;
        const user = socket.data?.user;
        const room = this.getRoom(roomId);
        if (!room || !user) return;

        const myRole = this.resolveUserRole(room, user.id);
        if (myRole !== 'creator' && myRole !== 'subowner') {
            socket.emit('wp_error', { message: 'Apenas moderadores podem expulsar participantes.' });
            return;
        }

        const tId = Number(targetUserId);
        // Trava de segurança: Criador jamais pode ser expulso
        if (tId === Number(room.creatorId)) {
            socket.emit('wp_error', { message: 'O Criador da sala é imune e jamais pode ser expulso.' });
            return;
        }

        // Subdono não pode expulsar outro Subdono
        if (myRole === 'subowner' && room.subowners.has(tId)) {
            socket.emit('wp_error', { message: 'Subdonos não podem expulsar outros Subdonos.' });
            return;
        }

        room.bannedUsers.add(tId);

        // Desconecta o usuário expulso
        for (const [sId, p] of room.participants.entries()) {
            if (p.userId && Number(p.userId) === tId) {
                room.participants.delete(sId);
                
                // Registra no histórico com hora de São Paulo
                room.pastParticipants.push({
                    userId: p.userId,
                    nick: p.nick,
                    avatar: p.avatar,
                    role: this.resolveUserRole(room, p.userId),
                    action: 'Expulso da sala',
                    timeSp: this.getSaoPauloTime()
                });

                const targetSocket = this.io.sockets.sockets.get(sId);
                if (targetSocket) {
                    targetSocket.emit('wp_kicked', { message: 'Você foi expulso desta sala.' });
                    targetSocket.leave(`room_${roomId}`);
                }

                this.addSystemMessage(room, `${p.nick} foi expulso da sala.`);
            }
        }

        this.broadcastRoomState(room);
    }

    // Atualiza Configurações da Sala (Privacidade, Senha, Chat, Fila)
    handleUpdateSettings(socket, newSettings) {
        const roomId = socket.data?.roomId;
        const user = socket.data?.user;
        const room = this.getRoom(roomId);
        if (!room || !user) return;

        const myRole = this.resolveUserRole(room, user.id);
        if (myRole !== 'creator' && myRole !== 'subowner') {
            socket.emit('wp_error', { message: 'Apenas o Criador e Subdonos podem alterar configurações.' });
            return;
        }

        if (newSettings.name) {
            room.name = newSettings.name.trim().substring(0, 60);
        }

        if (newSettings.isPrivate !== undefined) {
            room.isPrivate = !!newSettings.isPrivate;
            if (newSettings.password !== undefined) {
                room.password = newSettings.password ? String(newSettings.password).trim() : '';
            }
        }

        room.settings = {
            ...room.settings,
            ...newSettings,
            isPublic: !room.isPrivate
        };

        this.addSystemMessage(room, `Configurações da sala foram atualizadas.`);
        this.broadcastRoomState(room);
    }
}

export const watchPartyService = new WatchPartyService();
