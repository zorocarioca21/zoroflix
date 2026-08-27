import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Smartphone, FileArchive, Package } from 'lucide-react';
import './AppUpdatePage.css';

export default function AppUpdatePage() {
    const [versionName, setVersionName] = useState('');
    const [versionCode, setVersionCode] = useState('');
    const [releaseNotes, setReleaseNotes] = useState('');
    const [forceUpdate, setForceUpdate] = useState(false);
    const [file, setFile] = useState(null);
    
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [history, setHistory] = useState([]);
    
    useEffect(() => {
        fetchHistory();
    }, []);
    
    const fetchHistory = async () => {
        try {
            const token = localStorage.getItem('cinegeek_admin_token');
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
            const token = localStorage.getItem('cinegeek_admin_token');
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

    return (
        <div className="app-update-page">
            <div className="app-update-header">
                <Smartphone size={32} color="#00ff88" />
                <div>
                    <h2>Atualização do Aplicativo Móvel</h2>
                    <p>Faça o upload do APK nativo para distribuição (OTA) automática.</p>
                </div>
            </div>

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
        </div>
    );
}
