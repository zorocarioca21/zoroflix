import { useState, useEffect } from 'react';
import { Timer, Radio } from 'lucide-react';

export default function SportsFixtures() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSportsData = async () => {
      try {
        const resp = await fetch('/api/sports/fixtures');
        const data = await resp.json();
        
        if (data.error && !data.daily) {
            setError(data.error);
            setLoading(false);
            return;
        }

        const now = new Date().getTime();
        const allToday = data.daily || [];
        const live = [];
        const upcoming = [];

        allToday.forEach(f => {
            const matchTime = new Date(f.fixture.date).getTime();
            const diffMinutes = (now - matchTime) / (1000 * 60);

            if (diffMinutes >= 0 && diffMinutes <= 105) {
                live.push(f);
            } else if (diffMinutes < 0) {
                upcoming.push(f);
            }
        });

        // Ordenar upcoming por horário
        upcoming.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

        setLiveMatches(live.slice(0, 12));
        setUpcomingMatches(upcoming.slice(0, 15));

      } catch (err) {
        console.error("Erro ao processar dados esportivos:", err);
        setError("Não foi possível carregar os jogos agora.");
      } finally {
        setLoading(false);
      }
    };

    fetchSportsData();
    const interval = setInterval(fetchSportsData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
        <div className="sports-no-key">
            <Radio size={30} />
            <h3>Jogos do Dia</h3>
            <p>Erro ao conectar com o serviço de esportes.</p>
        </div>
    );
  }

  if (loading) return <div className="match-card-loading">Buscando programação...</div>;
  if (liveMatches.length === 0 && upcomingMatches.length === 0) return null;

  return (
    <div className="sports-section-container">
      
      {liveMatches.length > 0 && (
        <div className="sports-row">
          <div className="sports-row-header">
            <h3 className="sports-title"><span className="live-dot"></span> Ao Vivo</h3>
          </div>
          <div className="sports-slider-wrapper">
            <div className="sports-grid-scroll">
              {liveMatches.map(m => {
                  const matchTime = new Date(m.fixture.date).getTime();
                  const elapsed = Math.floor((new Date().getTime() - matchTime) / (1000 * 60));
                  
                  return (
                      <div key={m.fixture.id} className="match-card live">
                          <div className="match-league-mini">{m.league.name}</div>
                          <div className="match-teams-horizontal">
                              <div className="team-col">
                                  <img src={m.teams.home.logo} alt="" className="team-logo-small" title={m.teams.home.name} />
                                  <span className="team-name-tiny">{m.teams.home.name}</span>
                              </div>
                              <span className="vs-mini">x</span>
                              <div className="team-col">
                                  <img src={m.teams.away.logo} alt="" className="team-logo-small" title={m.teams.away.name} />
                                  <span className="team-name-tiny">{m.teams.away.name}</span>
                              </div>
                          </div>
                          <div className="match-time-badge">{elapsed > 45 && elapsed < 60 ? 'INT' : `${elapsed}'`}</div>
                      </div>
                  );
              })}
            </div>
          </div>
        </div>
      )}

      {upcomingMatches.length > 0 && (
        <div className="sports-row">
          <div className="sports-row-header">
            <h3 className="sports-title"><Timer size={16} /> Próximos</h3>
          </div>
          <div className="sports-slider-wrapper">
            <div className="sports-grid-scroll">
              {upcomingMatches.map(m => (
                <div key={m.fixture.id} className="match-card upcoming">
                  <div className="match-league-mini">{m.league.name}</div>
                  <div className="match-teams-horizontal">
                    <div className="team-col">
                        <img src={m.teams.home.logo} alt="" className="team-logo-small" title={m.teams.home.name} />
                        <span className="team-name-tiny">{m.teams.home.name}</span>
                    </div>
                    <span className="vs-mini">vs</span>
                    <div className="team-col">
                        <img src={m.teams.away.logo} alt="" className="team-logo-small" title={m.teams.away.name} />
                        <span className="team-name-tiny">{m.teams.away.name}</span>
                    </div>
                  </div>
                  <div className="match-start-time-mini">
                    {new Date(m.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
