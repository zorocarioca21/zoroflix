import React, { useState, useEffect } from 'react';
import { Award, Search, Send, Clock, Film, Tv, Flame, CheckCircle2, AlertCircle, Info, Sparkles, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import './PointsPage.css';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function PointsPage() {
    const { user, loading: authLoading } = useAuth();
    const token = localStorage.getItem('cinegeek_token');

    const [points, setPoints] = useState(0);
    const [history, setHistory] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    // Busca no TMDB
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [existingTmdbIds, setExistingTmdbIds] = useState(new Set());

    // Modal de Pedido Específico
    const [selectedMedia, setSelectedMedia] = useState(null);
    const [requestSeason, setRequestSeason] = useState('');
    const [requestEpisode, setRequestEpisode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Filtros de Pedidos
    const [filterType, setFilterType] = useState('all'); // all, movie, tv, anime

    useEffect(() => {
        document.title = 'Meus Pontos e Pedidos - CineGeek';
        fetchUserData();
        fetchCommunityRequests();
    }, [token]);

    const fetchUserData = async () => {
        if (!token) {
            setLoadingData(false);
            return;
        }
        try {
            const res = await fetch('/api/points/balance', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setPoints(data.points || 0);
                setHistory(data.history || []);
            }
        } catch (err) {
            console.error('Erro ao buscar saldo de pontos:', err);
        } finally {
            setLoadingData(false);
        }
    };

    const fetchCommunityRequests = async () => {
        try {
            const res = await fetch(`/api/points/requests?limit=50&filter=${filterType}`);
            if (res.ok) {
                const data = await res.json();
                setRequests(data);
            }
        } catch (err) {
            console.error('Erro ao buscar pedidos:', err);
        }
    };

    useEffect(() => {
        fetchCommunityRequests();
    }, [filterType]);

    // Busca com debounce no TMDB
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const timeout = setTimeout(async () => {
            setIsSearching(true);
            try {
                const url = `${BASE_URL}/search/multi?api_key=${API_KEY}&language=pt-BR&query=${encodeURIComponent(searchQuery)}&page=1&include_adult=false`;
                const res = await fetch(url);
                const data = await res.json();
                const rawItems = (data.results || []).filter(item => item.media_type === 'movie' || item.media_type === 'tv');

                if (rawItems.length > 0) {
                    // Checa quais destes já existem baixados no nosso Telegram ou no catálogo
                    const tmdbIds = rawItems.map(i => i.id);
                    const checkRes = await fetch('/api/points/check-availability', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            tmdb_ids: tmdbIds,
                            items: rawItems.map(i => ({
                                id: i.id,
                                title: i.title,
                                name: i.name,
                                original_title: i.original_title,
                                original_name: i.original_name
                            }))
                        })
                    });
                    const checkData = await checkRes.json();
                    const downloadedSet = new Set((checkData.available || []).map(id => String(id)));
                    setExistingTmdbIds(downloadedSet);

                    // Filtra para exibir apenas os que ainda NÃO temos
                    const missingItems = rawItems.filter(item => !downloadedSet.has(String(item.id)));
                    setSearchResults(missingItems);
                } else {
                    setSearchResults([]);
                }
            } catch (err) {
                console.error('Erro na pesquisa TMDB:', err);
            } finally {
                setIsSearching(false);
            }
        }, 400);

        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const handleOpenRequest = (media) => {
        if (!user) {
            alert('Você precisa fazer login para fazer um pedido!');
            return;
        }
        if (points < 100) {
            alert(`Você tem ${points} pontos. São necessários 100 pontos para fazer um pedido! Assista mais conteúdos para acumular.`);
            return;
        }
        setSelectedMedia(media);
        setRequestSeason('');
        setRequestEpisode('');
        setFeedback(null);
    };

    const handleConfirmRequest = async () => {
        if (!selectedMedia) return;
        setIsSubmitting(true);
        setFeedback(null);

        const isAnime = selectedMedia.genre_ids?.includes(16) || selectedMedia.original_language === 'ja';
        const title = selectedMedia.title || selectedMedia.name;
        const year = (selectedMedia.release_date || selectedMedia.first_air_date || '').split('-')[0];

        try {
            const res = await fetch('/api/points/request-content', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    tmdb_id: String(selectedMedia.id),
                    media_type: selectedMedia.media_type,
                    season: requestSeason ? parseInt(requestSeason, 10) : null,
                    episode: requestEpisode ? parseInt(requestEpisode, 10) : null,
                    title,
                    poster_path: selectedMedia.poster_path,
                    year,
                    is_anime: isAnime ? 1 : 0
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setFeedback({ type: 'success', message: data.message });
                setPoints(data.remainingPoints !== undefined ? data.remainingPoints : points - 100);
                setTimeout(() => {
                    setSelectedMedia(null);
                    setSearchQuery('');
                    setSearchResults([]);
                    fetchCommunityRequests();
                    fetchUserData();
                }, 1800);
            } else {
                setFeedback({ type: 'error', message: data.error || 'Erro ao processar pedido.' });
            }
        } catch (err) {
            setFeedback({ type: 'error', message: 'Falha de comunicação com o servidor.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!authLoading && !user) {
        return (
            <div className="points-page-container" style={{ minHeight: '65vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: 'rgba(0, 255, 136, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '1.5rem', color: '#00ff88', border: '1px solid rgba(0, 255, 136, 0.3)'
                }}>
                    <Award size={40} />
                </div>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.8rem', color: '#fff' }}>
                    Área Exclusiva para Membros
                </h2>
                <p style={{ color: '#aaa', maxWidth: '460px', lineHeight: '1.6', marginBottom: '2rem' }}>
                    O sistema de pontos e pedidos é exclusivo para usuários com conta no CineGeek. Crie sua conta gratuita ou faça login para acumular pontos assistindo conteúdos e solicitar filmes, séries ou animes!
                </p>
                <Link
                    to="/"
                    style={{
                        background: '#00ff88', color: '#000', fontWeight: 'bold',
                        padding: '0.9rem 2rem', borderRadius: '12px', textDecoration: 'none',
                        boxShadow: '0 4px 15px rgba(0, 255, 136, 0.4)'
                    }}
                >
                    Voltar para o Início
                </Link>
            </div>
        );
    }

    return (
        <div className="points-page-container">
            {/* Header com saldo */}
            <div className="points-hero-card">
                <div className="points-hero-left">
                    <div className="points-coin-icon">
                        <Award size={36} color="#000" />
                    </div>
                    <div>
                        <span className="points-sub-title">SEU SALDO ATUAL</span>
                        <h1 className="points-balance-display">
                            {points} <span className="points-unit">pts</span>
                        </h1>
                        <p className="points-rules-tip">
                            ⚡ Assista pelo menos <b>80%</b> de qualquer filme, episódio ou anime e ganhe <b>+20 pontos</b> automaticamente!
                        </p>
                    </div>
                </div>

                <div className="points-cost-badge">
                    <Sparkles size={20} color="#00ff88" />
                    <div>
                        <strong>100 pontos</strong>
                        <span>= 1 Pedido Exclusivo</span>
                    </div>
                </div>
            </div>

            {/* Seção de Pesquisa TMDB */}
            <div className="points-search-section">
                <div className="points-section-header">
                    <div className="icon-circle red-glow">
                        <Flame size={22} color="#ff4444" />
                    </div>
                    <div>
                        <span className="section-tag">PEDIDOS DA COMUNIDADE</span>
                        <h2 className="section-title">O que você quer assistir?</h2>
                        <p className="section-desc">
                            Pesquise o conteúdo desejado. Apenas títulos que ainda <b>não temos</b> em nossos servidores serão exibidos para pedido.
                        </p>
                    </div>
                </div>

                <div className="points-search-bar-wrapper">
                    <Search size={22} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Pesquisar títulos aqui... (ex: One Piece, Young Hearts, Dexter...)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="points-search-input"
                    />
                    {isSearching && <Loader2 size={20} className="spin-anim search-spinner" />}
                </div>

                <div className="points-info-banner">
                    <Info size={20} color="#ffaa00" />
                    <span>
                        Use o campo de pesquisa acima para encontrar títulos que não encontrou no catálogo. Antes de solicitar qualquer conteúdo, cada pedido consome <b>100 pontos</b>.
                    </span>
                </div>

                {/* Resultados da busca */}
                {searchResults.length > 0 && (
                    <div className="points-results-grid">
                        {searchResults.map((item) => {
                            const title = item.title || item.name;
                            const year = (item.release_date || item.first_air_date || '').split('-')[0];
                            const isMovie = item.media_type === 'movie';
                            const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : '/placeholder-poster.png';

                            return (
                                <div key={item.id} className="points-result-card" onClick={() => handleOpenRequest(item)}>
                                    <div className="card-poster-wrap">
                                        <img src={posterUrl} alt={title} loading="lazy" />
                                        <span className={`media-tag ${isMovie ? 'movie' : 'tv'}`}>
                                            {isMovie ? 'FILME' : 'SÉRIE'}
                                        </span>
                                    </div>
                                    <div className="card-info">
                                        <h4 className="card-title">{title}</h4>
                                        <span className="card-year">{year || 'N/A'}</span>
                                        <button className="btn-request-item">
                                            Pedir por 100 pts <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
                    <div className="no-search-results">
                        <p>Nenhum título inédito encontrado para esta busca ou ele já existe no nosso catálogo!</p>
                    </div>
                )}
            </div>

            {/* Seção Mais Pedidos (Ranking da comunidade, estilo print) */}
            <div className="community-requests-section">
                <div className="community-header">
                    <h3 className="community-title">Mais pedidos</h3>
                    <div className="filter-pills">
                        <button className={`filter-btn ${filterType === 'all' ? 'active' : ''}`} onClick={() => setFilterType('all')}>Todos</button>
                        <button className={`filter-btn ${filterType === 'movie' ? 'active' : ''}`} onClick={() => setFilterType('movie')}>Filmes</button>
                        <button className={`filter-btn ${filterType === 'tv' ? 'active' : ''}`} onClick={() => setFilterType('tv')}>Séries</button>
                        <button className={`filter-btn ${filterType === 'anime' ? 'active' : ''}`} onClick={() => setFilterType('anime')}>Animes</button>
                    </div>
                </div>

                <div className="requests-ranked-list">
                    {requests.length === 0 ? (
                        <div className="no-requests-box">
                            <p>Ainda não há pedidos registrados. Seja o primeiro a pedir algo!</p>
                        </div>
                    ) : (
                        requests.map((req, index) => {
                            const posterUrl = req.poster_path ? `https://image.tmdb.org/t/p/w200${req.poster_path}` : '/placeholder-poster.png';
                            const isMovie = req.media_type === 'movie';
                            const badgeText = req.is_anime ? 'ANIME' : (isMovie ? 'FILME' : 'SÉRIE');

                            let extraInfo = '';
                            if (req.season && req.episode) {
                                extraInfo = ` (T${req.season} : EP ${req.episode})`;
                            } else if (req.season) {
                                extraInfo = ` (Temporada ${req.season})`;
                            }

                            return (
                                <div key={req.id} className="ranked-request-row">
                                    <div className="ranked-left">
                                        <div className="rank-poster">
                                            <img src={posterUrl} alt={req.title} />
                                        </div>
                                        <div className="rank-details">
                                            <div className="rank-badges-row">
                                                <span className="rank-number">#{index + 1}</span>
                                                <span className={`media-pill ${badgeText.toLowerCase()}`}>{badgeText}</span>
                                                {req.year && <span className="rank-year">{req.year}</span>}
                                                {req.status === 'completed' && (
                                                    <span className="status-pill completed">ADICIONADO</span>
                                                )}
                                            </div>
                                            <h4 className="rank-item-title">
                                                {req.title} {extraInfo}
                                            </h4>
                                            <div className="rank-votes-count">
                                                <Flame size={14} color="#ff4444" />
                                                <span>{req.votes} {req.votes === 1 ? 'Solicitação' : 'Solicitações'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Botão de apoiar este pedido com 100 pontos se ainda não adicionado */}
                                    {req.status !== 'completed' && (
                                        <button
                                            className="btn-vote-request"
                                            onClick={() => handleOpenRequest({
                                                id: req.tmdb_id,
                                                media_type: req.media_type,
                                                title: req.title,
                                                poster_path: req.poster_path,
                                                release_date: req.year,
                                                first_air_date: req.year,
                                                genre_ids: req.is_anime ? [16] : []
                                            })}
                                            title="Votar também neste pedido (+100 pts)"
                                        >
                                            Pedir Também
                                        </button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Modal de Confirmação do Pedido */}
            {selectedMedia && (
                <div className="request-modal-overlay" onClick={() => !isSubmitting && setSelectedMedia(null)}>
                    <div className="request-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-media-header">
                            <img
                                src={selectedMedia.poster_path ? `https://image.tmdb.org/t/p/w200${selectedMedia.poster_path}` : '/placeholder-poster.png'}
                                alt="Poster"
                                className="modal-poster"
                            />
                            <div>
                                <span className="modal-badge">{selectedMedia.media_type === 'movie' ? 'FILME' : 'SÉRIE / ANIME'}</span>
                                <h3 className="modal-title">{selectedMedia.title || selectedMedia.name}</h3>
                                <p className="modal-cost-alert">
                                    Custo: <b>100 Pontos</b> (Seu saldo: {points} pts)
                                </p>
                            </div>
                        </div>

                        {selectedMedia.media_type === 'tv' && (
                            <div className="modal-episode-options">
                                <label className="input-label">Deseja pedir um episódio ou temporada específica? (Opcional):</label>
                                <div className="input-group-row">
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="Temporada (Ex: 1)"
                                        value={requestSeason}
                                        onChange={(e) => setRequestSeason(e.target.value)}
                                        className="modal-number-input"
                                    />
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="Episódio (Ex: 5)"
                                        value={requestEpisode}
                                        onChange={(e) => setRequestEpisode(e.target.value)}
                                        className="modal-number-input"
                                    />
                                </div>
                                <span className="input-hint">Deixe em branco para pedir a série completa.</span>
                            </div>
                        )}

                        {feedback && (
                            <div className={`modal-feedback ${feedback.type}`}>
                                {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                                <span>{feedback.message}</span>
                            </div>
                        )}

                        <div className="modal-actions-row">
                            <button
                                className="modal-btn-cancel"
                                onClick={() => setSelectedMedia(null)}
                                disabled={isSubmitting}
                            >
                                Cancelar
                            </button>
                            <button
                                className="modal-btn-confirm"
                                onClick={handleConfirmRequest}
                                disabled={isSubmitting || points < 100}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={16} className="spin-anim" /> Enviando Pedido...
                                    </>
                                ) : (
                                    'Confirmar Pedido (100 pts)'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
