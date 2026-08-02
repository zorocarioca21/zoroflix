import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
const stealth = stealthPlugin();
chromium.use(stealth);
import * as cheerio from 'cheerio';

// Função para dar pontuação a um resultado na busca
function matchScore(title, query, opts) {
    const titleLower = title.toLowerCase();
    const queryLower = query.toLowerCase();
    let score = 0;

    if (titleLower.includes(queryLower)) {
        score += 100;
    } else {
        const words = queryLower.split(' ').filter(w => w !== 'the' && w !== 'a' && w !== 'o' && w !== 'e' && w.length > 2);
        for (const w of words) {
            if (titleLower.includes(w)) {
                score += 10;
            }
        }
    }

    if (opts.tipo) {
        const isSerie = titleLower.includes('temporada') || titleLower.includes('série') || titleLower.includes('episódio');
        if (opts.tipo.toLowerCase() === 'serie' && !isSerie) score -= 50;
        if (opts.tipo.toLowerCase() === 'filme' && isSerie) score -= 50;
    }

    if (opts.ano) {
        if (titleLower.includes(opts.ano)) score += 50;
    }

    if (opts.temporada) {
        const tempStr1 = `${opts.temporada}ª temporada`;
        const tempStr2 = `temporada ${opts.temporada}`;
        const tempStr3 = `s${opts.temporada.toString().padStart(2, '0')}`;

        if (titleLower.includes(tempStr1) || titleLower.includes(tempStr2) || titleLower.includes(tempStr3)) {
            score += 100;
        } else if (titleLower.includes('temporada')) {
            score -= 100;
        }
        
        // Se houver episódio especificado, checar se é um torrent de episódio único
        if (opts.episodio) {
            const epStr1 = `e${opts.episodio.toString().padStart(2, '0')}`;
            const epStr2 = `episódio ${opts.episodio}`;
            if (titleLower.includes(epStr1) || titleLower.includes(epStr2)) {
                score += 50;
            }
        }
    }

    return score;
}

// Retorna uma pontuação de qualidade baseada na string de resolução
function getQualityScore(desc) {
    desc = desc.toLowerCase();
    if (desc.includes('4k') || desc.includes('2160p')) return 400;
    if (desc.includes('1080p') || desc.includes('fhd') || desc.includes('full hd')) return 300;
    if (desc.includes('720p') || desc.includes('hd')) return 200;
    if (desc.includes('480p') || desc.includes('dvd') || desc.includes('web')) return 100;
    return 0; // Qualidade desconhecida
}

