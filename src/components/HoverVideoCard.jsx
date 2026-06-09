import React, { useState, useRef, useEffect } from 'react';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export default function HoverVideoCard({ id, type, poster, title, onClick, badges }) {
  const [videoKey, setVideoKey] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const timeoutRef = useRef(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
    timeoutRef.current = setTimeout(() => {
      fetch(`${BASE_URL}/${type}/${id}/videos?api_key=${API_KEY}&language=pt-BR`)
        .then(res => res.json())
        .then(data => {
          const video = data.results?.find(v => v.type === 'Teaser' || v.type === 'Trailer');
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
      className="hover-video-card" 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      <div className="card-media-wrapper">
        {badges}
        
        {!videoKey ? (
          <img src={poster} alt={title} className="card-poster-img" />
        ) : (
          <div className="teaser-iframe-wrapper">
            <iframe
              src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoKey}&modestbranding=1`}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              title="teaser"
            />
          </div>
        )}
        
        <div className="card-overlay">
          <span className="play-icon">▶</span>
        </div>
      </div>
      <div className="card-title">{title}</div>
    </div>
  );
}
