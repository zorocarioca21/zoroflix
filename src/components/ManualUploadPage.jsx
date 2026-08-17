import React, { useState } from 'react';
import { HardDriveDownload, UploadCloud, X, Film, CheckCircle2 } from 'lucide-react';
import './ManualUploadPage.css';

export default function ManualUploadPage() {
    const [manualUpload, setManualUpload] = useState({ title: '', file: null, progress: 0, status: 'idle', error: null });
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setManualUpload(prev => ({ ...prev, file: e.target.files[0], status: 'idle', error: null }));
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile.type.startsWith('video/') || droppedFile.name.endsWith('.mkv') || droppedFile.name.endsWith('.ts')) {
                setManualUpload(prev => ({ ...prev, file: droppedFile, status: 'idle', error: null }));
            } else {
                setManualUpload(prev => ({ ...prev, error: 'Por favor, selecione um arquivo de vídeo válido.' }));
            }
        }
    };

    const clearFile = () => {
        setManualUpload(prev => ({ ...prev, file: null, status: 'idle', error: null }));
        const input = document.getElementById('manual-file-input-new');
        if (input) input.value = '';
    };

    const handleManualUpload = async () => {
        if (!manualUpload.title || !manualUpload.file) {
            setManualUpload(prev => ({ ...prev, error: "Preencha o título e selecione um arquivo de vídeo." }));
            return;
        }

        setManualUpload(prev => ({ ...prev, status: 'uploading', progress: 0, error: null }));

        const formData = new FormData();
        formData.append('title', manualUpload.title);
        formData.append('video', manualUpload.file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/sync/manual-upload', true);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                setManualUpload(prev => ({ ...prev, progress: percent }));
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                setManualUpload({ title: '', file: null, progress: 100, status: 'success', error: null });
                const input = document.getElementById('manual-file-input-new');
                if (input) input.value = '';
                
                setTimeout(() => {
                    setManualUpload(prev => ({ ...prev, status: 'idle', progress: 0 }));
                }, 4000);
            } else {
                let errorMsg = xhr.responseText;
                try { errorMsg = JSON.parse(xhr.responseText).error; } catch(e){}
                setManualUpload(prev => ({ ...prev, status: 'error', error: "Erro no upload: " + errorMsg }));
            }
        };

        xhr.onerror = () => {
            setManualUpload(prev => ({ ...prev, status: 'error', error: "Erro de conexão durante o upload." }));
        };

        xhr.send(formData);
    };

    return (
        <div className="manual-upload-container">
            <div className="manual-upload-header">
                <h1>
                    <HardDriveDownload size={32} className="header-icon" />
                    Upload Manual de Mídia
                </h1>
                <p>Envie arquivos de filmes ou episódios diretamente para a esteira do bot do Telegram.</p>
            </div>

            <div className="manual-upload-card">
                
                {manualUpload.error && (
                    <div className="upload-alert error">
                        {manualUpload.error}
                    </div>
                )}

                {manualUpload.status === 'success' && (
                    <div className="upload-alert success">
                        <CheckCircle2 size={20} />
                        Upload enviado com sucesso! O bot irá processar o arquivo em breve.
                    </div>
                )}

                <div className="form-group">
                    <label>Título do Filme ou Episódio</label>
                    <input 
                        type="text" 
                        placeholder="Ex: Matrix (1999) ou A Casa do Dragão S02E01"
                        value={manualUpload.title}
                        onChange={(e) => setManualUpload({...manualUpload, title: e.target.value})}
                        disabled={manualUpload.status === 'uploading'}
                        className="title-input"
                    />
                </div>

                <div className="form-group">
                    <label>Arquivo de Vídeo</label>
                    <div 
                        className={`drag-drop-zone ${isDragging ? 'dragging' : ''} ${manualUpload.file ? 'has-file' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {!manualUpload.file ? (
                            <div className="drop-content">
                                <UploadCloud size={48} className="drop-icon" />
                                <h3>Arraste e solte o vídeo aqui</h3>
                                <span>ou</span>
                                <button type="button" className="browse-btn" onClick={() => document.getElementById('manual-file-input-new').click()}>
                                    Procurar Arquivo
                                </button>
                                <p className="file-hint">Formatos suportados: MP4, MKV, TS</p>
                            </div>
                        ) : (
                            <div className="selected-file-card">
                                <Film size={36} className="file-icon" />
                                <div className="file-info">
                                    <span className="file-name">{manualUpload.file.name}</span>
                                    <span className="file-size">{(manualUpload.file.size / (1024 * 1024)).toFixed(2)} MB</span>
                                </div>
                                {manualUpload.status !== 'uploading' && (
                                    <button type="button" className="clear-file-btn" onClick={clearFile} title="Remover arquivo">
                                        <X size={20} />
                                    </button>
                                )}
                            </div>
                        )}
                        <input 
                            type="file" 
                            id="manual-file-input-new"
                            accept="video/*,.mkv,.ts"
                            onChange={handleFileChange}
                            disabled={manualUpload.status === 'uploading'}
                            style={{ display: 'none' }}
                        />
                    </div>
                </div>

                <div className="upload-actions">
                    <button 
                        onClick={handleManualUpload}
                        disabled={manualUpload.status === 'uploading' || !manualUpload.file || !manualUpload.title}
                        className={`submit-btn ${manualUpload.status === 'uploading' ? 'uploading' : ''}`}
                    >
                        {manualUpload.status === 'uploading' ? 'Enviando...' : 'Iniciar Upload'}
                    </button>
                </div>

                {manualUpload.status === 'uploading' && (
                    <div className="progress-container">
                        <div className="progress-header">
                            <span>Enviando arquivo para o servidor...</span>
                            <span className="progress-percent">{manualUpload.progress}%</span>
                        </div>
                        <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${manualUpload.progress}%` }} />
                        </div>
                        <small className="progress-hint">Por favor, aguarde e não feche esta página até a conclusão.</small>
                    </div>
                )}
            </div>
        </div>
    );
}
