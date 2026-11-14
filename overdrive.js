// Shared OverDrive helpers for check-availability.js and check-audiobook-availability.js
const https = require('https');
const LIBRARY = require('./library-config');

// Fetch a page as text, using a browser user agent to avoid blocks
function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Extract the JSON object that follows `startMarker`, counting braces outside strings
function extractJsonObject(html, startMarker) {
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) return null;

    const braceStart = html.indexOf('{', startIdx + startMarker.length);
    if (braceStart === -1) return null;

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = braceStart; i < html.length; i++) {
        const char = html[i];

        if (escapeNext) {
            escapeNext = false;
            continue;
        }
        if (char === '\\' && inString) {
            escapeNext = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (char === '{') depth++;
            if (char === '}') {
                depth--;
                if (depth === 0) return html.substring(braceStart, i + 1);
            }
        }
    }
    return null;
}

function normalizeTitle(t) {
    return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

// Strip accents and punctuation so "Muñoz" matches "Munoz"
function normalizeName(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Last names of a book's primary authors, ignoring translators/editors/illustrators/narrators.
// e.g. "Yoko Tawada, translated by Margaret Mitsutani" -> ['tawada']
//      "Mavis Staples, Carole Boston Weatherford, read by Mavis Staples" -> ['staples', 'weatherford']
function primaryAuthorLastNames(author) {
    if (!author) return [];
    const main = author.split(/,?\s*\b(translated|edited|illustrated|introduction|foreword|with|read by|narrated by)\b/i)[0];
    const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md']);
    return main.split(/\s*(?:,|;|&|\band\b)\s*/i)
        .map(name => normalizeName(name).split(' ').filter(w => w && !suffixes.has(w)))
        .filter(parts => parts.length > 0)
        .map(parts => parts[parts.length - 1])
        .filter(last => last.length >= 2);
}

// Does an OverDrive item list one of the book's primary authors?
function authorMatches(item, authorLastNames) {
    if (authorLastNames.length === 0) return true; // no author to check against
    const names = [item.firstCreatorName, ...(item.creators || []).map(c => c.name)]
        .map(normalizeName).join(' ');
    const words = new Set(names.split(/[\s-]+/));
    return authorLastNames.some(last => words.has(last) || last.split('-').every(p => words.has(p)));
}

// Is this edition in the library's matching language? Items with no language listed pass.
function languageMatches(item) {
    const langs = (item.languages || []).map(l => l.id);
    return langs.length === 0 || langs.includes(LIBRARY.language);
}

// Search URL for a book: title (before any subtitle colon) plus the primary author's last name
function searchUrlFor(book, format) {
    const lastNames = primaryAuthorLastNames(book.author);
    const query = [book.title.split(':')[0], lastNames[0]].filter(Boolean).join(' ');
    return LIBRARY.overdriveSearchUrl(query, { format, onlyAvailable: true });
}

// Find the available OverDrive item that is this book, from a search results page.
// `type` is the OverDrive media type id: 'ebook' or 'audiobook'.
function findAvailableMatch(html, { title, author, type, extraStopWords = [] }) {
    if (html.includes("couldn't find any matches")) {
        return { found: false, available: false, reason: 'no_results' };
    }
    if (html.includes('mediaItems = {}') || html.includes('mediaItems={}')) {
        return { found: false, available: false, reason: 'no_results' };
    }

    const mediaItemsStr = extractJsonObject(html, 'mediaItems');
    if (!mediaItemsStr) {
        return { found: false, available: false, reason: 'parse_error' };
    }

    try {
        const mediaItems = JSON.parse(mediaItemsStr);
        const normalizedSearch = normalizeTitle(title);
        const stopWords = ['the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'are', 'was', 'were', 'novel', 'book', 'story', ...extraStopWords];
        const searchWords = normalizedSearch.split(/\s+/)
            .filter(w => w.length >= 4 && !stopWords.includes(w));
        const authorLastNames = primaryAuthorLastNames(author);

        let bestMatch = null;

        for (const key in mediaItems) {
            const item = mediaItems[key];
            if (!item.isAvailable || !item.type || item.type.id !== type) continue;
            // A same-titled book by someone else, or another language's edition, is not a match
            if (!authorMatches(item, authorLastNames)) continue;
            if (!languageMatches(item)) continue;

            const normalizedItem = normalizeTitle(item.title || '');

            if (normalizedItem === normalizedSearch) {
                return toResult(item);
            }

            // Subtitle differences, e.g. "Knife: Meditations..." vs "Knife"
            if (normalizedItem.startsWith(normalizedSearch + ' ') ||
                normalizedSearch.startsWith(normalizedItem + ' ')) {
                bestMatch = item;
            }

            if (!bestMatch && searchWords.length >= 2) {
                const itemWords = normalizedItem.split(/\s+/).filter(w => w.length >= 4);
                const matchingWords = searchWords.filter(w => normalizedItem.includes(w));
                if (matchingWords.length >= searchWords.length * 0.8 &&
                    Math.abs(itemWords.length - searchWords.length) <= 2) {
                    bestMatch = item;
                }
            }
        }

        if (bestMatch) return toResult(bestMatch);
        return { found: false, available: false, reason: 'no_matching_available' };

    } catch (e) {
        return { found: false, available: false, reason: 'parse_error', error: e.message };
    }
}

function toResult(item) {
    return {
        found: true,
        available: true,
        overdriveId: item.id ? String(item.id) : null,
        title: item.title,
        author: item.firstCreatorName || 'Unknown',
        alwaysAvailable: item.availabilityType === 'always',
        availableCopies: item.availableCopies || 0,
        ownedCopies: item.ownedCopies || 0,
        description: item.description || item.shortDescription || null,
        subjects: item.subjects ? item.subjects.map(s => s.name) : [],
        starRating: item.starRating || null,
        starRatingCount: item.starRatingCount || 0
    };
}

module.exports = {
    LIBRARY,
    fetchPage,
    extractJsonObject,
    normalizeTitle,
    primaryAuthorLastNames,
    authorMatches,
    searchUrlFor,
    findAvailableMatch
};
