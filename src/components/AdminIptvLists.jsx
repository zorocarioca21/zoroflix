import React, { useState, useEffect } from 'react';
import { Tv, UploadCloud, Trash2, CheckCircle, AlertTriangle, FileText, Layers, Radio, Sparkles } from 'lucide-react';

export default function AdminIptvLists({ token }) {
    const [lists, setLists] = useState([]);
    const [totalChannels, setTotalChannels] = useState(0);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    // Formulário de Envio
    const [listName, setListName] = useState('');
    const [vipBadge, setVipBadge] = useState('VIP 2');
    const [customBadge, setCustomBadge] = useState('');
    const [m3uFile, setM3uFile] = useState(null);
    const [m3uText, setM3uText] = useState('');
    const [inputMode, setInputMode] = useState('file'); // 'file' | 'text'

    useEffect(() => {
        fetchLists();
    }, []);

    const fetchLists = async () => {
        try {
            const adminToken = token || localStorage.getItem('cinegeek_admin_token') || localStorage.getItem('cinegeek_token');
            const res = await fetch('/api/iptv/admin/lists', {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLists(data.lists || []);
                setTotalChannels(data.totalChannels || 0);
            }
        } catch (e) {
            console.error('Erro ao buscar listas IPTV:', e);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file && (file.name.endsWith('.m3u') || file.name.endsWith('.m3u8') || file.name.endsWith('.txt'))) {
            setM3uFile(file);
            if (!listName) {
                // Sugere o nome do arquivo sem extensão como nome da lista
                setListName(file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').toUpperCase());
            }
        } else {
            setMessage({ text: 'Por favor, selecione um arquivo válido .m3u ou .m3u8', type: 'error' });
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        const effectiveBadge = vipBadge === 'CUSTOM' ? customBadge.trim().toUpperCase() : vipBadge;

        if (!listName.trim()) {
            setMessage({ text: 'Informe um nome para identificar a lista.', type: 'error' });
            return;
        }

        if (!effectiveBadge) {
            setMessage({ text: 'Defina o selo VIP desejado (ex: VIP 2, VIP 3).', type: 'error' });
            return;
        }

        if (inputMode === 'file' && !m3uFile) {
            setMessage({ text: 'Selecione um arquivo .m3u para enviar.', type: 'error' });
            return;
        }

        if (inputMode === 'text' && !m3uText.trim()) {
            setMessage({ text: 'Cole o conteúdo M3U no campo de texto.', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage({ text: '', type: '' });

        try {
            const adminToken = token || localStorage.getItem('cinegeek_admin_token') || localStorage.getItem('cinegeek_token');
            let res;

            if (inputMode === 'file') {
                const formData = new FormData();
                formData.append('m3u', m3uFile);
                formData.append('list_name', listName.trim());
                formData.append('vip_badge', effectiveBadge);

                res = await fetch('/api/iptv/admin/upload', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${adminToken}` },
                    body: formData
                });
            } else {
                res = await fetch('/api/iptv/admin/upload', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${adminToken}`
                    },
                    body: JSON.stringify({
                        list_name: listName.trim(),
                        vip_badge: effectiveBadge,
                        m3u_text: m3uText
                    })
                });
            }

            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Lista importada com sucesso!', type: 'success' });
                setListName('');
                setM3uFile(null);
                setM3uText('');
                fetchLists();
            } else {
                setMessage({ text: data.error || 'Erro ao importar lista.', type: 'error' });
            }
        } catch (err) {
            setMessage({ text: 'Erro de conexão ao enviar a lista.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteList = async (id, name) => {
        if (!window.confirm(`Tem certeza que deseja apagar a lista "${name}" e todos os canais cadastrados nela?`)) {
            return;
        }

        try {
            const adminToken = token || localStorage.getItem('cinegeek_admin_token') || localStorage.getItem('cinegeek_token');
            const res = await fetch(`/api/iptv/admin/lists/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Lista excluída com sucesso!', type: 'success' });
                fetchLists();
            } else {
                setMessage({ text: data.error || 'Erro ao excluir lista.', type: 'error' });
            }
        } catch (e) {
            setMessage({ text: 'Erro de conexão.', type: 'error' });
        }
    };

    return (
        <div className="admin-iptv-manager" style={{ padding: '0.5rem', color: '#fff' }}>
            <div className="app-update-header" style={{ marginBottom: '1.5rem' }}>
                <Tv size={32} color="#00ff88" />
                <div style={{ flex: 1 }}>
                    <h2>Gerenciador de Listas de Canais IPTV (M3U)</h2>
                    <p>Envie arquivos .m3u de canais com segurança. Os links ficam salvos no banco local e nunca são expostos no GitHub.</p>
                </div>
            </div>

            <div className="current-version-banner" style={{ borderColor: 'rgba(0, 255, 136, 0.3)', background: 'rgba(0, 255, 136, 0.06)', marginBottom: '1.5rem' }}>
                <div className="banner-info" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <CheckCircle size={26} color="#00ff88" />
                    <div>
                        <strong style={{ fontSize: '1.15rem', color: '#00ff88' }}>
                            {totalChannels} Canais Ativos Cadastrados
                        </strong>
                        <p style={{ margin: '3px 0 0 0', color: '#94a3b8', fontSize: '0.85rem' }}>
                            Distribuídos em {lists.length} listas personalizadas com proteção anti-exposição.
                        </p>
                    </div>
                </div>
            </div>

            <div className="app-update-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* FORMULÁRIO DE UPLOAD */}
                <form className="app-update-form" onSubmit={handleUpload}>
                    <h3>Importar Nova Lista M3U</h3>

                    <div className="form-group">
                        <label>Nome de Identificação da Lista *</label>
                        <input 
                            type="text" 
                            value={listName} 
                            onChange={e => setListName(e.target.value)} 
                            placeholder="Ex: Max Net TV (400 Canais) ou IPTV BR"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Selo VIP de Acesso *</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                            {['VIP', 'VIP 2', 'VIP 3', 'CUSTOM'].map(badge => (
                                <button
                                    key={badge}
                                    type="button"
                                    onClick={() => setVipBadge(badge)}
                                    style={{
                                        background: vipBadge === badge ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 0, 0, 0.4)',
                                        border: vipBadge === badge ? '1px solid #00ff88' : '1px solid rgba(255, 255, 255, 0.1)',
                                        color: vipBadge === badge ? '#00ff88' : '#cbd5e1',
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        fontWeight: vipBadge === badge ? 'bold' : 'normal'
                                    }}
                                >
                                    {badge === 'CUSTOM' ? 'Outro...' : badge}
                                </button>
                            ))}
                        </div>
                    </div>

                    {vipBadge === 'CUSTOM' && (
                        <div className="form-group">
                            <label>Digite o Nome do Selo Personalizado</label>
                            <input 
                                type="text" 
                                value={customBadge} 
                                onChange={e => setCustomBadge(e.target.value)} 
                                placeholder="Ex: VIP PLUS, OURO, PREMIUM"
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label>Forma de Entrada</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setInputMode('file')}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: inputMode === 'file' ? '1px solid #00ff88' : '1px solid rgba(255, 255, 255, 0.1)',
                                    background: inputMode === 'file' ? 'rgba(0, 255, 136, 0.15)' : 'rgba(0, 0, 0, 0.4)',
                                    color: inputMode === 'file' ? '#00ff88' : '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                📁 Arquivo .M3U
                            </button>
                            <button
                                type="button"
                                onClick={() => setInputMode('text')}
                                style={{
                                    flex: 1,
                                    padding: '8px',
                                    borderRadius: '6px',
                                    border: inputMode === 'text' ? '1px solid #00ff88' : '1px solid rgba(255, 255, 255, 0.1)',
                                    background: inputMode === 'text' ? 'rgba(0, 255, 136, 0.15)' : 'rgba(0, 0, 0, 0.4)',
                                    color: inputMode === 'text' ? '#00ff88' : '#94a3b8',
                                    cursor: 'pointer'
                                }}
                            >
                                📝 Colar Texto M3U
                            </button>
                        </div>
                    </div>

                    {inputMode === 'file' ? (
                        <div 
                            className={`file-drop-zone ${m3uFile ? 'has-file' : ''}`}
                            onClick={() => document.getElementById('m3u-file-input').click()}
                            style={{ cursor: 'pointer', textAlign: 'center', padding: '2rem' }}
                        >
                            <input 
                                type="file" 
                                id="m3u-file-input" 
                                accept=".m3u,.m3u8,.txt" 
                                style={{ display: 'none' }} 
                                onChange={handleFileChange}
                            />
                            {m3uFile ? (
                                <div className="file-selected">
                                    <FileText size={48} color="#00ff88" />
                                    <h4>{m3uFile.name}</h4>
                                    <p>{(m3uFile.size / 1024).toFixed(1)} KB • Pronto para importar</p>
                                </div>
                            ) : (
                                <div className="file-placeholder">
                                    <UploadCloud size={48} color="#888" />
                                    <h4>Clique para selecionar o arquivo .m3u / .m3u8</h4>
                                    <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                                        Ex: maxnet_lista.m3u ou iptvbr_lista.m3u
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="form-group">
                            <label>Conteúdo M3U (Cole aqui)</label>
                            <textarea 
                                value={m3uText} 
                                onChange={e => setM3uText(e.target.value)}
                                placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo=&quot;...&quot; group-title=&quot;Abertos&quot;,Canal 1&#10;http://link.com/live.m3u8"
                                rows={8}
                            ></textarea>
                        </div>
                    )}

                    {message.text && (
                        <div className={`message-banner ${message.type}`}>
                            {message.text}
                        </div>
                    )}

                    <button type="submit" className="btn-upload" disabled={loading} style={{ background: 'linear-gradient(135deg, #00ff88 0%, #00d2ff 100%)', color: '#0b0f14', fontWeight: 'bold' }}>
                        {loading ? 'Importando e Processando Canais...' : '🚀 Importar Lista de Canais Agora'}
                    </button>
                </form>

                {/* LISTAGEM DE LISTAS CADASTRADAS */}
                <div className="app-history-list">
                    <h3>Listas M3U Cadastradas</h3>
                    {lists.map(list => (
                        <div key={list.id} className="history-item">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div className="history-version" style={{ color: '#00ff88', fontSize: '1.1rem' }}>
                                    📺 {list.name}
                                </div>
                                <span style={{
                                    fontSize: '0.75rem',
                                    padding: '3px 10px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(45deg, #00ff88, #00d2ff)',
                                    color: '#000',
                                    fontWeight: 'bold',
                                    textTransform: 'uppercase'
                                }}>
                                    {list.vip_badge}
                                </span>
                            </div>
                            <div className="history-date">
                                Cadastrada em {new Date(list.created_at).toLocaleString('pt-BR')}
                            </div>
                            <div className="history-notes" style={{ color: '#cbd5e1' }}>
                                📊 Total de Canais: <b>{list.channel_count}</b> canais disponíveis nesta lista.
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteList(list.id, list.name)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        color: '#ef4444',
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                                    title="Excluir lista e remover todos os canais dela"
                                >
                                    <Trash2 size={14} /> Excluir Lista
                                </button>
                            </div>
                        </div>
                    ))}
                    {lists.length === 0 && (
                        <p style={{ color: '#666', textAlign: 'center', marginTop: '2rem' }}>
                            Nenhuma lista cadastrada ainda. Envie o arquivo M3U ao lado para começar!
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
