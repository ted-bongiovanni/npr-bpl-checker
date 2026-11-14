const https = require('https');
const fs = require('fs');

// Load books from JSON
const books = JSON.parse(fs.readFileSync('books.json', 'utf8'));

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

// Normalize title for comparison
function normalizeTitle(t) {
    return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

// Strip accents and punctuation so "Muñoz" matches "Munoz"
function normalizeName(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Last names of a book's primary authors, ignoring translators/editors/illustrators.
// e.g. "Yoko Tawada, translated by Margaret Mitsutani" -> ['tawada']
function primaryAuthorLastNames(author) {
    if (!author) return [];
    const main = author.split(/,?\s*\b(translated|edited|illustrated|introduction|foreword|with)\b/i)[0];
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

// Parse OverDrive data from HTML (for eBooks)
function parseOverDriveData(html, searchTitle, searchAuthor) {
    if (html.includes("We couldn't find any matches") || html.includes("couldn't find any matches")) {
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
        const normalizedSearch = normalizeTitle(searchTitle);
        const stopWords = ['the', 'and', 'for', 'with', 'from', 'that', 'this', 'you', 'are', 'was', 'were', 'novel', 'book', 'story'];
        const searchWords = normalizedSearch.split(/\s+/)
            .filter(w => w.length >= 4 && !stopWords.includes(w));

        const authorLastNames = primaryAuthorLastNames(searchAuthor);
        let bestMatch = null;

        const toResult = (item) => ({
            found: true,
            available: true,
            title: item.title,
            author: item.firstCreatorName || 'Unknown',
            alwaysAvailable: item.availabilityType === 'always',
            availableCopies: item.availableCopies || 0,
            ownedCopies: item.ownedCopies || 0,
            description: item.description || item.shortDescription || null,
            subjects: item.subjects ? item.subjects.map(s => s.name) : [],
            format: 'ebook'
        });

        for (const key in mediaItems) {
            const item = mediaItems[key];
            if (!item.isAvailable || !item.type || item.type.id !== 'ebook') continue;
            // A same-titled book by someone else is not a match
            if (!authorMatches(item, authorLastNames)) continue;

            const normalizedItem = normalizeTitle(item.title || '');

            if (normalizedItem === normalizedSearch) {
                return toResult(item);
            }

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

        if (bestMatch) {
            return toResult(bestMatch);
        }

        return { found: false, available: false, reason: 'no_matching_available' };

    } catch (e) {
        return { found: false, available: false, reason: 'parse_error', error: e.message };
    }
}

// Parse BPL BiblioCommons catalog for physical books
function parseBPLCatalog(html, searchTitle, searchAuthor) {
    try {
        const normalizedSearch = normalizeTitle(searchTitle);

        // Step 1: Find book entries with format "BK" and matching title
        // Pattern: "format":"BK"..."title":"TITLE"..."id":"ID"
        const bookEntries = [];
        const bookPattern = /"format":"(BK|LPRINT)"[^}]*"title":"([^"]+)"[^}]*"id":"([^"]+)"/gi;

        let match;
        while ((match = bookPattern.exec(html)) !== null) {
            const format = match[1];
            const title = match[2];
            const id = match[3];
            const normalizedTitle = normalizeTitle(title);

            // Check if title matches our search
            if (normalizedTitle.includes(normalizedSearch) ||
                normalizedSearch.includes(normalizedTitle) ||
                (normalizedSearch.split(/\s+/).filter(w => w.length >= 4)
                    .every(w => normalizedTitle.includes(w)))) {
                bookEntries.push({ format, title, id });
            }
        }

        if (bookEntries.length === 0) {
            return { found: false, available: false, reason: 'no_matching_book' };
        }

        // Step 2: Find availability for matching book IDs
        let bestMatch = null;

        for (const entry of bookEntries) {
            // Look for availability data with this ID and bibType PHYSICAL
            const availPattern = new RegExp(
                `"${entry.id}"[^}]*"bibType":"PHYSICAL"[^}]*"totalCopies":(\\d+)[^}]*"availableCopies":(\\d+)`,
                'i'
            );
            const availMatch = html.match(availPattern);

            if (availMatch) {
                const totalCopies = parseInt(availMatch[1]);
                const availableCopies = parseInt(availMatch[2]);

                if (availableCopies > 0) {
                    if (!bestMatch || availableCopies > bestMatch.availableCopies) {
                        bestMatch = {
                            title: entry.title,
                            availableCopies,
                            totalCopies,
                            format: entry.format === 'LPRINT' ? 'large_print' : 'print'
                        };
                    }
                }
            }
        }

        if (bestMatch) {
            return {
                found: true,
                available: true,
                title: bestMatch.title,
                availableCopies: bestMatch.availableCopies,
                totalCopies: bestMatch.totalCopies,
                format: 'print'
            };
        }

        return { found: false, available: false, reason: 'no_physical_available' };

    } catch (e) {
        return { found: false, available: false, reason: 'parse_error', error: e.message };
    }
}

async function checkAvailability() {
    console.log(`Checking availability for ${books.length} books...`);
    console.log('Checking both eBook (OverDrive) and Print (BPL Catalog)');
    console.log('This will take approximately ' + Math.round(books.length * 0.5 / 60) + ' minutes.\n');

    const availableBooks = [];
    const unavailableBooks = [];
    const errors = [];

    for (let i = 0; i < books.length; i++) {
        const book = books[i];
        const progress = `[${i + 1}/${books.length}]`;

        try {
            let ebookResult = { available: false };
            let printResult = { available: false };

            // Check OverDrive for eBooks
            // Search by title plus the primary author's last name so the real book ranks first
            const lastNames = primaryAuthorLastNames(book.author);
            const query = [book.title.split(':')[0], lastNames[0]].filter(Boolean).join(' ');
            const overdriveUrl = `https://brooklyn.overdrive.com/search?query=${encodeURIComponent(query)}&showOnlyAvailable=true&format=ebook-overdrive`;
            const overdriveHtml = await fetchPage(overdriveUrl);
            ebookResult = parseOverDriveData(overdriveHtml, book.title, book.author);

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 150));

            // Check BPL catalog for physical books
            const bplUrl = `https://brooklyn.bibliocommons.com/v2/search?query=${encodeURIComponent(book.title + ' ' + (book.author || ''))}&searchType=keyword`;
            const bplHtml = await fetchPage(bplUrl);
            printResult = parseBPLCatalog(bplHtml, book.title, book.author);

            // Combine results
            const hasEbook = ebookResult.available;
            const hasPrint = printResult.available;

            if (hasEbook || hasPrint) {
                const formats = [];
                if (hasEbook) formats.push('eBook');
                if (hasPrint) formats.push('Print');

                console.log(`${progress} ✅ AVAILABLE (${formats.join(' + ')}): "${book.title}" by ${book.author || 'Unknown'}`);

                availableBooks.push({
                    ...book,
                    bplTitle: ebookResult.title || printResult.title || book.title,
                    // Keep the source list's author; record what the library calls it separately
                    author: book.author || ebookResult.author,
                    bplAuthor: ebookResult.author || null,
                    alwaysAvailable: !!ebookResult.alwaysAvailable,
                    // Format availability
                    formats: {
                        ebook: hasEbook,
                        print: hasPrint
                    },
                    // eBook details
                    ebookAvailable: hasEbook,
                    ebookCopies: hasEbook ? ebookResult.availableCopies : 0,
                    ebookTotal: hasEbook ? ebookResult.ownedCopies : 0,
                    // Print details
                    printAvailable: hasPrint,
                    printCopies: hasPrint ? printResult.availableCopies : 0,
                    printTotal: hasPrint ? printResult.totalCopies : 0,
                    // Legacy fields for compatibility
                    availableCopies: ebookResult.availableCopies || printResult.availableCopies || 0,
                    ownedCopies: ebookResult.ownedCopies || printResult.totalCopies || 0,
                    description: ebookResult.description || null,
                    subjects: ebookResult.subjects || []
                });
            } else {
                console.log(`${progress} ⏳ Not available: "${book.title}"`);
                unavailableBooks.push(book);
            }

        } catch (error) {
            console.log(`${progress} ⚠️ Error: "${book.title}" - ${error.message}`);
            errors.push({ book, error: error.message });
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Save results
    const results = {
        checkedAt: new Date().toISOString(),
        summary: {
            total: books.length,
            available: availableBooks.length,
            unavailable: unavailableBooks.length,
            errors: errors.length,
            withEbook: availableBooks.filter(b => b.ebookAvailable).length,
            withPrint: availableBooks.filter(b => b.printAvailable).length,
            withBoth: availableBooks.filter(b => b.ebookAvailable && b.printAvailable).length
        },
        available: availableBooks,
        unavailable: unavailableBooks,
        errors: errors
    };

    fs.writeFileSync('availability-results.json', JSON.stringify(results, null, 2));
    fs.writeFileSync('available-books.json', JSON.stringify(availableBooks, null, 2));
    fs.writeFileSync('last-checked.json', JSON.stringify({ lastChecked: results.checkedAt }, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total books checked: ${books.length}`);
    console.log(`✅ Available: ${availableBooks.length}`);
    console.log(`   📱 eBook: ${results.summary.withEbook}`);
    console.log(`   📖 Print: ${results.summary.withPrint}`);
    console.log(`   📱+📖 Both: ${results.summary.withBoth}`);
    console.log(`⏳ Not available: ${unavailableBooks.length}`);
    console.log(`⚠️ Errors: ${errors.length}`);
    console.log('='.repeat(60));
    console.log('\nResults saved to:');
    console.log('  - availability-results.json (full results)');
    console.log('  - available-books.json (only available books)');
}

checkAvailability().catch(console.error);
