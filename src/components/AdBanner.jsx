import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AdBanner({ adId }) {
  const adContainerRef = useRef(null);
  const { user, loading } = useAuth();
  const [globalAdsEnabled, setGlobalAdsEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config/ads')
      .then(r => r.json())
      .then(data => {
        setGlobalAdsEnabled(data.ads_enabled);
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (loading || !ready) return;
    if (!globalAdsEnabled) return;
    if (user?.role && user.role !== 'free') return;
    // Evita carregar múltiplas vezes se o componente remontar rapidamente
    if (adContainerRef.current && adContainerRef.current.innerHTML === '') {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://pl29672001.effectivecpmnetwork.com/40b3a4f1f3aea0d9793da7323cabebd8/invoke.js';
      script.async = true;
      script.setAttribute('data-cfasync', 'false');
      
      adContainerRef.current.appendChild(script);
    }
  }, [user, loading, globalAdsEnabled, ready]);

  if (!ready || !globalAdsEnabled || (!loading && user?.role && user.role !== 'free')) {
    return null;
  }

  return (
    <div className="ad-container-wrapper" style={{ margin: '2rem 0', textAlign: 'center', width: '100%' }}>
      <div 
        id="container-40b3a4f1f3aea0d9793da7323cabebd8" 
        ref={adContainerRef}
        style={{ minHeight: '100px', display: 'flex', justifyContent: 'center' }}
      >
        {/* O anúncio será injetado aqui pelo script */}
      </div>
    </div>
  );
}
