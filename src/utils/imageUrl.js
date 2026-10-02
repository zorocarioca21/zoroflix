/**
 * Resolve a URL de uma imagem.
 * - Se for do Zoro Drive, passa pelo proxy do backend (evita CORS).
 * - Se for URL absoluta (TMDB direto), usa como está.
 * - Se for path relativo do TMDB (ex: /abc.jpg), monta a URL completa.
 */
export function resolveImageUrl(path, size = 'w500', fallback = '') {
    if (!path) return fallback;
    // Como a API do Zoro Drive agora possui CORS habilitado, carregamos a URL direta sem passar pelo proxy
    if (typeof path === 'string' && path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/${size}${path}`;
}
