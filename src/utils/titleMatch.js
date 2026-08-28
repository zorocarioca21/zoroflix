export const checkTitleMatch = (itemTitle, targetSeriesName, originalName, baseName, targetYear, season, logs = null) => {
    let cleanItemTitle = itemTitle;
    if (cleanItemTitle.includes('tvg-logo=') || cleanItemTitle.includes('group-title=')) {
        const idx = cleanItemTitle.indexOf('",');
        if (idx !== -1) {
            cleanItemTitle = cleanItemTitle.substring(idx + 2).trim();
        } else {
            const parts = cleanItemTitle.split(',');
            cleanItemTitle = parts[parts.length - 1].trim();
        }
    }

    const seasonEpRegex = /\b(S\d{1,2}\s*E\d{1,2}|S\d{1,2}E\d{1,2}|EPISÓDIO\s*\d+|EP\s*\d+|E\d{1,2}|TEMPORADA\s*\d+)\b/i;
    const match = cleanItemTitle.match(seasonEpRegex);

    let extractedName = cleanItemTitle;
    if (match && match.index > 0) {
        extractedName = cleanItemTitle.substring(0, match.index).trim();
    } else {
        const tagsRegex = /\b(DUBLADO|LEGENDADO|LEG|HD|FHD|4K|1080P|720P|2160P|CAMRIP)\b/i;
        const tagMatch = extractedName.match(tagsRegex);
        if (tagMatch && tagMatch.index > 0) {
            extractedName = extractedName.substring(0, tagMatch.index).trim();
        }
    }
    const itemYearMatch = cleanItemTitle.match(/[\(\[](\d{4})[\)\]]/);
    const itemYear = itemYearMatch ? parseInt(itemYearMatch[1]) : null;

    extractedName = extractedName.replace(/[\(\[]\d{4}[\)\]]/g, '').trim();
    extractedName = extractedName.replace(/[-:]$/g, '').trim();

    let targetClean = targetSeriesName.replace(/[\(\[]\d{4}[\)\]]/g, '').trim();
    targetClean = targetClean.replace(/[-:]$/g, '').trim();

    let originalClean = originalName ? originalName.replace(/[\(\[]\d{4}[\)\]]/g, '').trim().replace(/[-:]$/g, '').trim() : null;

    const logResult = (isMatch, similarity, isYearMatch) => {
        if (logs) {
            logs.push({ title: itemTitle, extracted: extractedName, target: targetClean, similarity, isMatch, isYearMatch });
        }
        return isMatch;
    };

    if (extractedName.toLowerCase() === targetClean.toLowerCase()) return logResult(true, 1, false);
    if (originalClean && extractedName.toLowerCase() === originalClean.toLowerCase()) return logResult(true, 1, false);

    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normExtracted = normalize(extractedName);
    const normTarget = normalize(targetClean);
    const normOriginal = originalClean ? normalize(originalClean) : null;

    if (normExtracted === normTarget) return logResult(true, 1, false);
    if (normOriginal && normExtracted === normOriginal) return logResult(true, 1, false);

    let isYearMatch = false;
    if (itemYear && targetYear) {
        if (itemYear === parseInt(targetYear)) {
            isYearMatch = true;
        }
    }

    const calculateSimilarity = (s1, s2) => {
        let longer = s1.length > s2.length ? s1 : s2;
        let shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0) return 1.0;
        const costs = [];
        for (let i = 0; i <= longer.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= shorter.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[shorter.length] = lastValue;
        }
        return (longer.length - costs[shorter.length]) / parseFloat(longer.length);
    };

    const simTarget = calculateSimilarity(normExtracted, normTarget);
    const simOrig = normOriginal ? calculateSimilarity(normExtracted, normOriginal) : 0;

    const threshold = isYearMatch ? 0.8 : 0.95;
    if (simTarget >= threshold) return logResult(true, simTarget, isYearMatch);
    if (simOrig >= threshold) return logResult(true, simOrig, isYearMatch);

    if (extractedName.toLowerCase().startsWith(targetClean.toLowerCase())) {
        const remaining = extractedName.substring(targetClean.length).trim();
        if (remaining === '' || remaining === ':' || remaining === '-' || remaining.startsWith('-')) return logResult(true, simTarget, isYearMatch);
    }

    if (originalClean && extractedName.toLowerCase().startsWith(originalClean.toLowerCase())) {
        const remaining = extractedName.substring(originalClean.length).trim();
        if (remaining === '' || remaining === ':' || remaining === '-' || remaining.startsWith('-')) return logResult(true, simOrig, isYearMatch);
    }

    let baseClean = baseName ? baseName.replace(/[\(\[]\d{4}[\)\]]/g, '').trim().replace(/[-:]$/g, '').trim() : null;
    if (baseClean && extractedName.toLowerCase().startsWith(baseClean.toLowerCase())) {
        if (season) return logResult(true, simTarget, isYearMatch);
    }

    return logResult(false, Math.max(simTarget, simOrig), isYearMatch);
};

export const getBestMatches = (items, releaseYear = null) => {
    let targetItems = items.filter(i => i.status === 'completed' && (i.telegram_message_id || i.stream_url));
    if (targetItems.length === 0) return null;

    if (releaseYear) {
        const withYear = targetItems.filter(i => i.title && i.title.includes(releaseYear));
        if (withYear.length > 0) targetItems = withYear;
    }

    const versions = {};

    for (const i of targetItems) {
        if (!i.title) continue;

        const isLeg = /leg|legendado/i.test(i.title);
        const titleUpper = i.title.toUpperCase();

        let version = 'Normal';
        if (titleUpper.includes('FHD') || titleUpper.includes('1080P') || titleUpper.includes('1080')) version = 'FHD';
        else if (titleUpper.includes('4K') || titleUpper.includes('2160P')) version = '4K';
        else if (titleUpper.includes('HD') || titleUpper.includes('720P') || titleUpper.includes('720')) version = 'HD';
        else if (titleUpper.includes('TS') || titleUpper.includes('CAMRIP') || titleUpper.includes('CAM RIP')) version = 'TS';

        if (!versions[version]) versions[version] = { dub: null, leg: null };

        const itemData = i.stream_url ? { id: i.telegram_message_id || i.id, stream_url: i.stream_url } : i.telegram_message_id;

        if (isLeg && !versions[version].leg) versions[version].leg = itemData;
        if (!isLeg && !versions[version].dub) versions[version].dub = itemData;
    }

    return Object.keys(versions).length > 0 ? versions : null;
};
