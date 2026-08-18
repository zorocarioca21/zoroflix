import React, { useState, useRef, useEffect } from 'react';
import { AgeBadge } from './Badges';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function HoverVideoCard({ id, type, poster, title, onClick, badges }) {
  const [videoKey, setVideoKey] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [certification, setCertification] = useState('');
  const [mediaLabel, setMediaLabel] = useState(type === 'movie' ? 'FILME' : 'SÉRIE');
  const [transformOrigin, setTransformOrigin] = useState('center center');
  const cardRef = useRef(null);
  const timeoutRef = useRef(null);

  // Busca classificação etária no carregamento inicial
  useEffect(() => {
    const append = type === 'movie' ? 'release_dates' : 'content_ratings';
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&append_to_response=${append}`)
      .then(r => r.json())
      .then(data => {
        let cert = '';
        if (type === 'movie') {
          const br = data.release_dates?.results?.find(r => r.iso_3166_1 === 'BR');
          cert = br?.release_dates?.find(d => d.certification)?.certification || '?';
        } else {
          const br = data.content_ratings?.results?.find(r => r.iso_3166_1 === 'BR');
          cert = br?.rating || '?';
          
          if (data.original_language === 'ja' && data.genres?.some(g => g.id === 16)) {
            setMediaLabel('ANIME');
          }
        }
        setCertification(cert);
      })
      .catch(() => {});
  }, [id, type]);

  const handleMouseEnter = () => {
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      if (rect.left < 70) {
        setTransformOrigin('left center');
      } else if (rect.right > windowWidth - 70) {
        setTransformOrigin('right center');
      } else {
        setTransformOrigin('center center');
      }
    }
    setIsHovered(true);
    timeoutRef.current = setTimeout(() => {
      fetch(`${BASE_URL}/${type}/${id}/videos?api_key=${API_KEY}&language=pt-BR`)
        .then(res => res.json())
        .then(data => {
          const video = data.results?.find(v => v.type === 'Trailer') || data.results?.find(v => v.type === 'Teaser');
          if (video) setVideoKey(video.key);
        })
        .catch(err => console.error("Erro ao buscar teaser:", err));
    }, 600); // Delay para não carregar se o mouse passar rápido
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVideoKey(null);
  };

  return (
    <div 
      ref={cardRef}
      className="hover-video-card" 
      style={{ transformOrigin }}
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div className="card-media-wrapper">
        <div className="card-badges-top" style={{ position: 'absolute', zIndex: 3, top: '10px', left: '10px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
          <div style={{ backgroundColor: '#0066ff', color: '#fff', padding: '2px 6px', fontSize: '10px', fontWeight: 'bold', borderRadius: '4px', letterSpacing: '0.5px' }}>
            {mediaLabel}
          </div>
          <AgeBadge rating={certification} />
        </div>
        <div style={{ position: 'absolute', zIndex: 3, top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
           {badges}
        </div>
        
        {/* IFRAME DE FUNDO (Z-INDEX 0) */}
        {videoKey && (
          <div className="teaser-iframe-wrapper" style={{ zIndex: 0 }}>
            <iframe
              src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoKey}&modestbranding=1&rel=0&iv_load_policy=3&playsinline=1`}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              title="teaser"
            />
          </div>
        )}

        {/* PÔSTER DO FILME (Z-INDEX 1) */}
        <img 
            src={poster} 
            alt={title} 
            className="card-poster-img" 
            style={{
                position: 'relative', 
                zIndex: 1, 
                opacity: isHovered && videoKey ? 0 : 1, 
                transition: 'opacity 0.6s ease',
                display: 'block'
            }} 
        />
        
        {(!isHovered || !videoKey) && (
          <div className="card-overlay" style={{ zIndex: 2 }}>
            <span className="play-icon">▶</span>
          </div>
        )}
      </div>
      <div className="card-title">{title}</div>
    </div>
  );
}
