import { initDB } from '../db.js';

async function seedHalloweenTheme() {
    const db = await initDB();

    const halloweenCss = `/* ==========================================================
   TEMA HALLOWEEN TERROR & CHIEFS - CINEGEEK
   ========================================================== */

:root {
  --primary: #ff6a00 !important;
  --primary-hover: #ff8800 !important;
  --bg: #09030e !important;
  --bg-card: #15091e !important;
  --accent: #ff4500 !important;
  --glow: 0 0 20px rgba(255, 106, 0, 0.6) !important;
  --border-neon: 1px solid rgba(255, 106, 0, 0.4) !important;
}

/* Fundo Temático com Abóboras e Noite Sombria apenas no site geral (não na página de detalhes) */
body {
  background-color: #08020d !important;
  background-image: url('/bg-halloween.png') !important;
  background-attachment: fixed !important;
  background-position: top center !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;
}

body::before {
  background: radial-gradient(circle at 50% 10%, rgba(255, 106, 0, 0.22) 0%, rgba(13, 3, 20, 0.65) 60%, #08020d 100%) !important;
  pointer-events: none !important;
}

body::after {
  display: none !important;
}

/* Na página de detalhes (/filme/..., /serie/...), manter o backdrop oficial da produção com degradê temático */
.details-container {
  position: relative !important;
  background: transparent !important;
}

.details-hero {
  opacity: 0.65 !important;
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(8, 2, 13, 0) 100%) !important;
  mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 50%, rgba(8, 2, 13, 0) 100%) !important;
}

/* Substituição da Logo para CineGeek Halloween em Chamas */
.logo-brand .logo-img {
  content: url('/logo-halloween.png') !important;
  height: 68px !important;
  max-width: 290px !important;
  filter: drop-shadow(0 0 16px rgba(255, 106, 0, 0.85)) !important;
  object-fit: contain !important;
}

/* Navbar Temática Roxa & Laranja */
.nav-pill {
  background: rgba(20, 8, 30, 0.88) !important;
  border: 1px solid rgba(255, 106, 0, 0.45) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 18px rgba(255, 106, 0, 0.25) !important;
}

.nav-item:hover, .nav-item.active, .nav-item.home-item {
  color: #ff8800 !important;
}

.navbar-search-input {
  border-color: rgba(255, 106, 0, 0.4) !important;
  box-shadow: 0 0 12px rgba(255, 106, 0, 0.15) !important;
}
.navbar-search-input:focus {
  border-color: #ff6a00 !important;
  box-shadow: 0 0 20px rgba(255, 106, 0, 0.5) !important;
}

/* BOTÕES COM ASAS DE MORCEGO NAS PONTAS (Exatamente como a referência) */
.install-app-btn-header,
.btn-primary,
.banner-assist-btn {
  position: relative !important;
  background: linear-gradient(135deg, #ff7b00 0%, #ff4500 100%) !important;
  color: #120300 !important;
  font-weight: 900 !important;
  border: 1px solid #ffa347 !important;
  box-shadow: 0 0 20px rgba(255, 106, 0, 0.6) !important;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.3) !important;
  overflow: visible !important;
  border-radius: 8px !important;
  padding: 0.65rem 1.8rem !important;
  transition: all 0.25s ease-in-out !important;
}

/* Asa de Morcego Esquerda */
.install-app-btn-header::before,
.btn-primary::before,
.banner-assist-btn::before {
  content: '' !important;
  position: absolute !important;
  top: 50% !important;
  left: -15px !important;
  width: 19px !important;
  height: 22px !important;
  transform: translateY(-50%) !important;
  background-color: #ff6a00 !important;
  clip-path: path('M18 11 C15 5 8 0 0 3 C4 8 3 13 0 16 C6 18 12 17 18 11 Z') !important;
  filter: drop-shadow(-2px 0 4px rgba(0,0,0,0.6)) !important;
  pointer-events: none !important;
  transition: transform 0.2s ease !important;
}

/* Asa de Morcego Direita */
.install-app-btn-header::after,
.btn-primary::after,
.banner-assist-btn::after {
  content: '' !important;
  position: absolute !important;
  top: 50% !important;
  right: -15px !important;
  width: 19px !important;
  height: 22px !important;
  transform: translateY(-50%) scaleX(-1) !important;
  background-color: #ff6a00 !important;
  clip-path: path('M18 11 C15 5 8 0 0 3 C4 8 3 13 0 16 C6 18 12 17 18 11 Z') !important;
  filter: drop-shadow(2px 0 4px rgba(0,0,0,0.6)) !important;
  pointer-events: none !important;
  transition: transform 0.2s ease !important;
}

/* Efeito Hover com Pulsação e Brilho das Asas */
.install-app-btn-header:hover,
.btn-primary:hover,
.banner-assist-btn:hover {
  background: linear-gradient(135deg, #ff9100 0%, #ff5500 100%) !important;
  box-shadow: 0 0 30px rgba(255, 106, 0, 0.9) !important;
  transform: translateY(-2px) scale(1.02) !important;
}
.install-app-btn-header:hover::before,
.btn-primary:hover::before,
.banner-assist-btn:hover::before {
  transform: translateY(-50%) rotate(-12deg) scale(1.15) !important;
}
.install-app-btn-header:hover::after,
.btn-primary:hover::after,
.banner-assist-btn:hover::after {
  transform: translateY(-50%) scaleX(-1) rotate(-12deg) scale(1.15) !important;
}

/* TAGS DOS CARDS: FILME, SÉRIE, ANIME, DORAMA */
.media-type-badge,
[class*="media-type-badge"],
.card-media-wrapper .card-badges-top + div > div,
.search-card-type,
.media-pill,
.details-type {
  background-color: #ff6a00 !important;
  color: #120300 !important;
  border-color: #ff8800 !important;
  box-shadow: 0 0 10px rgba(255, 106, 0, 0.6) !important;
  font-weight: 900 !important;
}

/* TAGS DE TEMPORADA E EPISÓDIO (T01E01, etc.) */
.recent-ep-badge,
.episodes-badge,
.card-ep-badge,
.custom-poster-card span[style*="position: absolute"] {
  color: #ff8800 !important;
  border: 1px solid rgba(255, 106, 0, 0.5) !important;
  background: rgba(18, 5, 26, 0.92) !important;
  box-shadow: 0 0 8px rgba(255, 106, 0, 0.3) !important;
}

/* CÍRCULO DA NOTA / PORCENTAGEM (SVG) */
.rating-circle-container svg circle:nth-child(2),
.rating-circle-meter {
  stroke: #ff6a00 !important;
  filter: drop-shadow(0 0 5px rgba(255, 106, 0, 0.8)) !important;
}

/* SEÇÃO DE ELENCO E INFORMAÇÕES DE FILME/SÉRIE */
.details-cast-section {
  background: #14081c !important;
  border: 1px solid rgba(255, 106, 0, 0.25) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6) !important;
}

.cast-grid-scroll {
  scrollbar-color: #ff6a00 transparent !important;
}
.cast-grid-scroll::-webkit-scrollbar-thumb {
  background: #ff6a00 !important;
  box-shadow: 0 0 10px rgba(255, 106, 0, 0.6) !important;
}

.btn-main-play {
  background: linear-gradient(135deg, #ff7b00 0%, #ff4500 100%) !important;
  color: #120300 !important;
  box-shadow: 0 0 25px rgba(255, 106, 0, 0.7) !important;
  border: none !important;
}
.btn-main-play:hover {
  background: linear-gradient(135deg, #ff9100 0%, #ff5500 100%) !important;
  box-shadow: 0 0 35px rgba(255, 106, 0, 1) !important;
}

/* BORDAS, CONTORNOS E EFEITOS NOS CARDS */
.movie-card:hover,
.hover-video-card:hover,
.custom-poster-card:hover {
  border-color: #ff6a00 !important;
  box-shadow: 0 10px 30px rgba(255, 106, 0, 0.5) !important;
}

/* CARDS E BOTÕES DA PÁGINA DE CANAIS / TRANSMISSÕES / JOGOS */
.premium-match-card {
  background: #15091e !important;
  border-color: rgba(255, 106, 0, 0.3) !important;
}
.premium-match-card:hover {
  border-color: #ff6a00 !important;
  box-shadow: 0 10px 30px rgba(255, 106, 0, 0.4) !important;
}
.match-card-overlay {
  background: linear-gradient(135deg, rgba(28, 10, 40, 0.95) 0%, rgba(13, 3, 20, 0.85) 100%) !important;
}
.watch-btn-main {
  background: rgba(255, 106, 0, 0.15) !important;
  border-color: #ff6a00 !important;
  color: #ff8800 !important;
}
.watch-btn-main:hover {
  background: #ff6a00 !important;
  color: #120300 !important;
  box-shadow: 0 0 15px rgba(255, 106, 0, 0.8) !important;
}
.live-score, .vs-text {
  color: #ff8800 !important;
  text-shadow: 0 0 10px rgba(255, 106, 0, 0.5) !important;
}

/* BARRAS DE ROLAGEM GLOBAIS */
::-webkit-scrollbar-thumb {
  background: #ff6a00 !important;
  box-shadow: 0 0 12px rgba(255, 106, 0, 0.5) !important;
}
`;

    const halloweenBody = `<!-- Halloween Decorativo -->
<div style="position: fixed; top: 18px; left: 18px; z-index: 999; pointer-events: none; opacity: 0.9;">
  <span style="font-size: 28px; filter: drop-shadow(0 0 12px rgba(255, 106, 0, 0.9));">🎃</span>
</div>
`;

    const halloweenHead = `<!-- Google Fonts / Halloween CDN -->
<link rel="preconnect" href="https://fonts.googleapis.com">
`;

    const existing = await db.get('SELECT id FROM site_themes WHERE name = ?', ['Halloween 2026']);
    if (existing) {
        await db.run(
            'UPDATE site_themes SET custom_css = ?, custom_html_body = ?, custom_html_head = ? WHERE id = ?',
            [halloweenCss, halloweenBody, halloweenHead, existing.id]
        );
        console.log('Tema Halloween 2026 atualizado com sucesso! ID:', existing.id);
    } else {
        const result = await db.run(
            'INSERT INTO site_themes (name, custom_css, custom_html_body, custom_html_head, is_active) VALUES (?, ?, ?, ?, 0)',
            ['Halloween 2026', halloweenCss, halloweenBody, halloweenHead]
        );
        console.log('Tema Halloween 2026 cadastrado com sucesso! ID:', result.lastID);
    }

    process.exit(0);
}

seedHalloweenTheme().catch(err => {
    console.error('Erro ao semear tema:', err);
    process.exit(1);
});
