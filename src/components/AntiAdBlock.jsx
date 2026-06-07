import { useState, useEffect } from 'react';

export default function AntiAdBlock() {
  const [isAdBlockActive, setIsAdBlockActive] = useState(false);

  useEffect(() => {
    const checkAdBlock = async () => {
      // Cria um elemento "isca" para o AdBlock
      const dummy = document.createElement('div');
      dummy.id = 'ad-detection-box';
      dummy.innerHTML = '&nbsp;';
      dummy.className = 'adsbox ad-zone ad-space';
      dummy.style.position = 'absolute';
      dummy.style.left = '-9999px';
      dummy.style.top = '-9999px';
      document.body.appendChild(dummy);

      // Espera um pouco para o AdBlock agir
      setTimeout(() => {
        if (dummy.offsetHeight === 0 || dummy.style.display === 'none' || !document.getElementById('ad-detection-box')) {
          setIsAdBlockActive(true);
          document.body.style.overflow = 'hidden'; // Trava o scroll do site
        }
        document.body.removeChild(dummy);
      }, 100);
    };

    checkAdBlock();
  }, []);

  if (!isAdBlockActive) return null;

  return (
    <div className="anti-adblock-overlay">
      <div className="anti-adblock-card">
        <div className="anti-adblock-icon">🚫</div>
        <h2>AdBlock Detectado!</h2>
        <p>
          Notamos que você está usando um bloqueador de anúncios. Para manter o <strong>ZoroFlix</strong> gratuito e com a melhor qualidade, precisamos que você desative o AdBlock para o nosso site.
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
