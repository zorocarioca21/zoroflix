import { useState, useEffect } from 'react';

export default function AntiAdBlock() {
  const [isAdBlockActive, setIsAdBlockActive] = useState(false);

  useEffect(() => {
    const checkAdBlock = async () => {
      let isBlocked = false;

      // 1. Checagem de Sandbox Restrito (Apps que colocam iframe com sandbox="allow-scripts" sem allow-same-origin / allow-popups / allow-forms)
      try {
        localStorage.getItem('test_sandbox');
      } catch (e) {
        if (e.name === 'SecurityError' || e.message?.includes('denied')) {
          isBlocked = true;
        }
      }

      // 1.1 Checagem se popups ou navegação foram desabilitadas por sandbox de terceiros
      try {
        if (window.self !== window.top) {
          // Se estiver dentro de iframe, verifica se window.open foi anulado ou bloqueado por sandbox
          if (typeof window.open !== 'function') {
            isBlocked = true;
          }
        }
      } catch (e) {
        // Bloqueio de acesso entre origens normal em iframes, ignora
      }

      // 2. Checagem de Rede Robusta (Pega AdGuard DNS, NextDNS, PiHole e bloqueadores no Android)
      if (!isBlocked) {
        const adEndpoints = [
          'https://pl30899842.effectivecpmnetwork.com/d9/5e/5e/d95e5e5709de2783f6993047886330c8.js',
          'https://pl29672000.effectivecpmnetwork.com/favicon.ico',
          'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
        ];

        let failedCount = 0;
        await Promise.all(
          adEndpoints.map(async (url) => {
            try {
              const testRequest = new Request(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
              await fetch(testRequest);
            } catch (error) {
              failedCount++;
            }
          })
        );

        // Se o DNS ou bloqueador de rede derrubar os domínios de anúncios
        if (failedCount >= 2) {
          isBlocked = true;
        }
      }

      // 3. Checagem Visual (Pega uBlock Origin, AdBlock Plus, Brave Shields)
      if (!isBlocked) {
        const dummy = document.createElement('div');
        dummy.id = 'ad-detection-box';
        dummy.innerHTML = '&nbsp;';
        dummy.className = 'adsbox ad-zone ad-space banner-ad text-ad sponsor-ad';
        dummy.style.position = 'absolute';
        dummy.style.left = '-9999px';
        dummy.style.top = '-9999px';
        dummy.style.width = '1px';
        dummy.style.height = '1px';
        document.body.appendChild(dummy);

        await new Promise(resolve => setTimeout(resolve, 150));

        if (dummy.offsetHeight === 0 || dummy.style.display === 'none' || !document.getElementById('ad-detection-box')) {
          isBlocked = true;
        }
        try {
          document.body.removeChild(dummy);
        } catch (e) {}
      }

      if (isBlocked) {
        setIsAdBlockActive(true);
        document.body.style.overflow = 'hidden';
      }
    };

    checkAdBlock();
    // Repete a checagem após 2 segundos para capturar bloqueadores lentos ou injeções pós-carregamento
    const timer = setTimeout(checkAdBlock, 2500);
    return () => clearTimeout(timer);
  }, []);

  if (!isAdBlockActive) return null;

  return (
    <div className="anti-adblock-overlay">
      <div className="anti-adblock-card">
        <div className="anti-adblock-icon">🚫</div>
        <h2>AdBlock Detectado!</h2>
        <p>
          Notamos que você está usando um bloqueador de anúncios. Para manter o <strong>CineGeek</strong> gratuito e com a melhor qualidade, precisamos que você desative o AdBlock para o nosso site.
        </p>
        <div className="anti-adblock-steps">
          <div className="step">1. Clique no ícone do AdBlock no seu navegador.</div>
          <div className="step">2. Selecione "Desativar neste site" ou "Whitelist".</div>
          <div className="step">3. Recarregue a página para continuar assistindo.</div>
        </div>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Já desativei, recarregar página
        </button>
      </div>
    </div>
  );
}