export async function searchTorrents(query, opts) {
    let browser = null;
    try {
        browser = await chromium.launch({ headless: true }); // Alterado para headless = true no backend

        let bestMatches = [];
        let currentPageUrl = `https://bludvfilmes.xyz/?s=${encodeURIComponent(query)}`;
        let pageNum = 1;
        while (bestMatches.length < 5 && currentPageUrl && pageNum <= 15) {
            let page = null;
            try {
                page = await browser.newPage();
                await page.goto(currentPageUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(e => console.log('goto err:', e.message));
                
                const content = await page.content();
                const $ = cheerio.load(content);
                const items = $('.title a');
                
                if (items.length === 0) {
                    await page.close();
                    break;
                }
                
                const pageResults = [];
                items.each((i, el) => {
                    const title = $(el).text().trim();
                    const pageUrl = $(el).attr('href');
                    const parent = $(el).closest('div');
                    const posterUrl = parent.parent().find('img').attr('src');
                    const score = matchScore(title, query, opts);
                    
                    if (pageUrl && score > 0) {
                        pageResults.push({ title, url: pageUrl, poster: posterUrl, score });
                    }
                });
                
                pageResults.sort((a, b) => b.score - a.score);
                
                for (const res of pageResults) {
                    if (bestMatches.length < 5 && !bestMatches.find(b => b.url === res.url)) {
                        bestMatches.push(res);
                    }
                }
                
                const nextLink = $('a.next').attr('href') || $('a[rel="next"]').attr('href');
                if (nextLink && nextLink !== currentPageUrl) {
                    currentPageUrl = nextLink;
                    pageNum++;
                } else {
                    currentPageUrl = null;
                }
                
                await page.close();
                if (bestMatches.length >= 5) break;
            } catch (e) {
                console.error(`Erro ao acessar a página de busca: ${e.message}`);
                if (page) await page.close().catch(()=>{});
                break;
            }
        }

        if (bestMatches.length === 0) {
            await browser.close();
            return { dubbed: null, subbed: null };
        }

        let foundDubbed = null;
        let foundDubbedItemScore = -1;

        bestMatches.sort((a, b) => b.score - a.score);

        for (const item of bestMatches) {
            if (foundDubbed) break;

            let detailPage = null;
            try {
                detailPage = await browser.newPage();
                await detailPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                const detailContent = await detailPage.content();
                const $detail = cheerio.load(detailContent);

                const magnetEls = $detail('a[href^="magnet:"]');

                let localDubbed = null;
                let fallbackDubbed = null;

                magnetEls.each((j, el) => {
                    let desc = $detail(el).parent().prevAll('span').first().text().trim();
                    if (!desc) {
                        desc = $detail(el).parent().parent().text().replace('MAGNET LINK', '').trim();
                    }
                    desc = desc.toLowerCase();
                    if (!desc) return;

                    const magnetUrl = $detail(el).attr('href');

                    const isSubbed = desc.includes('legendado') || desc.includes('leg');
                    const isDubbed = desc.includes('dual') || desc.includes('dublado') || desc.includes('nacional') || !isSubbed;
                    
                    if (!isDubbed) return; // Ignore if it's exclusively subbed

                    const qualityScore = getQualityScore(desc);
                    const candidate = { title: item.title, desc: desc.toUpperCase(), url: magnetUrl, quality: qualityScore, poster: item.poster };

                    if (opts.episodio) {
                        const epPad = opts.episodio.toString().padStart(2, '0');
                        const isEpisodeMatch = desc.includes(`${epPad}º ep`) ||
                            desc.includes(`${opts.episodio}º ep`) ||
                            desc.includes(`e${epPad}`) ||
                            desc.includes(`ep${epPad}`);

                        const isPack = desc.includes('ao') || desc.includes('completa') || desc.includes('temporada') || item.title.toLowerCase().includes('temporada');

                        if (isEpisodeMatch) {
                            if (!localDubbed || qualityScore > localDubbed.quality) localDubbed = candidate;
                            return;
                        } else if (isPack) {
                            if (!fallbackDubbed || qualityScore > fallbackDubbed.quality) fallbackDubbed = candidate;
                            return;
                        }
                        return;
                    }

                    if (!localDubbed || qualityScore > localDubbed.quality) localDubbed = candidate;
                });

                if (opts.episodio) {
                    if (!localDubbed && fallbackDubbed) {
                        fallbackDubbed.desc = "[PACOTE DA TEMPORADA COMPLETA] " + fallbackDubbed.desc;
                        localDubbed = fallbackDubbed;
                    }
                }

                if (localDubbed) {
                    if (!foundDubbed || (item.score === foundDubbedItemScore && localDubbed.quality > foundDubbed.quality)) {
                        foundDubbed = localDubbed;
                        foundDubbedItemScore = item.score;
                    }
                }
                await detailPage.close();
            } catch (err) {
                console.log(`Erro ao verificar link: ${err.message}`);
                if (detailPage) await detailPage.close().catch(()=>{});
            }
        }

        await browser.close();

        return {
            dubbed: foundDubbed,
            subbed: null
        };
    } catch (e) {
        console.error(`Erro global no scraper: ${e.message}`);
        if (browser) {
            try { await browser.close(); } catch (err) { }
        }
        throw e;
    }
}
