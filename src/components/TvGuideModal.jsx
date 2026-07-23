import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Tv, RefreshCw, Search, Clock, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse XMLTV timestamp "20260620041200 -0300" → Date object */
function parseXmltvDate(str) {
  // Format: YYYYMMDDHHMMSS ±HHMM
  const m = str.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})$/);
  if (!m) return null;
  const [, year, month, day, hour, min, sec, tz] = m;
  const tzSign = tz[0] === '+' ? 1 : -1;
  const tzH = parseInt(tz.slice(1, 3));
  const tzM = parseInt(tz.slice(3, 5));
  const utcMs =
    Date.UTC(+year, +month - 1, +day, +hour, +min, +sec) -
    tzSign * (tzH * 60 + tzM) * 60000;
  return new Date(utcMs);
}

/** Get current time as Date — .getTime() is always UTC */
function nowSP() {
  return new Date(); // Date.now() is always UTC; display locally via toLocaleString
}

/** Format a Date to HH:MM */
function formatTime(date) {
  if (!date) return '--:--';
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/** Calculate progress percentage 0-100, or -1 if not started, or 101 if finished */
function getProgress(start, stop) {
  const now = Date.now();
  const s = start.getTime();
  const e = stop.getTime();
  if (now < s) return -1;
  if (now > e) return 101;
  return Math.round(((now - s) / (e - s)) * 100);
}

/** Parse XML string into channels + programmes */
function parseXmlTv(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const channels = {};
  doc.querySelectorAll('channel').forEach((ch) => {
    const id = ch.getAttribute('id');
    const name = ch.querySelector('display-name')?.textContent || id;
    channels[id] = { id, name };
  });

  const programmes = [];
  doc.querySelectorAll('programme').forEach((p) => {
    const channelId = p.getAttribute('channel');
    const start = parseXmltvDate(p.getAttribute('start') || '');
    const stop = parseXmltvDate(p.getAttribute('stop') || '');
    const title = p.querySelector('title')?.textContent || '';
    const desc = p.querySelector('desc')?.textContent || '';
    if (!start || !stop || !channelId) return;
    programmes.push({ channelId, start, stop, title, desc });
  });

  // Group programmes by channel, sorted by start time
  const byChannel = {};
  programmes.forEach((prog) => {
    if (!byChannel[prog.channelId]) byChannel[prog.channelId] = [];
    byChannel[prog.channelId].push(prog);
  });
  Object.values(byChannel).forEach((progs) =>
    progs.sort((a, b) => a.start - b.start)
  );

  const chCount = Object.keys(channels).length;
  const progCount = programmes.length;
  const nowMs = Date.now();
  const liveProgs = programmes.filter(p => nowMs >= p.start.getTime() && nowMs <= p.stop.getTime());
  const minStart = programmes.reduce((a, p) => Math.min(a, p.start.getTime()), Infinity);
  const maxStop  = programmes.reduce((a, p) => Math.max(a, p.stop.getTime()), -Infinity);

  console.log(`[TvGuide] ${chCount} canais | ${progCount} programas`);
  console.log(`[TvGuide] Cobertura: ${new Date(minStart).toISOString()} → ${new Date(maxStop).toISOString()}`);
  console.log(`[TvGuide] Agora: ${new Date(nowMs).toISOString()} | AO VIVO: ${liveProgs.length}`);
  if (liveProgs.length > 0) {
    const s = liveProgs[0];
    console.log(`[TvGuide] Ex. ao vivo: "${s.title}" [${s.channelId}] ${s.start.toISOString()}–${s.stop.toISOString()}`);
  }

  return { channels, byChannel };
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ProgressBar({ progress }) {
  const clamped = Math.max(0, Math.min(100, progress));
  const color =
    clamped < 33 ? '#22c55e' : clamped < 66 ? '#f59e0b' : '#ef4444';
  return (
    <div className="tvg-prog-progresstrack">
      <div
        className="tvg-prog-progressfill"
        style={{ width: `${clamped}%`, background: color }}
      />
    </div>
  );
}

function ProgramCard({ prog, now, onClick }) {
  const progress = getProgress(prog.start, prog.stop);
  const isLive = progress >= 0 && progress <= 100;
  const isPast = progress > 100;
  const durationMin = Math.round((prog.stop - prog.start) / 60000);

  return (
    <div
      className={`tvg-prog-card ${isLive ? 'live' : ''} ${isPast ? 'past' : ''}`}
      onClick={() => onClick && onClick(prog)}
      title={`${prog.title}\n${formatTime(prog.start)} – ${formatTime(prog.stop)}\n${prog.desc}`}
    >
      {isLive && <span className="tvg-live-badge">NO AR</span>}
      <div className="tvg-prog-title">{prog.title}</div>
      <div className="tvg-prog-times">
        {formatTime(prog.start)} – {formatTime(prog.stop)}
        <span className="tvg-prog-dur">{durationMin}min</span>
      </div>
      {isLive && <ProgressBar progress={progress} />}
    </div>
  );
}

function ChannelRow({ channel, programmes, now, logoMap, onWatch }) {
  const logoUrl = logoMap?.[channel.id] || logoMap?.[channel.name] || null;
  const [expanded, setExpanded] = useState(null);

  // Find current + upcoming programmes (filter out past programs)
  const upcoming = programmes.filter(
    (p) => getProgress(p.start, p.stop) <= 100
  );

  const current = programmes.find(
    (p) => getProgress(p.start, p.stop) >= 0 && getProgress(p.start, p.stop) <= 100
  );

  const next = programmes.find(
    (p) => p.start > now && (!current || p.start > current.start)
  );

  return (
    <div className="tvg-channel-row">
      {/* Channel identity */}
      <div className="tvg-channel-id">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={channel.name}
            className="tvg-channel-logo"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <span
          className="tvg-channel-fallback"
          style={{ display: logoUrl ? 'none' : 'flex' }}
        >
          <Tv size={16} />
        </span>
        <span className="tvg-channel-name">{channel.name}</span>
      </div>

      {/* Programme timeline scroll */}
      <div className="tvg-progs-scroll">
        {upcoming.length > 0 ? (
          upcoming.map((prog, i) => (
            <ProgramCard
              key={i}
              prog={prog}
              now={now}
              onClick={(p) => setExpanded(expanded?.title === p.title ? null : p)}
            />
          ))
        ) : (
          <div className="tvg-no-data">Sem programação disponível</div>
        )}
      </div>

      {/* Expanded description */}
      {expanded && (
        <div className="tvg-expanded-desc">
          <strong>{expanded.title}</strong>
          <span>
            {formatTime(expanded.start)} – {formatTime(expanded.stop)}
          </span>
          <p>{expanded.desc || 'Sem descrição disponível.'}</p>
          <div className="tvg-expanded-actions">
            <button className="tvg-watch-btn" onClick={() => onWatch(channel.id)}>
              <Play size={14} fill="currentColor" /> Assistir
            </button>
            <button onClick={() => setExpanded(null)}>✕ Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function TvGuideModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null); // { channels, byChannel }
  const [logoMap, setLogoMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => nowSP());
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const timerRef = useRef(null);
  const fetchedRef = useRef(false);

  // Tick every second
  useEffect(() => {
    if (!isOpen) return;
    timerRef.current = setInterval(() => setNow(nowSP()), 1000);
    return () => clearInterval(timerRef.current);
  }, [isOpen]);

  // Fetch channel logos from Superflix to overlay on guide
  const fetchLogos = useCallback(async () => {
    try {
      const proxies = [
        (u) => `/api-proxy?url=${encodeURIComponent(u)}`,
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      ];
      const url = 'https://superflixapi.fit/lista?category=canais&format=json';
      for (const getProxy of proxies) {
        try {
          const res = await fetch(getProxy(url));
          if (!res.ok) continue;
          const json = await res.json();
          const channels = json?.data || [];
          const map = {};
          channels.forEach((ch) => {
            if (ch.logo_url) {
              // Map by id and by name (lowercase) for fuzzy matching
              map[ch.id] = ch.logo_url;
              map[ch.name?.toLowerCase()] = ch.logo_url;
            }
          });
          setLogoMap(map);
          return;
        } catch (_) {
          continue;
        }
      }
    } catch (_) {}
  }, []);

  // Fetch & parse guide XML
  const fetchGuide = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = 'https://reidosembeds.com/api/guia';

    const extractXml = (raw) => {
      if (!raw) return null;
      if (typeof raw === 'string' && (raw.trimStart().startsWith('<?xml') || raw.includes('<tv'))) {
        return raw;
      }
      if (typeof raw === 'string' && raw.trimStart().startsWith('"')) {
        try {
          const parsed = JSON.parse(raw);
          if (typeof parsed === 'string' && (parsed.includes('<tv>') || parsed.includes('<?xml'))) return parsed;
        } catch (_) {}
      }
      if (typeof raw === 'string') {
        try {
          const j = JSON.parse(raw);
          if (j?.contents && typeof j.contents === 'string') return j.contents;
        } catch (_) {}
      }
      return null;
    };

    const proxies = [
      // 1. Rota dedicada de EPG no backend (rápida, com cache e sem problemas de CORS)
      async () => {
        const res = await fetch('/api/epg');
        if (!res.ok) throw new Error('EPG route fail');
        const raw = await res.text();
        return extractXml(raw);
      },
      // 2. Proxy interno genérico
      async (u) => {
        const res = await fetch(`/api-proxy?url=${encodeURIComponent(u)}`);
        if (!res.ok) throw new Error('proxy fail');
        const raw = await res.text();
        return extractXml(raw);
      },
      // 3. Fallbacks externos
      async (u) => {
        const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`);
        if (!res.ok) throw new Error('proxy fail');
        const raw = await res.text();
        return extractXml(raw);
      },
      async (u) => {
        const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(u)}`);
        if (!res.ok) throw new Error('proxy fail');
        const raw = await res.text();
        return extractXml(raw);
      }
    ];

    for (const tryProxy of proxies) {
      try {
        const xml = await tryProxy(url);
        if (!xml || (!xml.includes('<tv>') && !xml.includes('<?xml'))) continue;
        const parsed = parseXmlTv(xml);
        if (Object.keys(parsed.channels).length === 0) continue;
        setData(parsed);
        setLoading(false);
        return;
      } catch (_) {
        continue;
      }
    }

    setError('Não foi possível carregar o guia. Tente novamente.');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen && !fetchedRef.current) {
      fetchedRef.current = true;
      fetchGuide();
      fetchLogos();
    }
    if (!isOpen) fetchedRef.current = false;
  }, [isOpen, fetchGuide, fetchLogos]);

  // Keyboard close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter channels - only keeping channels with a LIVE passing program
  const channelList = data
    ? Object.values(data.channels)
        .filter((ch) => {
          const progs = data.byChannel[ch.id] || [];
          const hasLive = progs.some((p) => { const pg = getProgress(p.start, p.stop); return pg >= 0 && pg <= 100; });
          
          if (!hasLive) return false; // Automaticamente só o que tá no ar
          
          if (search) {
            const nameLower = ch.name.toLowerCase();
            const matchName = nameLower.includes(search.toLowerCase());
            const matchProg = progs.some((p) => p.title.toLowerCase().includes(search.toLowerCase()));
            return matchName || matchProg;
          }
          
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name)) // Ordem alfabética para canais ao vivo
    : [];

  const liveCount = channelList.length;


  return (
    <div className="tvg-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tvg-modal">
        {/* Header */}
        <div className="tvg-header">
          <div className="tvg-header-left">
            <div className="tvg-header-icon">📺</div>
            <div>
              <h2 className="tvg-header-title">Guia de Programação</h2>
              <p className="tvg-header-sub">
                Horário de Brasília · {now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                {data && (
                  <span className="tvg-live-count"> · {liveCount} canais no ar</span>
                )}
              </p>
            </div>
          </div>
          <div className="tvg-header-actions">
            <button
              className="tvg-refresh-btn"
              onClick={() => { fetchedRef.current = false; fetchGuide(); fetchLogos(); }}
              title="Atualizar guia"
            >
              <RefreshCw size={16} />
            </button>
            <button className="tvg-close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="tvg-toolbar">
          <div className="tvg-search-wrap">
            <Search size={15} className="tvg-search-icon" />
            <input
              type="text"
              className="tvg-search-input"
              placeholder="Buscar canal ou programa..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisibleCount(10); }}
            />
          </div>
        </div>

        {/* Clock bar — real time indicator */}
        <div className="tvg-clock-bar">
          <Clock size={13} />
          <span>Agora: {now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <div className="tvg-clock-pulse" />
        </div>

        {/* Content */}
        <div className="tvg-body">
          {loading && (
            <div className="tvg-loading">
              <div className="tvg-spinner" />
              <p>Carregando programação...</p>
            </div>
          )}

          {error && !loading && (
            <div className="tvg-error">
              <p>⚠️ {error}</p>
              <button onClick={fetchGuide}>Tentar novamente</button>
            </div>
          )}

          {data && !loading && (
            <>
              {channelList.length === 0 ? (
                <div className="tvg-empty">Nenhum canal encontrado para sua busca.</div>
              ) : (
                <div className="tvg-grid">
                  {channelList.slice(0, visibleCount).map((ch) => (
                    <ChannelRow
                      key={ch.id}
                      channel={ch}
                      programmes={data.byChannel[ch.id] || []}
                      now={now}
                      logoMap={logoMap}
                      onWatch={(id) => { onClose(); navigate(`/canal/${id}`); }}
                    />
                  ))}
                  {visibleCount < channelList.length && (
                    <button 
                      className="tvg-load-more"
                      onClick={() => setVisibleCount((v) => v + 10)}
                    >
                      Carregar mais canais ({channelList.length - visibleCount} restantes)
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="tvg-footer">
          <span>Fonte: Rei dos Embeds</span>
          {data && <span>Exibindo {Math.min(visibleCount, channelList.length)} de {channelList.length} canais no ar</span>}
        </div>
      </div>
    </div>
  );
}
