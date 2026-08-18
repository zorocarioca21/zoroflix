import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AdBanner({ adId }) {
  const adContainerRef = useRef(null);
  const { user, loading } = useAuth();
  const [configs, setConfigs] = useState({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/admin/config/all')
      .then(r => r.json())
      .then(data => {
        setConfigs(data);
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (loading || !ready) return;
    if (!configs.ads_enabled || !configs.ads_banner) return;
    if (user?.role && user.role !== 'free') return;
    // Evita carregar múltiplas vezes se o componente remontar rapidamente
    if (adContainerRef.current && adContainerRef.current.innerHTML === '') {
      const iframe = document.createElement('iframe');
      iframe.width = "728";
      iframe.height = "90";
      iframe.style.border = "none";
      iframe.scrolling = "no";
      
      adContainerRef.current.appendChild(iframe);

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: transparent; }</style>
            <script type="text/javascript">
                atOptions = {
                    'key' : '40b3a4f1f3aea0d9793da7323cabebd8',
                    'format' : 'iframe',
                    'height' : 90,
                    'width' : 728,
                    'params' : {}
                };
            </script>
        </head>
        <body>
            <script type="text/javascript" src="https://pl29672001.effectivecpmnetwork.com/40b3a4f1f3aea0d9793da7323cabebd8/invoke.js"></script>
        </body>
        </html>
      `;
      iframe.contentWindow.document.open();
      iframe.contentWindow.document.write(html);
      iframe.contentWindow.document.close();
    }
  }, [user, loading, configs, ready]);

  if (!ready || !configs.ads_enabled || !configs.ads_banner || (!loading && user?.role && user.role !== 'free')) {
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
