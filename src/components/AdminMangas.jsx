import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Image as ImageIcon, Trash2, Edit2, UploadCloud } from 'lucide-react';

export default function AdminMangas({ token }) {
    const [mangas, setMangas] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [formData, setFormData] = useState({
        title: '', original_title: '', synopsis: '', cover_url: '', type: 'manga'
    });

    const fetchMangas = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/mangas', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.mangas) setMangas(data.mangas);
        } catch (e) {
            console.error('Erro ao buscar mangás:', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchMangas();
    }, []);

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/mangas', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                window.alert('Obra adicionada com sucesso!');
                setShowAddModal(false);
                setFormData({ title: '', original_title: '', synopsis: '', cover_url: '', type: 'manga' });
                fetchMangas();
            } else {
                window.alert('Erro ao adicionar obra');
            }
        } catch (e) {
            window.alert('Falha na comunicação com o servidor');
        }
    };

    return (
        <div style={{ padding: '2rem', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', margin: 0 }}>
                    <BookOpen size={28} color="#ff3366" />
                    Gerenciar Mangás e HQs
                </h2>
                <button 
                    onClick={() => setShowAddModal(true)}
                    style={{ background: '#ff3366', color: '#fff', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '6px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                >
                    <Plus size={18} /> Adicionar Nova Obra
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.5rem' }}>
                {loading ? <p>Carregando obras...</p> : mangas.length === 0 ? <p>Nenhuma obra cadastrada ainda.</p> : null}
                
                {mangas.map(manga => (
                    <div key={manga.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ width: '100%', height: '280px', background: '#111', position: 'relative' }}>
                            {manga.cover_url ? (
                                <img src={manga.cover_url} alt={manga.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>
                                    <ImageIcon size={48} />
                                </div>
                            )}
                            <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.7)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                {manga.type.toUpperCase()}
                            </div>
                        </div>
                        <div style={{ padding: '1rem' }}>
                            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{manga.title}</h3>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                <button style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
                                    Capítulos
                                </button>
                                <button style={{ background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.3)', color: '#ff3366', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal de Adição */}
            {showAddModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '12px', width: '500px', maxWidth: '90%', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', color: '#ff3366' }}>Cadastrar Mangá/HQ</h3>
                        <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#aaa' }}>Título Principal *</label>
                                <input 
                                    type="text" 
                                    required
                                    value={formData.title} 
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                                />
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#aaa' }}>Tipo</label>
                                    <select 
                                        value={formData.type} 
                                        onChange={e => setFormData({...formData, type: e.target.value})}
                                        style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                                    >
                                        <option value="manga">Mangá</option>
                                        <option value="hq">Comic / HQ</option>
                                        <option value="webtoon">Webtoon / Manhwa</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#aaa' }}>URL da Capa</label>
                                    <input 
                                        type="url" 
                                        value={formData.cover_url} 
                                        onChange={e => setFormData({...formData, cover_url: e.target.value})}
                                        placeholder="https://..."
                                        style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#aaa' }}>Sinopse</label>
                                <textarea 
                                    rows={4}
                                    value={formData.synopsis} 
                                    onChange={e => setFormData({...formData, synopsis: e.target.value})}
                                    style={{ width: '100%', padding: '0.8rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', resize: 'vertical' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '0.8rem', background: 'transparent', border: '1px solid #444', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>
                                    Cancelar
                                </button>
                                <button type="submit" style={{ flex: 1, padding: '0.8rem', background: '#ff3366', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer' }}>
                                    Salvar Obra
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
