import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HoverVideoCard from './HoverVideoCard';
import { getSlug } from '../utils/slug';

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w300';

export default function RecentEpisodesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    setLoading(true);
    fetch('https://superflixapi.pro/calendario.php')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Filtrar os que têm poster
          let validEpisodes = data.filter(item => item.poster);
          
          // Ordenar por data de lançamento (mais recentes primeiro)
          validEpisodes.sort((a, b) => new Date(b.air_date) - new Date(a.air_date));
          
          // Remover duplicatas baseadas no id + temporada + episodio para garantir que cada lançamento seja único
          const uniqueItems = [];
          const seen = new Set();
          for (const item of validEpisodes) {
            const key = `${item.tmdb_id}-${item.season}-${item.number}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueItems.push(item);
            }
          }
          
          setItems(uniqueItems);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro na busca de Episódios Recentes", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="catalog-container">
      <header className="catalog-header">
        <h1 className="row-title">Episódios Recentes (Calendário)</h1>
      </header>

      <div className="catalog-grid">
        {items.slice(0, visibleCount).map((item) => (
          <HoverVideoCard 
            key={`${item.tmdb_id}-${item.season}-${item.number}`}
            id={item.tmdb_id}
            type="tv"
            title={item.title}
            poster={`${IMAGE_BASE_URL}${item.poster}`}
            onClick={() => navigate(`/serie/${getSlug(item.title)}`, { state: { id: item.tmdb_id } })}
            badges={
              <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', gap: '4px', zIndex: 10 }}>
                <span style={{ background: '#ff3b30', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                  S{item.season}E{item.number}
                </span>
                <span style={{ background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>
                  {item.air_date}
                </span>
              </div>
            }
          />
        ))}
      </div>

      {!loading && visibleCount < items.length && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '3rem 0' }}>
          <button className="btn btn-primary" onClick={() => setVisibleCount(v => v + 10)}>
            CARREGAR MAIS
          </button>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '3rem 0', color: 'var(--text-muted)' }}>
          Carregando episódios...
        </div>
      )}
    </div>
  );
}
