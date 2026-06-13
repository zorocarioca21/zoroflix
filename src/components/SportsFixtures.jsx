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

            // Jogo está "Ao Vivo" se começou há menos de 105 minutos (contando intervalo)
            if (diffMinutes >= 0 && diffMinutes <= 105) {
                live.push(f);
            } 
            // Jogo é "Próximo" se ainda não começou
            else if (diffMinutes < 0) {
                upcoming.push(f);
            }
        });

        setLiveMatches(live.slice(0, 10));
        setUpcomingMatches(upcoming.sort((a,b) => new Date(a.fixture.date) - new Date(b.fixture.date)).slice(0, 15));

      } catch (err) {
        console.error("Erro ao processar dados esportivos:", err);
        setError("Não foi possível carregar os jogos agora.");
      } finally {
        setLoading(false);
      }
    };

    fetchSportsData();
    // Atualizar a cada minuto para mover os jogos de categoria sem nova requisição à API
    const interval = setInterval(fetchSportsData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
        <div className="sports-no-key">
            <Radio size={40} />
            <h3>Jogos do Dia</h3>
            <p>{error.includes("Key não configurada") ? 
               "O campo API_KEY no servidor está vazio." : 
               "Erro ao conectar com o serviço de esportes."}
            </p>
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
            <h3 className="sports-title"><span className="live-dot"></span> Ao Vivo (Estimado)</h3>
            <span className="sports-count">{liveMatches.length} em andamento</span>
          </div>
          <div className="sports-grid-scroll">
            {liveMatches.map(m => {
                const matchTime = new Date(m.fixture.date).getTime();
                const elapsed = Math.floor((new Date().getTime() - matchTime) / (1000 * 60));
                
                return (
                    <div key={m.fixture.id} className="match-card live">
                        <div className="match-league">{m.league.name}</div>
                        <div className="match-teams-live-simple">
                            <div className="team-row">
                                <img src={m.teams.home.logo} alt="" />
                                <span>{m.teams.home.name}</span>
                            </div>
                            <div className="match-vs-simple">v</div>
                            <div className="team-row">
                                <img src={m.teams.away.logo} alt="" />
                                <span>{m.teams.away.name}</span>
                            </div>
                        </div>
                        <div className="match-time-live">{elapsed > 45 && elapsed < 60 ? 'Intervalo' : `${elapsed}'`}</div>
                    </div>
                );
            })}
          </div>
        </div>
      )}

      {upcomingMatches.length > 0 && (
        <div className="sports-row">
          <div className="sports-row-header">
            <h3 className="sports-title"><Timer size={18} /> Próximos Jogos</h3>
            <span className="sports-count">{upcomingMatches.length} hoje</span>
          </div>
          <div className="sports-grid-scroll">
            {upcomingMatches.map(m => (
              <div key={m.fixture.id} className="match-card incoming">
                <div className="match-league">{m.league.name}</div>
                <div className="match-teams">
                  <div className="team-mini">
                    <img src={m.teams.home.logo} alt="" />
                    <span>{m.teams.home.name}</span>
                  </div>
                  <div className="vs">vs</div>
                  <div className="team-mini">
                    <img src={m.teams.away.logo} alt="" />
                    <span>{m.teams.away.name}</span>
                  </div>
                </div>
                <div className="match-start-time">
                  {new Date(m.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
