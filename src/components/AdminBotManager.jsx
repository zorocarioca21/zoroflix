import React, { useState, useEffect } from 'react';
import { Bot, RefreshCcw, LogIn, Save, CheckCircle, AlertTriangle } from 'lucide-react';

export default function AdminBotManager({ token }) {
    const [dialogs, setDialogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [inviteLink, setInviteLink] = useState('');
    const [joining, setJoining] = useState(false);

    const fetchDialogs = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/bot-manager/dialogs', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.chats) setDialogs(data.chats);
        } catch (e) {
            console.error('Erro ao buscar canais:', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchDialogs();
    }, []);

    const handleJoinChannel = async (e) => {
        e.preventDefault();
        if (!inviteLink) return;
        setJoining(true);
        try {
            const res = await fetch('/api/bot-manager/join', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ inviteLink })
            });
            const data = await res.json();
            if (res.ok) {
                window.alert('Bot entrou no canal com sucesso!');
                setInviteLink('');
                fetchDialogs();
            } else {
                window.alert(data.error || 'Erro ao entrar');
            }
        } catch (e) {
            window.alert('Falha na comunicação com o servidor');
        }
        setJoining(false);
    };

    const handleSetEnv = async (key, value) => {
        const ok = window.confirm(`Deseja definir ${key} como ${value} no arquivo .env?`);
        if (!ok) return;

        try {
            const res = await fetch('/api/bot-manager/set-env', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ key, value })
            });
            if (res.ok) {
                window.alert('Configuração salva com sucesso! O ID já está pronto para uso.');
            } else {
                window.alert('Erro ao salvar no .env');
            }
        } catch (e) {
            window.alert('Falha de conexão');
        }
    };

    return (
        <div style={{ padding: '2rem', color: '#fff' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <Bot size={28} color="#00ff88" />
                Gerenciador do Bot (Telegram)
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
                {/* Lado Esquerdo: Ações */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    {/* Card de Convite */}
                    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <LogIn size={18} /> Fazer o Bot Entrar em um Canal
                        </h3>
                        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem' }}>
                            Cole o link de convite privado de um canal e o Bot entrará automaticamente.
                        </p>
                        <form onSubmit={handleJoinChannel} style={{ display: 'flex', gap: '0.5rem' }}>
                            <input 
                                type="text" 
                                value={inviteLink}
                                onChange={e => setInviteLink(e.target.value)}
                                placeholder="https://t.me/+ExemploHash..." 
                                style={{ flex: 1, padding: '0.8rem', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff' }}
                            />
                            <button type="submit" disabled={joining} style={{ background: '#00ff88', color: '#000', border: 'none', padding: '0 1rem', borderRadius: '6px', fontWeight: 'bold', cursor: joining ? 'not-allowed' : 'pointer' }}>
                                {joining ? 'Entrando...' : 'Entrar'}
                            </button>
                        </form>
                    </div>

                    <div style={{ background: 'rgba(255, 170, 0, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255, 170, 0, 0.2)' }}>
                        <h3 style={{ margin: '0 0 0.5rem 0', color: '#ffaa00', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <AlertTriangle size={18} /> Aviso sobre Mangás
                        </h3>
                        <p style={{ color: '#ccc', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                            Para configurar o canal de Mangás e HQs, crie um canal no Telegram, use o bloco acima para fazer o Bot entrar nele. Em seguida, encontre o canal na lista ao lado e clique em <b>"Definir como Mangas DB"</b>.
                        </p>
                    </div>

                </div>

                {/* Lado Direito: Lista de Canais */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Canais e Grupos Atuais</h3>
                        <button onClick={fetchDialogs} disabled={loading} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', padding: '0.4rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                            <RefreshCcw size={14} className={loading ? 'spin' : ''} />
                            Atualizar
                        </button>
                    </div>

                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                        {dialogs.length === 0 && !loading && (
                            <p style={{ color: '#888', textAlign: 'center', padding: '2rem' }}>O bot não está em nenhum canal/grupo no momento.</p>
                        )}
                        {dialogs.map(chat => (
                            <div key={chat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 0.3rem 0' }}>{chat.title}</h4>
                                    <div style={{ display: 'flex', gap: '1rem', color: '#888', fontSize: '0.85rem' }}>
                                        <span>ID: {chat.id}</span>
                                        <span>Tipo: {chat.isChannel ? 'Canal' : 'Grupo'}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button 
                                        onClick={() => handleSetEnv('TELEGRAM_CHANNEL_ID', chat.id)}
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                        title="Usa este canal para Sincronização de Filmes"
                                    >
                                        Setar Filmes DB
                                    </button>
                                    <button 
                                        onClick={() => handleSetEnv('TELEGRAM_MANGA_CHANNEL_ID', chat.id)}
                                        style={{ background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                                        title="Usa este canal para guardar Mangás e HQs"
                                    >
                                        Setar Mangas DB
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
