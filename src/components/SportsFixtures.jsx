import { useState, useEffect, useRef } from 'react';
import { Timer, Radio } from 'lucide-react';

export default function SportsFixtures() {
  const [liveMatches, setLiveMatches] = useState([]);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const liveRowRef = useRef(null);
  const upcomingRowRef = useRef(null);

  useEffect(() => {
    const fetchSportsData = async () => {
      try {
        const resp = await fetch('/api/sports/fixtures?t=' + Date.now());
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

        const ALLOWED_LEAGUES = [
            { name: ['Série A', 'Serie A', 'Brasileirão', 'Betano'], country: 'Brazil' },
            { name: ['Série B', 'Serie B'], country: 'Brazil' },
            { name: ['Paulista'], country: 'Brazil' },
            { name: ['Copa do Brasil', 'Copa Betano'], country: 'Brazil' },
            { name: ['La Liga', 'LaLiga'], country: 'Spain' },
            { name: ['Ligue 1'], country: 'France' },
            { name: ['Premier League'], country: 'England' },
            { name: ['Serie A'], country: 'Italy' },
            { name: ['Copa América', 'Copa America'], country: 'World' },
            { name: ['Champions League', 'Liga dos Campeões'], country: 'World' },
            { name: ['Europa League', 'Liga Europa'], country: 'World' },
            { name: ['Copa Libertadores', 'Libertadores'], country: 'World' },
            { name: ['Sul-Americana', 'Copa Sudamericana', 'Sul Americana'], country: 'World' },
            { name: ['World Cup', 'Campeonato do Mundo', 'Copa do Mundo'], country: 'World' }
        ];

        allToday.forEach(f => {
            const leagueName = f.league.name;
            const leagueCountry = f.league.country;

            const isAllowed = ALLOWED_LEAGUES.some(allowed => {
                const nameMatches = allowed.name.some(n => leagueName.toLowerCase().includes(n.toLowerCase()));
                // Se for liga nacional, checa país. Se for internacional (World), ignora país.
                const countryMatches = allowed.country === 'World' || leagueCountry.toLowerCase() === allowed.country.toLowerCase();
                return nameMatches && countryMatches;
            });

            const isYouth = ['U20', 'U18', 'U23', 'Sub-', 'Youth', 'Sub20', 'Sub17'].some(y => 
                leagueName.toUpperCase().includes(y.toUpperCase())
            );

            if (!isAllowed || isYouth) return;

            const matchTime = new Date(f.fixture.date).getTime();
            const diffMinutes = (now - matchTime) / (1000 * 60);

            if (diffMinutes >= 0 && diffMinutes <= 105) {
                live.push(f);
            } else if (diffMinutes < 0) {
                upcoming.push(f);
            }
        });

        upcoming.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

        setLiveMatches(live.slice(0, 20));
        setUpcomingMatches(upcoming.slice(0, 30));

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

  const handleScroll = (ref, direction) => {
    if (ref.current) {
      const { scrollLeft, clientWidth } = ref.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      ref.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

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

  const renderMatch = (m, isLive) => {
    const matchTime = new Date(m.fixture.date).getTime();
    const elapsed = Math.floor((new Date().getTime() - matchTime) / (1000 * 60));

    return (
        <div key={m.fixture.id} className={`match-card-standard ${isLive ? 'live' : 'upcoming'}`}>
            <div className="match-league-mini">{m.league.name}</div>
            <div className="match-teams-horizontal">
                <div className="team-col">
                    <img src={m.teams.home.logo} alt="" className="team-logo-small" title={m.teams.home.name} />
                    <span className="team-name-tiny">{m.teams.home.name}</span>
                </div>
                <span className="vs-mini">{isLive ? 'x' : 'vs'}</span>
                <div className="team-col">
                    <img src={m.teams.away.logo} alt="" className="team-logo-small" title={m.teams.away.name} />
                    <span className="team-name-tiny">{m.teams.away.name}</span>
                </div>
            </div>
            {isLive ? (
                <div className="match-time-badge">{elapsed > 45 && elapsed < 60 ? 'INT' : `${elapsed}'`}</div>
            ) : (
                <div className="match-start-time-mini">
                    {new Date(m.fixture.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
            )}
        </div>
    );
  };

  return (
    <div className="sports-section-standard">
      
      {liveMatches.length > 0 && (
        <div className="content-row-container sports-custom-limit">
          <h3 className="row-title" style={{fontSize: '1.2rem'}}><span className="live-dot"></span> Ao Vivo</h3>
          <div className="row-wrapper">
            <button className="row-nav-btn left" onClick={() => handleScroll(liveRowRef, 'left')}>&#10094;</button>
            <div className="row-posters" ref={liveRowRef} style={{padding: '1rem 0'}}>
              {liveMatches.map(m => renderMatch(m, true))}
            </div>
            <button className="row-nav-btn right" onClick={() => handleScroll(liveRowRef, 'right')}>&#10095;</button>
          </div>
        </div>
      )}

      {upcomingMatches.length > 0 && (
        <div className="content-row-container sports-custom-limit">
          <h3 className="row-title" style={{fontSize: '1.2rem'}}><Timer size={16} /> Próximos Jogos</h3>
          <div className="row-wrapper">
            <button className="row-nav-btn left" onClick={() => handleScroll(upcomingRowRef, 'left')}>&#10094;</button>
            <div className="row-posters" ref={upcomingRowRef} style={{padding: '1rem 0'}}>
              {upcomingMatches.map(m => renderMatch(m, false))}
            </div>
            <button className="row-nav-btn right" onClick={() => handleScroll(upcomingRowRef, 'right')}>&#10095;</button>
          </div>
        </div>
      )}
    </div>
  );
}
