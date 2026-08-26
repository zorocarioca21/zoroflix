import React, { useState, useEffect } from 'react';
import { HardDriveDownload, UploadCloud, X, Film, CheckCircle2, Clapperboard, Tv } from 'lucide-react';
import './ManualUploadPage.css';

export default function ManualUploadPage() {
    const [manualUpload, setManualUpload] = useState({ 
        type: 'filme', // 'filme' | 'serie'
        
        // Filme fields
        movieTitle: '', 
        movieYear: '', 
        
        // Serie fields
        serieTitle: '',
        season: '',
        episode: '',

        // Shared fields
        quality: 'FHD',
        language: 'Dublado',

        // System state
        title: '', 
        file: null, 
        progress: 0, 
        status: 'idle', 
        error: null 
    });

    const [isDragging, setIsDragging] = useState(false);

    // Auto-generate title based on inputs
    useEffect(() => {
        let generated = '';
        if (manualUpload.type === 'filme') {
            const yearStr = manualUpload.movieYear ? ` (${manualUpload.movieYear})` : '';
            if (manualUpload.movieTitle) {
                generated = `${manualUpload.movieTitle.trim()}${yearStr} ${manualUpload.quality} ${manualUpload.language}`;
            }
        } else {
            if (manualUpload.serieTitle) {
                const s = manualUpload.season ? manualUpload.season.toString().padStart(2, '0') : '01';
                const e = manualUpload.episode ? manualUpload.episode.toString().padStart(2, '0') : '01';
                generated = `${manualUpload.serieTitle.trim()} S${s} E${e} ${manualUpload.quality} ${manualUpload.language}`;
            }
        }
        setManualUpload(prev => ({ ...prev, title: generated }));
    }, [manualUpload.type, manualUpload.movieTitle, manualUpload.movieYear, manualUpload.serieTitle, manualUpload.season, manualUpload.episode, manualUpload.quality, manualUpload.language]);


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
            if (droppedFile.type.startsWith('video/') || droppedFile.name.endsWith('.mkv')) {
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
            setManualUpload(prev => ({ ...prev, error: "Preencha os campos e selecione um arquivo de vídeo." }));
            return;
        }

        setManualUpload(prev => ({ ...prev, status: 'uploading', progress: 0, error: null }));

        const file = manualUpload.file;
        const chunkSize = 50 * 1024 * 1024; // 50MB
        const totalChunks = Math.ceil(file.size / chunkSize);
        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const originalExt = file.name.split('.').pop() || 'mp4';

        try {
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append('chunk', chunk, 'chunk.bin');
                formData.append('fileName', fileName);
                formData.append('chunkIndex', i);

                const response = await fetch('/api/sync/manual-upload/chunk', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`Erro ao enviar a parte ${i + 1} do vídeo`);
                }

                const progress = Math.round(((i + 1) / totalChunks) * 100);
                setManualUpload(prev => ({ ...prev, progress }));
            }

            const finalizeRes = await fetch('/api/sync/manual-upload/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName,
                    title: manualUpload.title, // Envia o título gerado automaticamente
                    originalExt,
                    totalSize: file.size
                })
            });

            if (!finalizeRes.ok) {
                const errData = await finalizeRes.json();
                throw new Error(errData.error || 'Erro ao finalizar upload');
            }

            setManualUpload(prev => ({ ...prev, movieTitle: '', serieTitle: '', file: null, progress: 100, status: 'success', error: null }));
            const input = document.getElementById('manual-file-input-new');
            if (input) input.value = '';
            
            setTimeout(() => {
                setManualUpload(prev => ({ ...prev, status: 'idle', progress: 0 }));
            }, 4000);

        } catch (error) {
            console.error("Erro no chunked upload:", error);
            setManualUpload(prev => ({ ...prev, status: 'error', error: "Erro no upload: " + error.message }));
        }
    };

    return (
        <div className="manual-upload-container">
            <div className="manual-upload-header">
                <h1>
                    <HardDriveDownload size={32} className="header-icon" />
                    Upload Manual de Mídia
                </h1>
                <p>Envie arquivos com nomenclatura padronizada direto para a esteira do bot.</p>
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

                {/* TIPO DE MÍDIA TOGGLE */}
                <div className="type-toggle-container">
                    <button 
                        className={`type-toggle-btn ${manualUpload.type === 'filme' ? 'active' : ''}`}
                        onClick={() => setManualUpload(prev => ({...prev, type: 'filme'}))}
                        disabled={manualUpload.status === 'uploading'}
                    >
                        <Clapperboard size={20} /> Filme
                    </button>
                    <button 
                        className={`type-toggle-btn ${manualUpload.type === 'serie' ? 'active' : ''}`}
                        onClick={() => setManualUpload(prev => ({...prev, type: 'serie'}))}
                        disabled={manualUpload.status === 'uploading'}
                    >
                        <Tv size={20} /> Série / Anime
                    </button>
                </div>

                <div className="form-grid">
                    {manualUpload.type === 'filme' ? (
                        <>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label>Título do Filme</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: Homem-Aranha: De volta ao lar"
                                    value={manualUpload.movieTitle}
                                    onChange={(e) => setManualUpload({...manualUpload, movieTitle: e.target.value})}
                                    disabled={manualUpload.status === 'uploading'}
                                    className="title-input"
                                />
                            </div>
                            <div className="form-group">
                                <label>Ano</label>
                                <input 
                                    type="number" 
                                    placeholder="Ex: 2026"
                                    value={manualUpload.movieYear}
                                    onChange={(e) => setManualUpload({...manualUpload, movieYear: e.target.value})}
                                    disabled={manualUpload.status === 'uploading'}
                                    className="title-input"
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="form-group" style={{ gridColumn: 'span 3' }}>
                                <label>Título da Série / Anime</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: Chicago Fire"
                                    value={manualUpload.serieTitle}
                                    onChange={(e) => setManualUpload({...manualUpload, serieTitle: e.target.value})}
                                    disabled={manualUpload.status === 'uploading'}
                                    className="title-input"
                                />
                            </div>
                            <div className="form-group">
                                <label>Temporada</label>
                                <input 
                                    type="number" 
                                    placeholder="S (Ex: 1)"
                                    value={manualUpload.season}
                                    onChange={(e) => setManualUpload({...manualUpload, season: e.target.value})}
                                    disabled={manualUpload.status === 'uploading'}
                                    className="title-input"
                                />
                            </div>
                            <div className="form-group">
                                <label>Episódio</label>
                                <input 
                                    type="number" 
                                    placeholder="E (Ex: 5)"
                                    value={manualUpload.episode}
                                    onChange={(e) => setManualUpload({...manualUpload, episode: e.target.value})}
                                    disabled={manualUpload.status === 'uploading'}
                                    className="title-input"
                                />
                            </div>
                        </>
                    )}

                    <div className="form-group">
                        <label>Qualidade</label>
                        <select 
                            className="title-input" 
                            value={manualUpload.quality}
                            onChange={(e) => setManualUpload({...manualUpload, quality: e.target.value})}
                            disabled={manualUpload.status === 'uploading'}
                        >
                            <option value="SD">SD</option>
                            <option value="HD">HD</option>
                            <option value="FHD">FHD</option>
                            <option value="4K">4K</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Idioma</label>
                        <select 
                            className="title-input" 
                            value={manualUpload.language}
                            onChange={(e) => setManualUpload({...manualUpload, language: e.target.value})}
                            disabled={manualUpload.status === 'uploading'}
                        >
                            <option value="Dublado">Dublado</option>
                            <option value="Legendado">Legendado</option>
                            <option value="Nacional">Nacional</option>
                            <option value="Dual Áudio">Dual Áudio</option>
                        </select>
                    </div>
                </div>

                <div className="generated-title-preview">
                    <span>Título Gerado:</span>
                    <strong>{manualUpload.title || 'Preencha os campos para gerar o título...'}</strong>
                </div>

                <div className="form-group" style={{ marginTop: '2rem' }}>
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
                                <p className="file-hint">Formatos suportados: MP4, MKV</p>
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
                            accept="video/*,.mkv"
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
                        {manualUpload.status === 'uploading' ? 'Enviando...' : 'Iniciar Upload Seguro (9999)'}
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
