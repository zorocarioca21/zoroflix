
export async function fetchWithProxy(url) {
  const proxies = [
    // 1. Sua Proxy Interna (Porta 4000) - Super estável e sem limites
    (u) => `/api-proxy?url=${encodeURIComponent(u)}`,
    // 2. AllOrigins (Versão Raw) - Fallback
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    // 3. CodeTabs Proxy
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    // 4. CorsProxy.io
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`
  ];

  for (const getProxyUrl of proxies) {
    try {
      const proxyUrl = getProxyUrl(url);
      console.log(`Tentando fetch via: ${proxyUrl}`);
      
      const response = await fetch(proxyUrl, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (!response.ok) throw new Error(`Status ${response.status}`);

      // Se for AllOrigins JSON, o dado vem dentro de .contents
      if (proxyUrl.includes('allorigins.win/get')) {
        const json = await response.json();
        return JSON.parse(json.contents);
      }

      // Para as outras que retornam o dado direto
      return await response.json();
    } catch (err) {
      console.warn(`Falha na proxy:`, err);
      continue; // Tenta a próxima
    }
  }

  throw new Error("Todas as proxies de CORS falharam.");
}
