import React, { useState, useEffect } from 'react';
import { HardDriveDownload, UploadCloud, X, Film, CheckCircle2, Clapperboard, Tv, Trash2, ListOrdered, Play, RefreshCw } from 'lucide-react';
import './ManualUploadPage.css';

const generateId = () => Math.random().toString(36).substr(2, 9);

export default function ManualUploadPage() {
    const [uploadQueue, setUploadQueue] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Update generated titles whenever queue items change
    useEffect(() => {
        setUploadQueue(prevQueue => prevQueue.map(item => {
            let generated = '';
            if (item.type === 'filme') {
                const yearStr = item.movieYear ? ` (${item.movieYear})` : '';
                if (item.movieTitle) {
                    generated = `${item.movieTitle.trim()}${yearStr} ${item.quality} ${item.language}`;
                }
            } else {
                if (item.serieTitle) {
                    const s = item.season ? item.season.toString().padStart(2, '0') : '01';
                    const e = item.episode ? item.episode.toString().padStart(2, '0') : '01';
                    generated = `${item.serieTitle.trim()} S${s} E${e} ${item.quality} ${item.language}`;
                }
            }
            return { ...item, generatedTitle: generated };
        }));
    }, [JSON.stringify(uploadQueue.map(i => ({t: i.type, mt: i.movieTitle, my: i.movieYear, st: i.serieTitle, s: i.season, e: i.episode, q: i.quality, l: i.language})))]);

    const addFilesToQueue = (files) => {
        const newItems = Array.from(files).filter(file => file.type.startsWith('video/') || file.name.endsWith('.mkv') || file.name.endsWith('.ts')).map(file => {
            // Tenta adivinhar um nome de arquivo
            let rawName = file.name.replace(/\.(mp4|mkv|avi|mov|ts)$/i, '');
            // Verifica se tem algo parecido com S01E01
            const epMatch = rawName.match(/[Ss](\d+)[Ee](\d+)/);
            let defaultType = epMatch ? 'serie' : 'filme';
            let defaultTitle = rawName;
            let defaultSeason = '';
            let defaultEpisode = '';
            
            if (epMatch) {
                defaultSeason = parseInt(epMatch[1], 10).toString();
                defaultEpisode = parseInt(epMatch[2], 10).toString();
                // Tenta pegar o título antes de S01E01
                const splitName = rawName.split(/[Ss]\d+[Ee]\d+/)[0].replace(/[\.\_]/g, ' ').trim();
                defaultTitle = splitName || rawName;
            } else {
                defaultTitle = rawName.replace(/[\.\_]/g, ' ').trim();
            }

            return {
                id: generateId(),
                file,
                type: defaultType,
                movieTitle: defaultType === 'filme' ? defaultTitle : '',
                movieYear: '',
                serieTitle: defaultType === 'serie' ? defaultTitle : '',
                season: defaultSeason,
                episode: defaultEpisode,
                quality: 'FHD',
                language: 'Dublado',
                status: 'idle', // idle, uploading, success, error
                progress: 0,
                error: null,
                generatedTitle: ''
            };
        });

        if (newItems.length > 0) {
            setUploadQueue(prev => [...prev, ...newItems]);
        } else {
            alert('Nenhum vídeo válido encontrado. Formatos aceitos: MP4, MKV, TS');
        }
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            addFilesToQueue(e.target.files);
            // Reset input so you can select the same file again if needed
            e.target.value = '';
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
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            addFilesToQueue(e.dataTransfer.files);
        }
    };

    const removeItem = (id) => {
        setUploadQueue(prev => prev.filter(item => item.id !== id));
    };

    const updateItem = (id, field, value) => {
        setUploadQueue(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const processQueue = async () => {
        if (isProcessing) return;
        
        // Verifica se todos os itens 'idle' têm título gerado
        const idles = uploadQueue.filter(item => item.status === 'idle' || item.status === 'error');
        if (idles.length === 0) return;

        for (const item of idles) {
            if (!item.generatedTitle) {
                alert(`O arquivo "${item.file.name}" está com as informações incompletas. Preencha os títulos antes de iniciar.`);
                return;
            }
        }

        setIsProcessing(true);

        for (let i = 0; i < uploadQueue.length; i++) {
            const item = uploadQueue[i];
            
            // Só processa se estiver idle ou deu erro antes (tenta novamente)
            if (item.status === 'success' || item.status === 'uploading') continue;

            updateItem(item.id, 'status', 'uploading');
            updateItem(item.id, 'progress', 0);
            updateItem(item.id, 'error', null);

            const file = item.file;
            const chunkSize = 50 * 1024 * 1024; // 50MB
            const totalChunks = Math.ceil(file.size / chunkSize);
            const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const originalExt = file.name.split('.').pop() || 'mp4';

            try {
                for (let c = 0; c < totalChunks; c++) {
                    const start = c * chunkSize;
                    const end = Math.min(start + chunkSize, file.size);
                    const chunk = file.slice(start, end);

                    const formData = new FormData();
                    formData.append('chunk', chunk, 'chunk.bin');
                    formData.append('fileName', fileName);
                    formData.append('chunkIndex', c);

                    const response = await fetch('/api/sync/manual-upload/chunk', {
                        method: 'POST',
                        body: formData
                    });

                    if (!response.ok) {
                        throw new Error(`Falha no chunk ${c + 1}`);
                    }

                    const progress = Math.round(((c + 1) / totalChunks) * 100);
                    updateItem(item.id, 'progress', progress);
                }

                const finalizeRes = await fetch('/api/sync/manual-upload/finalize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileName,
                        title: item.generatedTitle,
                        originalExt,
                        totalSize: file.size
                    })
                });

                if (!finalizeRes.ok) {
                    const errData = await finalizeRes.json();
                    throw new Error(errData.error || 'Erro ao finalizar no servidor');
                }

                updateItem(item.id, 'status', 'success');
                updateItem(item.id, 'progress', 100);

            } catch (error) {
                console.error("Erro no upload do item", item.id, error);
                updateItem(item.id, 'status', 'error');
                updateItem(item.id, 'error', error.message);
                // Interromper a fila em caso de erro? Opcional. 
                // setIsProcessing(false);
                // return;
            }
        }

        setIsProcessing(false);
    };

    const hasPending = uploadQueue.some(i => i.status === 'idle' || i.status === 'error');
    const allCompleted = uploadQueue.length > 0 && uploadQueue.every(i => i.status === 'success');
    const completedCount = uploadQueue.filter(i => i.status === 'success').length;
    const globalProgress = uploadQueue.length > 0 ? Math.round((completedCount / uploadQueue.length) * 100) : 0;

    const retryItem = (id) => {
        updateItem(id, 'status', 'idle');
        updateItem(id, 'error', null);
    };

    return (
        <div className="manual-upload-container">
            <div className="manual-upload-header">
                <h1>
                    <HardDriveDownload size={32} className="header-icon" />
                    Upload em Lote (Batch)
                </h1>
                <p>Arraste vários episódios ou filmes de uma vez. Configure as informações individualmente e envie para a fila de prioridade (9999).</p>
            </div>

            <div className="manual-upload-card" style={{ padding: '2rem' }}>
                <div 
                    className={`drag-drop-zone batch-zone ${isDragging ? 'dragging' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="drop-content">
                        <UploadCloud size={48} className="drop-icon" />
                        <h3>Arraste e solte seus vídeos aqui</h3>
                        <span>ou selecione múltiplos arquivos</span>
                        <button type="button" className="browse-btn" onClick={() => document.getElementById('manual-file-input-batch').click()}>
                            Procurar Arquivos
                        </button>
                        <p className="file-hint">Formatos suportados: MP4, MKV, TS</p>
                    </div>
                    <input 
                        type="file" 
                        id="manual-file-input-batch"
                        accept="video/mp4,video/x-matroska,video/mp2t,.ts,.mkv"
                        multiple
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                </div>
            </div>

            {uploadQueue.length > 0 && (
                <div className="queue-container">
                    <div className="queue-header-stats">
                        <div>
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
                                <ListOrdered size={24} color="#00ff88" /> Fila de Upload ({uploadQueue.length} arquivo{uploadQueue.length > 1 ? 's' : ''})
                            </h2>
                            {uploadQueue.length > 0 && (
                                <div style={{ marginTop: '0.5rem', color: '#888', fontSize: '0.9rem' }}>
                                    Enviados {completedCount} de {uploadQueue.length} ({globalProgress}%)
                                </div>
                            )}
                        </div>
                        {allCompleted && <span style={{ color: '#00ff88', fontWeight: 'bold' }}>Todos os uploads concluídos! 🎉</span>}
                        {isProcessing && !allCompleted && (
                            <div className="mini-progress-container" style={{ width: '200px' }}>
                                <div className="mini-progress-bg">
                                    <div className="mini-progress-fill" style={{ width: `${globalProgress}%` }} />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="queue-list">
                        {uploadQueue.map((item, index) => (
                            <div key={item.id} className={`queue-card ${item.status}`}>
                                <div className="queue-card-header">
                                    <div className="queue-file-info">
                                        <div className="file-badge">#{index + 1}</div>
                                        <Film size={20} color={item.status === 'success' ? '#00ff88' : '#00ccff'} />
                                        <span className="file-name" title={item.file.name}>{item.file.name}</span>
                                        <span className="file-size">{(item.file.size / (1024 * 1024)).toFixed(1)} MB</span>
                                    </div>
                                    
                                    {item.status !== 'uploading' && item.status !== 'success' && (
                                        <button className="remove-item-btn" onClick={() => removeItem(item.id)} title="Remover da fila">
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                    {item.status === 'success' && <CheckCircle2 size={24} color="#00ff88" />}
                                </div>

                                {/* Form settings - only editable if not successful */}
                                {item.status !== 'success' && (
                                    <div className="queue-card-body">
                                        <div className="type-toggle-container small">
                                            <button 
                                                className={`type-toggle-btn ${item.type === 'filme' ? 'active' : ''}`}
                                                onClick={() => updateItem(item.id, 'type', 'filme')}
                                                disabled={item.status === 'uploading'}
                                            >
                                                <Clapperboard size={16} /> Filme
                                            </button>
                                            <button 
                                                className={`type-toggle-btn ${item.type === 'serie' ? 'active' : ''}`}
                                                onClick={() => updateItem(item.id, 'type', 'serie')}
                                                disabled={item.status === 'uploading'}
                                            >
                                                <Tv size={16} /> Série / Anime
                                            </button>
                                        </div>

                                        <div className="form-grid compact">
                                            {item.type === 'filme' ? (
                                                <>
                                                    <div className="form-group span-2">
                                                        <label>Título do Filme</label>
                                                        <input type="text" className="title-input" value={item.movieTitle} onChange={(e) => updateItem(item.id, 'movieTitle', e.target.value)} disabled={item.status === 'uploading'} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Ano</label>
                                                        <input type="number" className="title-input" value={item.movieYear} onChange={(e) => updateItem(item.id, 'movieYear', e.target.value)} disabled={item.status === 'uploading'} />
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="form-group span-3">
                                                        <label>Título da Série</label>
                                                        <input type="text" className="title-input" value={item.serieTitle} onChange={(e) => updateItem(item.id, 'serieTitle', e.target.value)} disabled={item.status === 'uploading'} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Temporada</label>
                                                        <input type="number" className="title-input" placeholder="Ex: 1" value={item.season} onChange={(e) => updateItem(item.id, 'season', e.target.value)} disabled={item.status === 'uploading'} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label>Episódio</label>
                                                        <input type="number" className="title-input" placeholder="Ex: 5" value={item.episode} onChange={(e) => updateItem(item.id, 'episode', e.target.value)} disabled={item.status === 'uploading'} />
                                                    </div>
                                                </>
                                            )}
                                            
                                            <div className="form-group">
                                                <label>Qualidade</label>
                                                <select className="title-input" value={item.quality} onChange={(e) => updateItem(item.id, 'quality', e.target.value)} disabled={item.status === 'uploading'}>
                                                    <option value="SD">SD</option>
                                                    <option value="HD">HD</option>
                                                    <option value="FHD">FHD</option>
                                                    <option value="4K">4K</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Idioma</label>
                                                <select className="title-input" value={item.language} onChange={(e) => updateItem(item.id, 'language', e.target.value)} disabled={item.status === 'uploading'}>
                                                    <option value="Dublado">Dublado</option>
                                                    <option value="Legendado">Legendado</option>
                                                    <option value="Nacional">Nacional</option>
                                                    <option value="Dual Áudio">Dual Áudio</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Card Footer: Preview & Progress */}
                                <div className="queue-card-footer">
                                    <div className="preview-row">
                                        <span className="label">Título no Telegram:</span>
                                        <span className="generated">{item.generatedTitle || 'Falta preencher informações...'}</span>
                                    </div>
                                    
                                    {item.error && (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                            <div className="error-text">❌ Erro: {item.error}</div>
                                            <button 
                                                onClick={() => retryItem(item.id)}
                                                style={{ background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid rgba(255, 68, 68, 0.3)', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}
                                            >
                                                <RefreshCw size={14} /> Tentar Novamente
                                            </button>
                                        </div>
                                    )}

                                    {(item.status === 'uploading' || item.status === 'success') && (
                                        <div className="mini-progress-container">
                                            <div className="mini-progress-bg">
                                                <div className="mini-progress-fill" style={{ width: `${item.progress}%`, background: item.status === 'success' ? '#00ff88' : 'linear-gradient(90deg, #00ccff, #00ff88)' }} />
                                            </div>
                                            <span className="mini-progress-text">{item.status === 'success' ? 'Concluído' : `${item.progress}%`}</span>
                                        </div>
                                    )}
                                </div>

                            </div>
                        ))}
                    </div>

                    <div className="global-actions">
                        <button 
                            className={`global-submit-btn ${isProcessing ? 'processing' : ''}`}
                            onClick={processQueue}
                            disabled={isProcessing || !hasPending}
                        >
                            {isProcessing ? (
                                <>Enviando fila... Aguarde.</>
                            ) : hasPending ? (
                                <><Play fill="currentColor" size={20} /> Processar Fila Inteira Seguro (9999)</>
                            ) : (
                                <><CheckCircle2 size={20} /> Fila Concluída</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
