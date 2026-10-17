import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Smartphone, FileArchive, Package, Bell, Send, Radio, Sparkles, Download, ExternalLink, Trash2 } from 'lucide-react';
import './AppUpdatePage.css';

export default function AppUpdatePage() {
    const [subTab, setSubTab] = useState('updates'); // 'updates' | 'notifications'

    // Estado APK Updates
    const [versionName, setVersionName] = useState('');
    const [versionCode, setVersionCode] = useState('');
    const [releaseNotes, setReleaseNotes] = useState('');
    const [forceUpdate, setForceUpdate] = useState(false);
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [history, setHistory] = useState([]);

    // Estado Push Notifications
    const [notifType, setNotifType] = useState('general'); // 'general' | 'content' | 'link' | 'system'
    const [notifTitle, setNotifTitle] = useState('');
    const [notifMessage, setNotifMessage] = useState('');
    const [notifImage, setNotifImage] = useState('');
    const [notifContentId, setNotifContentId] = useState('');
    const [notifMediaType, setNotifMediaType] = useState('movie');
    const [notifActionUrl, setNotifActionUrl] = useState('');
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifFeedback, setNotifFeedback] = useState({ text: '', type: '' });
    const [notifHistory, setNotifHistory] = useState([]);
    const [registeredDevices, setRegisteredDevices] = useState(0);
    
    useEffect(() => {
        fetchHistory();
        fetchNotifHistory();
    }, []);
    
    const fetchHistory = async () => {
        try {
            const token = localStorage.getItem('cinegeek_admin_token') || localStorage.getItem('cinegeek_token');
            const res = await fetch('/api/app-updates/history', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setHistory(data.history || []);
            }
        } catch(e) {
            console.error(e);
        }
    };

    const handleDeleteUpdate = async (id, versionName) => {
        if (!window.confirm(`Tem certeza que deseja apagar o registro da versão v${versionName} e excluir o arquivo APK do servidor?`)) {
            return;
        }

        try {
            const token = localStorage.getItem('cinegeek_admin_token') || localStorage.getItem('cinegeek_token');
            const res = await fetch(`/api/app-updates/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await res.json();
            if (res.ok) {
                setMessage({ text: data.message || 'Atualização apagada com sucesso!', type: 'success' });
                fetchHistory();
            } else {
                setMessage({ text: data.error || 'Erro ao apagar atualização.', type: 'error' });
            }
        } catch(err) {
            setMessage({ text: 'Erro de conexão ao apagar atualização.', type: 'error' });
        }
    };

    const fetchNotifHistory = async () => {
        try {
            const token = localStorage.getItem('cinegeek_admin_token') || localStorage.getItem('cinegeek_token');
            const res = await fetch('/api/app-updates/notifications/history', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setNotifHistory(data.history || []);
                setRegisteredDevices(data.totalDevices || 0);
            }
        } catch(e) {
            console.error(e);
        }
    };

    const handleFileDrop = (e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.name.endsWith('.apk')) {
            setFile(droppedFile);
        } else {
            setMessage({ text: 'Por favor, selecione apenas arquivos .apk', type: 'error' });
        }
    };
    
    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && selectedFile.name.endsWith('.apk')) {
            setFile(selectedFile);
        } else {
            setMessage({ text: 'Por favor, selecione apenas arquivos .apk', type: 'error' });
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) {
            setMessage({ text: 'Por favor, selecione o arquivo .apk.', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage({ text: '', type: '' });

        const formData = new FormData();
        formData.append('apk', file);
        if (versionName) formData.append('version_name', versionName);
        if (versionCode) formData.append('version_code', versionCode);
        formData.append('release_notes', releaseNotes);
        formData.append('force_update', forceUpdate);

        try {
            const token = localStorage.getItem('cinegeek_admin_token') || localStorage.getItem('cinegeek_token');
            const res = await fetch('/api/app-updates/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setMessage({ text: 'Atualização lançada com sucesso!', type: 'success' });
                setVersionName('');
                setVersionCode('');
                setReleaseNotes('');
                setForceUpdate(false);
                setFile(null);
                fetchHistory();
            } else {
                setMessage({ text: data.error || 'Erro ao lançar atualização.', type: 'error' });
            }
        } catch(err) {
            setMessage({ text: 'Erro de conexão.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSendNotification = async (e) => {
        e.preventDefault();
        if (!notifTitle || !notifMessage) {
            setNotifFeedback({ text: 'Título e mensagem são obrigatórios.', type: 'error' });
            return;
        }

        setNotifLoading(true);
        setNotifFeedback({ text: '', type: '' });

        try {
            const token = localStorage.getItem('cinegeek_admin_token') || localStorage.getItem('cinegeek_token');
            const res = await fetch('/api/app-updates/notifications/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: notifTitle,
                    message: notifMessage,
                    image_url: notifImage,
                    notification_type: notifType,
                    content_id: notifType === 'content' ? notifContentId : null,
                    media_type: notifType === 'content' ? notifMediaType : null,
                    action_url: notifType === 'link' ? notifActionUrl : null
                })
            });

            const data = await res.json();
            if (res.ok) {
                setNotifFeedback({ text: `🔔 Notificação enviada! Dispositivos alcançados: ${data.devices_reached}`, type: 'success' });
                setNotifTitle('');
                setNotifMessage('');
                setNotifImage('');
                setNotifContentId('');
                setNotifActionUrl('');
                fetchNotifHistory();
            } else {
                setNotifFeedback({ text: data.error || 'Erro ao enviar notificação.', type: 'error' });
            }
        } catch(err) {
            setNotifFeedback({ text: 'Erro de conexão.', type: 'error' });
        } finally {
            setNotifLoading(false);
        }
    };

    return (
        <div className="app-update-page">
            <div className="app-update-header">
                <Smartphone size={32} color="#00ff88" />
                <div style={{ flex: 1 }}>
                    <h2>Gestão do App Mobile & Notificações</h2>
                    <p>Distribuição de novas versões (OTA) e envio de avisos push para os smartphones dos usuários.</p>
                </div>
                <div className="app-subtabs-nav">
                    <button 
                        className={`app-subtab-btn ${subTab === 'updates' ? 'active' : ''}`}
                        onClick={() => setSubTab('updates')}
                    >
                        <Package size={16} /> Atualizações APK
                    </button>
                    <button 
                        className={`app-subtab-btn ${subTab === 'notifications' ? 'active' : ''}`}
                        onClick={() => setSubTab('notifications')}
                    >
                        <Bell size={16} /> Disparar Notificação
                    </button>
                </div>
            </div>

            {subTab === 'updates' && (
                <>
                    {history.length > 0 && (
                        <div className="current-version-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                            <div className="banner-info">
                                <CheckCircle size={24} color="#00ff88" />
                                <div>
                                    <strong>Versão Atual: v{history[0].version_name}</strong>
                                    <p>Código: {history[0].version_code} • Lançada em {new Date(history[0].created_at).toLocaleDateString('pt-BR')}</p>
                                </div>
                            </div>
                            <a 
                                href={`/downloads/app/${history[0].apk_filename}`}
                                download={history[0].apk_filename}
                                className="btn-download-apk"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    background: 'linear-gradient(135deg, #00ff88 0%, #00d2ff 100%)',
                                    color: '#0b0f14',
                                    padding: '0.65rem 1.25rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.9rem',
                                    textDecoration: 'none',
                                    boxShadow: '0 4px 15px rgba(0, 255, 136, 0.3)',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <Download size={18} />
                                Baixar APK Atual (v{history[0].version_name})
                            </a>
                        </div>
                    )}

                    <div className="app-update-container">
                        <form className="app-update-form" onSubmit={handleUpload}>
                            <h3>Lançar Nova Versão</h3>
                            
                            <div style={{
                                background: 'rgba(0, 255, 136, 0.08)',
                                border: '1px solid rgba(0, 255, 136, 0.25)',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                fontSize: '0.88rem',
                                color: '#cbd5e1'
                            }}>
                                <Sparkles size={20} color="#00ff88" style={{ flexShrink: 0 }} />
                                <div>
                                    <strong style={{ color: '#00ff88' }}>Detecção 100% Automática:</strong>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
                                        A versão (ex: 1.0.2) e o código da versão (ex: 3) são lidos diretamente do <code>AndroidManifest.xml</code> do arquivo APK.
                                    </p>
                                </div>
                            </div>

                            <div 
                                className={`file-drop-zone ${file ? 'has-file' : ''}`}
                                onDragOver={e => e.preventDefault()}
                                onDrop={handleFileDrop}
                                onClick={() => document.getElementById('apk-upload').click()}
                            >
                                <input 
                                    type="file" 
                                    id="apk-upload" 
                                    accept=".apk" 
                                    style={{display: 'none'}} 
                                    onChange={handleFileChange}
                                />
                                {file ? (
                                    <div className="file-selected">
                                        <Package size={48} color="#00ff88" />
                                        <h4>{file.name}</h4>
                                        <p>{(file.size / (1024 * 1024)).toFixed(2)} MB • Pronto para envio</p>
                                    </div>
                                ) : (
                                    <div className="file-placeholder">
                                        <UploadCloud size={48} color="#888" />
                                        <h4>Arraste o arquivo .apk aqui ou clique para selecionar</h4>
                                        <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                                            Versão e Código serão lidos automaticamente
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="form-group">
                                <label>Notas de Lançamento (Changelog)</label>
                                <textarea 
                                    value={releaseNotes} 
                                    onChange={e => setReleaseNotes(e.target.value)}
                                    placeholder="O que há de novo nesta versão? (Ex: Correções de reprodução, novidades na interface...)"
                                    rows={4}
                                ></textarea>
                            </div>

                            <div className="form-group checkbox-group">
                                <label className="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        checked={forceUpdate} 
                                        onChange={e => setForceUpdate(e.target.checked)}
                                    />
                                    <AlertTriangle size={18} color="#ffaa00" style={{marginRight: '8px'}} />
                                    Forçar Atualização (Bloqueia o app se o usuário não atualizar)
                                </label>
                            </div>



                            {message.text && (
                                <div className={`message-banner ${message.type}`}>
                                    {message.text}
                                </div>
                            )}

                            <button type="submit" className="btn-upload" disabled={loading}>
                                {loading ? 'Enviando e Processando...' : 'Publicar Atualização'}
                            </button>
                        </form>

                        <div className="app-history-list">
                            <h3>Histórico de Lançamentos</h3>
                            {history.map(item => (
                                <div key={item.id} className="history-item">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div className="history-version">v{item.version_name} <small>(Code: {item.version_code})</small></div>
                                        {item.force_update === 1 && <span className="badge-force">Forçado</span>}
                                    </div>
                                    <div className="history-date">{new Date(item.created_at).toLocaleString('pt-BR')}</div>
                                    <div className="history-notes">{item.release_notes || 'Sem notas.'}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        <div className="history-filename"><FileArchive size={14}/> {item.apk_filename}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <a 
                                                href={`/downloads/app/${item.apk_filename}`}
                                                download={item.apk_filename}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    background: 'rgba(0, 255, 136, 0.15)',
                                                    border: '1px solid rgba(0, 255, 136, 0.4)',
                                                    color: '#00ff88',
                                                    padding: '5px 12px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: '600',
                                                    textDecoration: 'none',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.3)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0, 255, 136, 0.15)'}
                                            >
                                                <Download size={14} /> Baixar APK
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteUpdate(item.id, item.version_name)}
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
                                                title="Apagar versão e excluir APK do servidor"
                                            >
                                                <Trash2 size={14} /> Apagar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {history.length === 0 && <p style={{color: '#666'}}>Nenhum lançamento registrado.</p>}
                        </div>
                    </div>
                </>
            )}

            {subTab === 'notifications' && (
                <div className="app-notifications-wrapper">
                    <div className="current-version-banner" style={{ borderColor: 'rgba(0, 210, 255, 0.4)', background: 'rgba(0, 210, 255, 0.08)' }}>
                        <div className="banner-info">
                            <Radio size={24} color="#00d2ff" />
                            <div>
                                <strong style={{ color: '#00d2ff' }}>Dispositivos Conectados: {registeredDevices}</strong>
                                <p>Todos os smartphones com o app instalado e token registrado receberão as mensagens disparadas aqui.</p>
                            </div>
                        </div>
                    </div>

                    <div className="app-update-container">
                        <form className="app-update-form" onSubmit={handleSendNotification}>
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Send size={20} color="#00ff88" /> Nova Mensagem Push
                            </h3>

                            <div className="form-group">
                                <label>Tipo de Notificação</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                                    {[
                                        { id: 'general', label: '📢 Comunicado Geral' },
                                        { id: 'content', label: '🎬 Novo Conteúdo' },
                                        { id: 'link', label: '🔗 Link Externo' },
                                        { id: 'system', label: '⚙️ Aviso / Manutenção' },
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setNotifType(t.id)}
                                            style={{
                                                background: notifType === t.id ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 0, 0, 0.4)',
                                                border: notifType === t.id ? '1px solid #00ff88' : '1px solid rgba(255, 255, 255, 0.1)',
                                                color: notifType === t.id ? '#00ff88' : '#cbd5e1',
                                                padding: '8px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                fontWeight: notifType === t.id ? 'bold' : 'normal'
                                            }}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Título da Notificação *</label>
                                <input 
                                    type="text" 
                                    value={notifTitle} 
                                    onChange={e => setNotifTitle(e.target.value)} 
                                    required 
                                    placeholder={
                                        notifType === 'content' ? "Ex: Novo Filme Adicionado! 🍿" :
                                        notifType === 'system' ? "Ex: Manutenção Programada ⚙️" :
                                        notifType === 'link' ? "Ex: Entre no nosso Grupo VIP! 🚀" :
                                        "Ex: Recado importante para todos os usuários! 📢"
                                    }
                                />
                            </div>

                            <div className="form-group">
                                <label>Mensagem / Conteúdo do Alerta *</label>
                                <textarea 
                                    value={notifMessage} 
                                    onChange={e => setNotifMessage(e.target.value)}
                                    placeholder="Digite a mensagem que aparecerá na barra de notificações do celular do usuário..."
                                    rows={4}
                                    required
                                ></textarea>
                            </div>

                            {notifType === 'content' && (
                                <div className="form-group-row">
                                    <div className="form-group">
                                        <label>TMDB ID (Abre a mídia diretamente no App)</label>
                                        <input 
                                            type="text" 
                                            value={notifContentId} 
                                            onChange={e => setNotifContentId(e.target.value)} 
                                            placeholder="Ex: 108978"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Tipo de Mídia</label>
                                        <select 
                                            value={notifMediaType} 
                                            onChange={e => setNotifMediaType(e.target.value)}
                                            style={{
                                                background: 'rgba(0, 0, 0, 0.5)',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                padding: '0.8rem',
                                                borderRadius: '6px',
                                                color: '#fff'
                                            }}
                                        >
                                            <option value="movie">Filme</option>
                                            <option value="tv">Série</option>
                                            <option value="anime">Anime</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {notifType === 'link' && (
                                <div className="form-group">
                                    <label>Link de Destino (URL ao clicar na notificação)</label>
                                    <input 
                                        type="url" 
                                        value={notifActionUrl} 
                                        onChange={e => setNotifActionUrl(e.target.value)} 
                                        placeholder="https://t.me/seucanal ou https://cinegeek.shop"
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label>URL da Imagem / Banner (Opcional)</label>
                                <input 
                                    type="text" 
                                    value={notifImage} 
                                    onChange={e => setNotifImage(e.target.value)} 
                                    placeholder="https://image.tmdb.org/t/p/w500/exemplo.jpg"
                                />
                            </div>

                            {notifFeedback.text && (
                                <div className={`message-banner ${notifFeedback.type}`}>
                                    {notifFeedback.text}
                                </div>
                            )}

                            <button type="submit" className="btn-upload" disabled={notifLoading} style={{ background: 'linear-gradient(135deg, #00d2ff 0%, #00ff88 100%)' }}>
                                {notifLoading ? 'Disparando...' : '🚀 Enviar Notificação para Todos os Celulares'}
                            </button>
                        </form>

                        <div className="app-history-list">
                            <h3>Histórico de Notificações Enviadas</h3>
                            {notifHistory.map(item => (
                                <div key={item.id} className="history-item">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div className="history-version" style={{ color: '#00d2ff' }}>
                                            🔔 {item.title}
                                        </div>
                                        <span style={{ 
                                            fontSize: '0.72rem', 
                                            padding: '2px 8px', 
                                            borderRadius: '12px', 
                                            background: 'rgba(255, 255, 255, 0.08)',
                                            color: '#94a3b8',
                                            textTransform: 'uppercase'
                                        }}>
                                            {item.notification_type || 'geral'}
                                        </span>
                                    </div>
                                    <div className="history-date">{new Date(item.created_at).toLocaleString('pt-BR')}</div>
                                    <div className="history-notes">{item.message}</div>
                                    {item.content_id && (
                                        <div className="history-filename" style={{ color: '#00ff88' }}>
                                            🔗 Abre: TMDB #{item.content_id} ({item.media_type})
                                        </div>
                                    )}
                                    {item.action_url && (
                                        <div className="history-filename" style={{ color: '#00d2ff' }}>
                                            🌐 Link: {item.action_url}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {notifHistory.length === 0 && <p style={{color: '#666'}}>Nenhuma notificação enviada ainda.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
