import { useState, useEffect } from 'react';
import { Timer, Radio } from 'lucide-react';

export default function SportsFixtures() {
  const [todayMatches, setTodayMatches] = useState([]);
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

        const now = new Date();

        // Filtrar apenas jogos que ainda NÃO começaram (Status NS = Not Started)
        // E que o horário de início seja maior que o atual
        const incoming = (data.daily || [])
          .filter(f => {
            const matchDate = new Date(f.fixture.date);
            return f.fixture.status.short === 'NS' && matchDate > now;
          })
          .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date))
          .slice(0, 15);

        setTodayMatches(incoming);

      } catch (err) {
        console.error("Erro ao buscar dados esportivos do backend:", err);
        setError("Não foi possível carregar os jogos agora.");
      } finally {
        setLoading(false);
      }
    };

    fetchSportsData();
  }, []);

  if (error) {
    return (
        <div className="sports-no-key">
            <Radio size={40} />
            <h3>Jogos do Dia</h3>
            <p>{error.includes("Key não configurada") ? 
               "O campo API_KEY no servidor está vazio. Configure sua chave para ver os jogos." : 
               "Erro ao conectar com o serviço de esportes."}
            </p>
        </div>
    );
  }

  if (loading) return <div className="match-card-loading">Buscando programação de jogos...</div>;
  if (todayMatches.length === 0) return null;

  return (
    <div className="sports-section-container">
      <div className="sports-row">
        <div className="sports-row-header">
          <h3 className="sports-title"><Timer size={18} /> Jogos de Hoje</h3>
          <span className="sports-count">{todayMatches.length} jogos programados</span>
        </div>
        <div className="sports-grid-scroll">
          {todayMatches.map(m => (
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
    </div>
  );
}
