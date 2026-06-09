import React from 'react';

export function RatingCircle({ rating }) {
  const percentage = Math.round(rating * 10);
  const color = percentage >= 70 ? '#00e676' : percentage >= 40 ? '#fbbf24' : '#ff4444';
  
  // SVG Circle logic
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="rating-circle-container">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle 
          cx="20" cy="20" r={radius} 
          fill="rgba(0,0,0,0.8)" 
          stroke="rgba(255,255,255,0.1)" 
          strokeWidth="3" 
        />
        <circle 
          cx="20" cy="20" r={radius} 
          fill="none" 
          stroke={color} 
          strokeWidth="3" 
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 20 20)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text 
          x="50%" y="50%" 
          dominantBaseline="central" 
          textAnchor="middle" 
          fill="white" 
          fontSize="10" 
          fontWeight="900"
        >
          {percentage}<tspan fontSize="6">%</tspan>
        </text>
      </svg>
    </div>
  );
}

export function AgeBadge({ rating }) {
  if (!rating) return null;
  
  // Map TMDB or local ratings to colors
  const ratingsMap = {
    'L': { color: '#00e676', label: 'L' },
    '10': { color: '#03a9f4', label: '10' },
    '12': { color: '#ffeb3b', label: '12', text: '#000' },
    '14': { color: '#ff9800', label: '14' },
    '16': { color: '#f44336', label: '16' },
    '18': { color: '#000000', label: '18', border: '1px solid #ff4444' }
  };

  const current = ratingsMap[rating] || { color: '#94a3b8', label: rating };

  return (
    <div 
      className="age-badge" 
      style={{ 
        backgroundColor: current.color, 
        color: current.text || '#fff', 
        border: current.border || 'none' 
      }}
    >
      {current.label}
    </div>
  );
}
