import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Image as ImageIcon, Trash2, Edit2, UploadCloud } from 'lucide-react';

import AdminMangaChapters from './AdminMangaChapters';

export default function AdminMangas({ token }) {
    const [mangas, setMangas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedManga, setSelectedManga] = useState(null);
    
    const [showAddModal, setShowAddModal] = useState(false);
    
    // MangaDex Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);

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

    const handleSearchMangaDex = async () => {
        if (!searchQuery) return;
        setSearching(true);
        try {
            const res = await fetch(`/api/mangas/mangadex/search?q=${encodeURIComponent(searchQuery)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.results) {
                setSearchResults(data.results);
            }
        } catch (e) {
            console.error('Erro na pesquisa', e);
            window.alert('Erro ao buscar no MangaDex');
        }
        setSearching(false);
    };

    const handleSaveManga = async (mangaData) => {
        try {
            const res = await fetch('/api/mangas', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    title: mangaData.title,
                    original_title: mangaData.title,
                    synopsis: mangaData.synopsis,
                    cover_url: mangaData.cover_url,
                    type: mangaData.type,
                    anilist_id: mangaData.id // Saving MangaDex ID in anilist_id for now
                })
            });
            if (res.ok) {
                window.alert('Obra salva com sucesso!');
                setShowAddModal(false);
                fetchMangas();
            } else {
                window.alert('Erro ao salvar obra');
            }
        } catch (e) {
            window.alert('Falha na comunicação com o servidor');
        }
    };

    if (selectedManga) {
        return (
            <AdminMangaChapters 
                manga={selectedManga} 
                token={token} 
                onBack={() => setSelectedManga(null)} 
            />
        );
    }

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
                                <button onClick={() => setSelectedManga(manga)} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}>
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

            {/* Modal de Pesquisa MangaDex */}
            {showAddModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#1a1a1a', padding: '2rem', borderRadius: '12px', width: '700px', maxWidth: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0, color: '#ff3366' }}>Pesquisar no MangaDex</h3>
                            <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                            <input 
                                type="text" 
                                placeholder="Digite o nome do mangá..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearchMangaDex()}
                                style={{ flex: 1, padding: '0.8rem', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                            />
                            <button 
                                onClick={handleSearchMangaDex}
                                disabled={searching}
                                style={{ padding: '0 1.5rem', background: '#ff3366', border: 'none', color: '#fff', fontWeight: 'bold', borderRadius: '6px', cursor: searching ? 'not-allowed' : 'pointer' }}
                            >
                                {searching ? 'Buscando...' : 'Pesquisar'}
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                            {searchResults.map(result => (
                                <div key={result.id} style={{ background: '#222', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ height: '200px', background: '#111', marginBottom: '1rem', borderRadius: '4px', overflow: 'hidden' }}>
                                        {result.cover_url ? (
                                            <img src={result.cover_url} alt={result.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Sem Capa</div>
                                        )}
                                    </div>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', flex: 1 }}>{result.title}</h4>
                                    <button 
                                        onClick={() => handleSaveManga(result)}
                                        style={{ width: '100%', padding: '0.6rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        Salvar no Banco
                                    </button>
                                </div>
                            ))}
                            {searchResults.length === 0 && !searching && (
                                <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666', padding: '2rem' }}>
                                    Nenhum resultado encontrado.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
