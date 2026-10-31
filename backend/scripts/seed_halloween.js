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

/* Fundo Temático com Abóboras e Noite Sombria */
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
  background: rgba(20, 8, 30, 0.85) !important;
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

/* Destaques e cards */
.movie-card:hover {
  border-color: #ff6a00 !important;
  box-shadow: 0 10px 30px rgba(255, 106, 0, 0.4) !important;
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
