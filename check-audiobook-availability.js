const https = require('https');
const fs = require('fs');

// Check Brooklyn Public Library availability for audiobooks

// Load audiobooks from JSON
let audiobooks;
try {
    audiobooks = JSON.parse(fs.readFileSync('audiobooks.json', 'utf8'));
} catch (e) {
    console.error('Error: audiobooks.json not found. Run scrape-audiofile.js first.');
    process.exit(1);
}

// Function to make HTTPS request
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

// Extract JSON object using bracket counting
function extractJsonObject(html, startMarker) {
    const startIdx = html.indexOf(startMarker);
    if (startIdx === -1) return null;

    // Find the opening brace after the marker
    let braceStart = html.indexOf('{', startIdx + startMarker.length);
    if (braceStart === -1) return null;

    // Count braces to find matching close
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

        if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
        }

        if (!inString) {
            if (char === '{') depth++;
            if (char === '}') {
                depth--;
                if (depth === 0) {
                    return html.substring(braceStart, i + 1);
                }
            }
        }
    }
    return null;
}

// Parse OverDrive data from HTML - looking for audiobooks
function parseOverDriveData(html, searchTitle) {
    // Check if "no results" page
    if (html.includes("We couldn't find any matches") || html.includes("couldn't find any matches")) {
        return { found: false, available: false, reason: 'no_results' };
    }

    // Check if empty results
    if (html.includes('mediaItems = {}') || html.includes('mediaItems={}')) {
        return { found: false, available: false, reason: 'no_results' };
    }

    // Extract mediaItems using bracket counting
    const mediaItemsStr = extractJsonObject(html, 'mediaItems');

    if (!mediaItemsStr) {
        return { found: false, available: false, reason: 'parse_error' };
    }

    try {
        // Parse the mediaItems JSON
        const mediaItems = JSON.parse(mediaItemsStr);

        // Normalize the search title for matching
        const normalizeTitle = (t) => t.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const normalizedSearch = normalizeTitle(searchTitle);

        // Get significant words for fuzzy matching
        const stopWords = ['the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'are', 'was', 'were', 'novel', 'book', 'story', 'audiobook'];
        const searchWords = normalizedSearch.split(/\s+/)
            .filter(w => w.length >= 4 && !stopWords.includes(w));

        // Look for audiobook matches - prioritize exact matches
        let bestMatch = null;

        for (const key in mediaItems) {
            const item = mediaItems[key];

            // Must be available AND be an audiobook
            if (!item.isAvailable) continue;
            if (!item.type || item.type.id !== 'audiobook') continue;

            const itemTitle = (item.title || '').toLowerCase().trim();
            const normalizedItem = normalizeTitle(item.title || '');

            // Exact match (normalized)
            if (normalizedItem === normalizedSearch) {
                return {
                    found: true,
                    available: true,
                    title: item.title,
                    author: item.firstCreatorName || 'Unknown',
                    availableCopies: item.availableCopies || 0,
                    ownedCopies: item.ownedCopies || 0,
                    description: item.description || item.shortDescription || null,
                    subjects: item.subjects ? item.subjects.map(s => s.name) : [],
                    type: 'audiobook',
                    // OverDrive ratings
                    starRating: item.starRating || null,
                    starRatingCount: item.starRatingCount || 0
                };
            }

            // Check if item title starts with search title (for subtitles)
            if (normalizedItem.startsWith(normalizedSearch + ' ') ||
                normalizedSearch.startsWith(normalizedItem + ' ')) {
                bestMatch = item;
            }

            // Fuzzy match: all significant words present AND titles are similar length
            if (!bestMatch && searchWords.length >= 2) {
                const itemWords = normalizedItem.split(/\s+/).filter(w => w.length >= 4);
                const matchingWords = searchWords.filter(w => normalizedItem.includes(w));
                // Require most words to match AND similar word counts
                if (matchingWords.length >= searchWords.length * 0.8 &&
                    Math.abs(itemWords.length - searchWords.length) <= 2) {
                    bestMatch = item;
                }
            }
        }

        if (bestMatch) {
            return {
                found: true,
                available: true,
                title: bestMatch.title,
                author: bestMatch.firstCreatorName || 'Unknown',
                availableCopies: bestMatch.availableCopies || 0,
                ownedCopies: bestMatch.ownedCopies || 0,
                description: bestMatch.description || bestMatch.shortDescription || null,
                subjects: bestMatch.subjects ? bestMatch.subjects.map(s => s.name) : [],
                type: 'audiobook',
                // OverDrive ratings
                starRating: bestMatch.starRating || null,
                starRatingCount: bestMatch.starRatingCount || 0
            };
        }

        // No matching available audiobook found
        return { found: false, available: false, reason: 'no_matching_available' };

    } catch (e) {
        return { found: false, available: false, reason: 'parse_error', error: e.message };
    }
}

async function checkAvailability() {
    console.log(`Checking audiobook availability for ${audiobooks.length} titles...`);
    console.log('This will take approximately ' + Math.round(audiobooks.length * 0.3 / 60) + ' minutes.\n');

    const availableAudiobooks = [];
    const unavailableAudiobooks = [];
    const errors = [];

    for (let i = 0; i < audiobooks.length; i++) {
        const audiobook = audiobooks[i];
        const progress = `[${i + 1}/${audiobooks.length}]`;

        try {
            // Search on Brooklyn OverDrive with "available now" filter for audiobooks
            const searchUrl = `https://brooklyn.overdrive.com/search?query=${encodeURIComponent(audiobook.title)}&showOnlyAvailable=true&format=audiobook-overdrive`;

            const html = await fetchPage(searchUrl);
            const result = parseOverDriveData(html, audiobook.title);

            if (result.available) {
                const ratingStr = result.starRating ? ` ⭐${result.starRating.toFixed(1)}` : '';
                console.log(`${progress} 🎧 AVAILABLE: "${result.title}" (${result.availableCopies}/${result.ownedCopies} copies)${ratingStr}`);
                availableAudiobooks.push({
                    ...audiobook,
                    bplTitle: result.title,
                    bplAuthor: result.author,
                    availableCopies: result.availableCopies,
                    ownedCopies: result.ownedCopies,
                    bplDescription: result.description,
                    subjects: result.subjects,
                    format: 'audiobook',
                    // OverDrive ratings
                    starRating: result.starRating,
                    starRatingCount: result.starRatingCount
                });
            } else {
                console.log(`${progress} ⏳ Not available: "${audiobook.title}"`);
                unavailableAudiobooks.push(audiobook);
            }

        } catch (error) {
            console.log(`${progress} ⚠️ Error: "${audiobook.title}" - ${error.message}`);
            errors.push({ audiobook, error: error.message });
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Save results
    const results = {
        checkedAt: new Date().toISOString(),
        source: 'AudioFile Earphones Awards',
        summary: {
            total: audiobooks.length,
            available: availableAudiobooks.length,
            unavailable: unavailableAudiobooks.length,
            errors: errors.length
        },
        available: availableAudiobooks,
        unavailable: unavailableAudiobooks,
        errors: errors
    };

    fs.writeFileSync('audiobook-availability-results.json', JSON.stringify(results, null, 2));
    fs.writeFileSync('available-audiobooks.json', JSON.stringify(availableAudiobooks, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('AUDIOBOOK AVAILABILITY SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total audiobooks checked: ${audiobooks.length}`);
    console.log(`🎧 Available now: ${availableAudiobooks.length}`);
    console.log(`⏳ Not available: ${unavailableAudiobooks.length}`);
    console.log(`⚠️ Errors: ${errors.length}`);
    console.log('='.repeat(60));
    console.log('\nResults saved to:');
    console.log('  - audiobook-availability-results.json (full results)');
    console.log('  - available-audiobooks.json (only available audiobooks)');

    if (availableAudiobooks.length > 0) {
        console.log('\n🎧 AVAILABLE AUDIOBOOKS YOU CAN BORROW NOW:');
        availableAudiobooks.forEach((book, i) => {
            console.log(`  ${i + 1}. "${book.bplTitle || book.title}"`);
            console.log(`     Narrated by ${book.narrator}`);
        });
    } else {
        console.log('\n😢 No immediately available audiobooks found from this list.');
        console.log('Try again later - availability changes frequently!');
    }
}

checkAvailability().catch(console.error);
