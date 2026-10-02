/**
 * Resolve a URL de uma imagem.
 * - Se for do Zoro Drive, passa pelo proxy do backend (evita CORS).
 * - Se for URL absoluta (TMDB direto), usa como está.
 * - Se for path relativo do TMDB (ex: /abc.jpg), monta a URL completa.
 */
export function resolveImageUrl(path, size = 'w300') {
    if (!path) return '';
    if (path.includes('zorobot.shop')) return `/api/tmdb/img-proxy?url=${encodeURIComponent(path)}`;
    if (path.startsWith('http')) return path;
    return `https://image.tmdb.org/t/p/${size}${path}`;
}
