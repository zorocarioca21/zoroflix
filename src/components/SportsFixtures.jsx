import { useState, useEffect } from 'react';
import { fetchWithProxy } from '../utils/api';
import { Timer, Trophy, Radio, ArrowRight } from 'lucide-react';

/* 
  FOOTBALL API NOTE:
  I'm using API-Sports (api-football.com). 
  User needs to get a free API Key at https://dashboard.api-sports.io/
*/

const API_KEY = ""; // USER: COLOQUE SUA CHAVE AQUI

export default function SportsFixtures() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [todayMatches, setTodayMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!API_KEY) {
        setLoading(false);
        return;
    }

    const fetchSportsData = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        
        // 1. Jogos Ao Vivo
        const liveUrl = `https://v3.football.api-sports.io/fixtures?live=all`;
        // 2. Jogos do Dia
        const todayUrl = `https://v3.football.api-sports.io/fixtures?date=${today}`;

        const headers = {
          'x-rapidapi-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io'
        };

        // Note: fetchWithProxy doesn't support custom headers easily in its current form for external APIs that need Auth
        // I might need to adjust it or call fetch directly if proxying headers is tricky.
        // But let's try direct fetch first, and if CORS hits, I'll use the proxy or recommend a backend route.
        
        const fetchFixture = async (url) => {
            const res = await fetch(url, { headers });
            const data = await res.json();
            return data.response || [];
        };

        const [live, daily] = await Promise.all([
          fetchFixture(liveUrl),
          fetchFixture(todayUrl)
        ]);

        setLiveMatches(live.slice(0, 8)); // Limitar 8 jogos
        
        // Filtrar daily para não incluir os que já estão live
        const incoming = daily.filter(f => f.fixture.status.short === 'NS').slice(0, 10);
        setTodayMatches(incoming);

      } catch (err) {
        console.error("Erro ao buscar dados esportivos:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSportsData();
  }, []);

  if (!API_KEY) {
    return (
        <div className="sports-no-key">
            <Radio size={40} />
            <h3>Jogos do Dia</h3>
            <p>Para exibir o placar ao vivo e os jogos do dia, você precisa de uma chave da <b>API-Sports</b>.</p>
            <a href="https://dashboard.api-sports.io/register" target="_blank" className="btn-get-key">Obter Chave Grátis</a>
        </div>
    );
  }

  if (loading) return null;

  return (
    <div className="sports-section-container">
      
      {liveMatches.length > 0 && (
        <div className="sports-row">
          <div className="sports-row-header">
            <h3 className="sports-title"><span className="live-dot"></span> Ao Vivo Agora</h3>
            <span className="sports-count">{liveMatches.length} jogos</span>
          </div>
          <div className="sports-grid-scroll">
            {liveMatches.map(m => (
              <div key={m.fixture.id} className="match-card live">
                <div className="match-league">{m.league.name}</div>
                <div className="match-teams">
                  <div className="team">
                    <img src={m.teams.home.logo} alt="" />
                    <span>{m.teams.home.name}</span>
                    <span className="score">{m.goals.home}</span>
                  </div>
                  <div className="team">
                    <img src={m.teams.away.logo} alt="" />
                    <span>{m.teams.away.name}</span>
                    <span className="score">{m.goals.away}</span>
                  </div>
                </div>
                <div className="match-time-live">{m.fixture.status.elapsed}'</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {todayMatches.length > 0 && (
        <div className="sports-row">
          <div className="sports-row-header">
            <h3 className="sports-title"><Timer size={18} /> Jogos de Hoje</h3>
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
      )}
    </div>
  );
}
