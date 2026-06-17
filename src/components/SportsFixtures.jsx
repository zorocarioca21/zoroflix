import { useState, useEffect, useRef } from 'react';
import { Timer, Radio, Tv, PlayCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function SportsFixtures() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMatchForModal, setSelectedMatchForModal] = useState(null);
  const navigate = useNavigate();

  const liveRowRef = useRef(null);
  const upcomingRowRef = useRef(null);

  useEffect(() => {
    const fetchSportsData = async () => {
      try {
        const resp = await fetch('/api/sports/fixtures?t=' + Date.now());
        const data = await resp.json();
        
        if (!data.daily || data.daily.length === 0) {
            setLoading(false);
            return;
        }

        const live = [];
        const upcoming = [];

        data.daily.forEach(f => {
            if (f.fixture.status.short === 'LIVE') {
                live.push(f);
            } else {
                upcoming.push(f);
            }
        });

        // Ordenação por horário
        upcoming.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

        setLiveMatches(live);
        setUpcomingMatches(upcoming);
      } catch (err) {
        console.error("Erro ao processar dados esportivos:", err);
        setError("Não foi possível carregar os jogos agora.");
      } finally {
        setLoading(false);
      }
    };

    fetchSportsData();
    const interval = setInterval(fetchSportsData, 60000 * 2); // Atualiza a cada 2 minutos
    return () => clearInterval(interval);
  }, []);

  const handleScroll = (ref, direction) => {
    if (ref.current) {
      const { scrollLeft, clientWidth } = ref.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      ref.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  const handleChannelClick = (ch, e) => {
    e.stopPropagation(); // Evita o clique no card
    if (ch.zoroflix_id) {
        navigate(`/canal/${ch.zoroflix_id}`);
    } else {
        window.open(ch.embed_url, '_blank');
    }
  };

  const openModal = (m) => setSelectedMatchForModal(m);
  const closeModal = () => setSelectedMatchForModal(null);

  if (loading) return <div className="match-card-loading">Buscando programação premium...</div>;
  if (liveMatches.length === 0 && upcomingMatches.length === 0) return null;

  const renderMatch = (m) => {
    const isLive = m.fixture.status.short === 'LIVE';
    const rde = m.rde_custom || {};
    
    return (
        <div key={m.fixture.id} className={`premium-match-card ${isLive ? 'is-live' : ''}`}>
            {/* Background Poster */}
            <div className="match-card-bg" style={{ backgroundImage: `url(${rde.poster || ''})` }}></div>
            <div className="match-card-overlay"></div>

            {/* Header: League */}
            <div className="match-card-header">
                <span className="match-league">
                    {m.league.logo && <img src={m.league.logo} alt="" className="league-logo-mini" />}
                    {m.league.name}
                </span>
                {isLive ? (
                    <span className="live-badge-glow">AO VIVO</span>
                ) : (
                    <span className="time-badge">
                        {new Date(m.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                )}
            </div>

            {/* Content: Teams & Score */}
            <div className="match-card-body">
                <div className="team-info">
                    <img src={m.teams.home.logo} alt="" className="team-logo-premium" />
                    <span className="team-name">{m.teams.home.name}</span>
                </div>

                <div className="score-container">
                    <span className="vs-text">VS</span>
                </div>

                <div className="team-info">
                    <img src={m.teams.away.logo} alt="" className="team-logo-premium" />
                    <span className="team-name">{m.teams.away.name}</span>
                </div>
            </div>

            {/* Footer: Transmission Channels */}
            <div className="match-card-footer">
                <div className="transmission-list">
                    {rde.embeds && rde.embeds.slice(0, 4).map((ch, idx) => (
                        <div 
                            key={idx} 
                            className={`channel-icon-wrap ${ch.zoroflix_id ? 'zoroflix-match' : ''}`}
                            title={ch.provider}
                            onClick={(e) => handleChannelClick(ch, e)}
                        >
                            <img src={ch.zoroflix_logo || ch.logo} alt={ch.provider} />
                            {ch.zoroflix_id && <div className="zoro-indicator"><PlayCircle size={10} /></div>}
                        </div>
                    ))}
                    {rde.embeds && rde.embeds.length > 4 && (
                        <span className="more-channels">+{rde.embeds.length - 4}</span>
                    )}
                </div>
                
                <button className="watch-btn-main" onClick={() => openModal(m)}>
                    <Tv size={14} /> Assistir
                </button>
            </div>
        </div>
    );
  };

  return (
    <div className="sports-section-premium" style={{ width: '100%', minWidth: 0 }}>
      
      {liveMatches.length > 0 && (
        <div className="content-row-container">
          <h3 className="row-title section-title-premium">
            <span className="live-dot-pulse"></span> Jogos Ao Vivo
          </h3>
          <div className="row-wrapper">
            <button className="row-nav-btn left" onClick={() => handleScroll(liveRowRef, 'left')}>&#10094;</button>
            <div className="row-posters" ref={liveRowRef}>
              {liveMatches.map(m => renderMatch(m))}
            </div>
            <button className="row-nav-btn right" onClick={() => handleScroll(liveRowRef, 'right')}>&#10095;</button>
          </div>
        </div>
      )}

      {upcomingMatches.length > 0 && (
        <div className="content-row-container" style={{marginTop: '1rem'}}>
          <h3 className="row-title section-title-premium">
            <Timer size={18} /> Próximos Jogos do Dia
          </h3>
          <div className="row-wrapper">
            <button className="row-nav-btn left" onClick={() => handleScroll(upcomingRowRef, 'left')}>&#10094;</button>
            <div className="row-posters" ref={upcomingRowRef}>
              {upcomingMatches.map(m => renderMatch(m))}
            </div>
            <button className="row-nav-btn right" onClick={() => handleScroll(upcomingRowRef, 'right')}>&#10095;</button>
          </div>
        </div>
      )}

      {/* Modal de Transmissões */}
      {selectedMatchForModal && (
          <div className="sports-modal-overlay" onClick={closeModal}>
              <div className="sports-modal-content" onClick={e => e.stopPropagation()}>
                  <div className="sports-modal-header">
                      <h3>Onde Assistir</h3>
                      <button className="close-modal-btn" onClick={closeModal}>&times;</button>
                  </div>
                  <div className="sports-modal-body">
                      {selectedMatchForModal.rde_custom?.embeds ? (() => {
                          const embeds = selectedMatchForModal.rde_custom.embeds;
                          const internal = embeds.filter(ch => ch.zoroflix_id);
                          const external = embeds.filter(ch => !ch.zoroflix_id);

                          return (
                              <>
                                  {internal.length > 0 && (
                                      <div className="modal-channel-group">
                                          <h4>Players Principais (No Site)</h4>
                                          <div className="modal-channel-list">
                                              {internal.map((ch, idx) => (
                                                  <button key={idx} className="btn-modal-channel internal" onClick={() => navigate(`/canal/${ch.zoroflix_id}`)}>
                                                      <img src={ch.zoroflix_logo || ch.logo} alt={ch.provider} />
                                                      <span>{ch.provider}</span>
                                                      <PlayCircle size={14} style={{marginLeft: 'auto'}} />
                                                  </button>
                                              ))}
                                          </div>
                                      </div>
                                  )}
                                  
                                  <div className="modal-channel-group">
                                      <h4>Players Secundários (Externo no App)</h4>
                                      <div className="modal-channel-list">
                                          {external.map((ch, idx) => (
                                              <button 
                                                key={idx} 
                                                className="btn-modal-channel external" 
                                                onClick={() => navigate(`/canal/rde-${selectedMatchForModal?.fixture?.id}`, { 
                                                    state: { 
                                                        embed_url: ch.embed_url, 
                                                        title: `${selectedMatchForModal.teams.home.name} vs ${selectedMatchForModal.teams.away.name} (${ch.provider})` 
                                                    } 
                                                })}
                                              >
                                                  <img src={ch.logo} alt={ch.provider} />
                                                  <span>{ch.provider}</span>
                                              </button>
                                          ))}
                                          {/* Fallback Rei dos Embeds Principal */}
                                          {selectedMatchForModal.rde_custom.play_url && (
                                              <button 
                                                className="btn-modal-channel external" 
                                                onClick={() => navigate(`/canal/rde-${selectedMatchForModal?.fixture?.id}`, { 
                                                    state: { 
                                                        embed_url: selectedMatchForModal.rde_custom.play_url, 
                                                        title: `${selectedMatchForModal.teams.home.name} vs ${selectedMatchForModal.teams.away.name} (RDE Main)` 
                                                    } 
                                                })}
                                              >
                                                  <Radio size={14} />
                                                  <span>Player Original (RDE)</span>
                                              </button>
                                          )}
                                      </div>
                                  </div>
                              </>
                          );
                      })() : (
                          <div style={{padding: '2rem', textAlign:'center', color: '#888'}}>Nenhuma transmissão encontrada.</div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

