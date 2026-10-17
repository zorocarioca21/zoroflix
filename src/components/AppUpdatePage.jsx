import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Smartphone, FileArchive, Package, Bell, Send, Radio, Sparkles } from 'lucide-react';
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
    const [notifTitle, setNotifTitle] = useState('');
    const [notifMessage, setNotifMessage] = useState('');
    const [notifImage, setNotifImage] = useState('');
    const [notifContentId, setNotifContentId] = useState('');
    const [notifMediaType, setNotifMediaType] = useState('movie');
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
        if (!file || !versionName || !versionCode) {
            setMessage({ text: 'Preencha os campos obrigatórios e selecione o arquivo.', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage({ text: '', type: '' });

        const formData = new FormData();
        formData.append('apk', file);
        formData.append('version_name', versionName);
        formData.append('version_code', versionCode);
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
                    content_id: notifContentId,
                    media_type: notifMediaType
                })
            });

            const data = await res.json();
            if (res.ok) {
                setNotifFeedback({ text: `🔔 Notificação enviada! Dispositivos alcançados: ${data.devices_reached}`, type: 'success' });
                setNotifTitle('');
                setNotifMessage('');
                setNotifImage('');
                setNotifContentId('');
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
                        <div className="current-version-banner">
                            <div className="banner-info">
                                <CheckCircle size={24} color="#00ff88" />
                                <div>
                                    <strong>Versão Atual: v{history[0].version_name}</strong>
                                    <p>Código: {history[0].version_code} • Lançada em {new Date(history[0].created_at).toLocaleDateString('pt-BR')}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="app-update-container">
                        <form className="app-update-form" onSubmit={handleUpload}>
                            <h3>Lançar Nova Versão</h3>
                            
                            <div className="form-group-row">
                                <div className="form-group">
                                    <label>Nome da Versão (ex: 1.0.5)</label>
                                    <input 
                                        type="text" 
                                        value={versionName} 
                                        onChange={e => setVersionName(e.target.value)} 
                                        required 
                                        placeholder="1.0.5"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Código da Versão (ex: 5)</label>
                                    <input 
                                        type="number" 
                                        value={versionCode} 
                                        onChange={e => setVersionCode(e.target.value)} 
                                        required 
                                        placeholder="5"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Notas de Lançamento (Changelog)</label>
                                <textarea 
                                    value={releaseNotes} 
                                    onChange={e => setReleaseNotes(e.target.value)}
                                    placeholder="O que há de novo nesta versão?"
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
                                    Forçar Atualização (Impede o uso de versões anteriores)
                                </label>
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
                                        <p>{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                                    </div>
                                ) : (
                                    <div className="file-placeholder">
                                        <UploadCloud size={48} color="#888" />
                                        <h4>Arraste o arquivo .apk aqui ou clique para selecionar</h4>
                                    </div>
                                )}
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
                                    <div className="history-version">v{item.version_name} <small>(Code: {item.version_code})</small></div>
                                    <div className="history-date">{new Date(item.created_at).toLocaleString('pt-BR')}</div>
                                    <div className="history-notes">{item.release_notes || 'Sem notas.'}</div>
                                    {item.force_update === 1 && <span className="badge-force">Forçado</span>}
                                    <div className="history-filename"><FileArchive size={14}/> {item.apk_filename}</div>
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
                                <label>Título da Notificação *</label>
                                <input 
                                    type="text" 
                                    value={notifTitle} 
                                    onChange={e => setNotifTitle(e.target.value)} 
                                    required 
                                    placeholder="Ex: Novo Filme Adicionado! 🍿"
                                />
                            </div>

                            <div className="form-group">
                                <label>Mensagem / Conteúdo do Alerta *</label>
                                <textarea 
                                    value={notifMessage} 
                                    onChange={e => setNotifMessage(e.target.value)}
                                    placeholder="Ex: O novo episódio de Reacher acabou de sair com qualidade Full HD. Venha conferir!"
                                    rows={4}
                                    required
                                ></textarea>
                            </div>

                            <div className="form-group-row">
                                <div className="form-group">
                                    <label>TMDB ID (Opcional - Abre a mídia no App)</label>
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
                                    <div className="history-version" style={{ color: '#00d2ff' }}>
                                        🔔 {item.title}
                                    </div>
                                    <div className="history-date">{new Date(item.created_at).toLocaleString('pt-BR')}</div>
                                    <div className="history-notes">{item.message}</div>
                                    {item.content_id && (
                                        <div className="history-filename" style={{ color: '#00ff88' }}>
                                            🔗 Abre: TMDB #{item.content_id} ({item.media_type})
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
