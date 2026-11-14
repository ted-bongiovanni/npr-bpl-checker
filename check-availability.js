const fs = require('fs');
const {
    LIBRARY,
    fetchPage,
    normalizeTitle,
    searchUrlFor,
    findAvailableMatch
} = require('./overdrive');

// Load books from JSON
const books = JSON.parse(fs.readFileSync('books.json', 'utf8'));

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
            const overdriveHtml = await fetchPage(searchUrlFor(book, 'ebook-overdrive'));
            ebookResult = findAvailableMatch(overdriveHtml, { title: book.title, author: book.author, type: 'ebook' });

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 150));

            // Check BPL catalog for physical books
            const bplUrl = LIBRARY.bibliocommonsSearchUrl(book.title + ' ' + (book.author || ''));
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
                    // OverDrive title ID: the front end links straight to this edition's page
                    overdriveId: ebookResult.overdriveId || null,
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
