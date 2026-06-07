import React, { useEffect } from 'react';

/**
 * AdBanner – componente de placeholder para anúncios de banner da Adsterra.
 *
 * O código real do anúncio será inserido no painel da Adsterra e colado
 * aqui como um <script> externo. Enquanto isso, deixamos um contêiner
 * visual para que você veja onde o banner aparecerá.
 */
export default function AdBanner({ adId }) {
  // O Adsterra normalmente injeta o script que cria o banner dentro
  // de um elemento <div id="adsterra-banner-{adId}"></div>.
  // Vamos garantir que o container exista antes de o script rodar.
  useEffect(() => {
    const container = document.getElementById(`adsterra-banner-${adId}`);
    if (container) {
      // Se o script da Adsterra já estiver carregado, ele vai preencher
      // o container automaticamente. Caso contrário, não faz nada.
    }
  }, [adId]);

  return (
    <div
      id={`adsterra-banner-${adId}`}
      className="ad-banner"
      style={{
        width: '100%',
        maxWidth: '728px',
        height: '90px',
        margin: '1.5rem auto',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.9rem',
      }}
    >
      {/* Placeholder visual – será substituído pelo script da Adsterra */}
      Anúncio Banner (300x250 ou 728x90)
    </div>
  );
}
