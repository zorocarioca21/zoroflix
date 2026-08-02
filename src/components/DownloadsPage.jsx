import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Trash2, DownloadCloud, PlayCircle, Loader2 } from 'lucide-react';

export default function DownloadsPage() {
    const [downloads, setDownloads] = useState([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    const fetchDownloads = async () => {
        const token = localStorage.getItem('cinegeek_token');
        const uuidVal = localStorage.getItem('cinegeek_uuid');
        const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch('/api/downloads/list', { headers });
            if (res.ok) {
                const data = await res.json();
                setDownloads(data);
            }
        } catch (e) {
            console.error("Erro ao buscar downloads", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDownloads();
        // Atualiza a cada 5 segundos para ver o progresso
        const interval = setInterval(fetchDownloads, 5000);
        return () => clearInterval(interval);
    }, []);

    const handleDelete = async (id) => {
        if (!confirm("Tem certeza que deseja apagar este download? O arquivo será deletado do servidor.")) return;

        const token = localStorage.getItem('cinegeek_token');
        const uuidVal = localStorage.getItem('cinegeek_uuid');
        const headers = { 'Content-Type': 'application/json', 'x-device-uuid': uuidVal || '' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
            const res = await fetch(`/api/downloads/${id}`, {
                method: 'DELETE',
                headers
            });
            if (res.ok) {
                fetchDownloads();
            } else {
                alert("Erro ao excluir download.");
            }
        } catch(e) {
            alert("Falha na rede.");
        }
    };

    const handleDownload = (id) => {
        const token = localStorage.getItem('cinegeek_token');
        const dUrl = `/api/downloads/file/${id}?token=${token || ''}`;
        window.open(dUrl, '_blank');
    };

    if (loading) return <div className="details-loading">Carregando seus downloads...</div>;

    return (
        <div className="downloads-page" style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', color: '#fff' }}>
            <h2 style={{ fontSize: '2rem', color: '#00ff88', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <DownloadCloud size={28} /> Meus Downloads
            </h2>

            {downloads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', background: '#06120e', borderRadius: '16px' }}>
                    <p style={{ color: '#888' }}>Você ainda não iniciou nenhum download.</p>
                </div>
            ) : (
                <div className="downloads-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {downloads.map(d => {
                        const isFinished = d.percentDone >= 1;
                        const progress = d.percentDone >= 0 ? (d.percentDone * 100).toFixed(1) : 0;
                        const isDownloading = d.percentDone >= 0 && d.percentDone < 1;
                        const isFailed = d.percentDone === -1;

                        return (
                            <div key={d.id} className="download-card" style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: '#13131a',
                                border: '1px solid #1a2f24',
                                borderRadius: '12px',
                                padding: '1rem',
                                gap: '1rem',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                {/* Barra de progresso de fundo */}
                                {isDownloading && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0, left: 0, bottom: 0,
                                        width: `${progress}%`,
                                        background: 'rgba(0, 255, 136, 0.05)',
                                        zIndex: 0
                                    }}></div>
                                )}

                                <div style={{ width: '60px', height: '90px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, zIndex: 1 }}>
                                    <img src={d.poster_path ? `https://image.tmdb.org/t/p/w200${d.poster_path}` : '/cinegeek-icon.png'} alt={d.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                
                                <div style={{ flexGrow: 1, zIndex: 1 }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#fff' }}>{d.title}</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#888' }}>
                                        {isFinished ? (
                                            <span style={{ color: '#00ff88' }}>Concluído! Pronto para baixar.</span>
                                        ) : isFailed ? (
                                            <span style={{ color: '#ff3b30' }}>Torrent indisponível ou removido.</span>
                                        ) : (
                                            <span style={{ color: '#00d4ff' }}>Baixando para o servidor: {progress}%</span>
                                        )}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem', zIndex: 1 }}>
                                    {isFinished && (
                                        <button 
                                            onClick={() => handleDownload(d.transmission_id)}
                                            style={{
                                                background: '#00ff88',
                                                color: '#000',
                                                border: 'none',
                                                borderRadius: '8px',
                                                padding: '0.6rem 1rem',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <PlayCircle size={18}/> Salvar Arquivo
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => handleDelete(d.id)}
                                        style={{
                                            background: '#ff3b30',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '0.6rem 1rem',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <Trash2 size={18}/> Excluir
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
