const https = require('https');
const fs = require('fs');

// Fetch JSON from URL
function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// Wikipedia API - good for notable books
async function getWikipediaDescription(title, author) {
    try {
        // Search Wikipedia for the book
        const searchQuery = encodeURIComponent(`${title} ${author} novel`);
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${searchQuery}&format=json`;
        const searchResult = await fetchJSON(searchUrl);

        if (!searchResult.query?.search?.length) {
            return null;
        }

        // Get the first result that looks like a book page
        const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
        let pageTitle = null;

        for (const result of searchResult.query.search.slice(0, 5)) {
            const resultTitle = result.title.toLowerCase();
            // Check if it's likely a book page
            if (resultTitle.includes(normalizedTitle.split(' ')[0]) ||
                normalizedTitle.includes(resultTitle.split(' ')[0])) {
                pageTitle = result.title;
                break;
            }
        }

        if (!pageTitle) {
            pageTitle = searchResult.query.search[0].title;
        }

        // Get the page summary
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
        const summary = await fetchJSON(summaryUrl);

        if (summary.extract && summary.extract.length > 50) {
            return summary.extract;
        }

        return null;
    } catch (e) {
        return null;
    }
}

// Open Library API - often has better/longer descriptions
async function getOpenLibraryDescription(isbn, title, author) {
    try {
        let description = null;
        let worksKey = null;

        // Try ISBN lookup first
        if (isbn) {
            const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
            const result = await fetchJSON(url);
            const bookData = result[`ISBN:${isbn}`];

            if (bookData) {
                // Get description from book data
                if (bookData.excerpts && bookData.excerpts[0]?.text) {
                    description = bookData.excerpts[0].text;
                }

                // Get works key for fuller description
                if (bookData.identifiers?.openlibrary?.[0]) {
                    worksKey = bookData.identifiers.openlibrary[0];
                }
            }
        }

        // Try to get description from Works API (often has fuller descriptions)
        if (!description || description.length < 200) {
            // Search by title + author
            const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author || '')}&limit=1`;
            const searchResult = await fetchJSON(searchUrl);

            if (searchResult.docs && searchResult.docs[0]) {
                const doc = searchResult.docs[0];

                // Get description from search result
                if (doc.first_sentence && doc.first_sentence[0]) {
                    const firstSentence = doc.first_sentence[0];
                    if (firstSentence.length > (description?.length || 0)) {
                        description = firstSentence;
                    }
                }

                // Try to get works key
                if (doc.key) {
                    worksKey = doc.key;
                }
            }
        }

        // Fetch from Works API for full description
        if (worksKey) {
            const worksUrl = `https://openlibrary.org${worksKey}.json`;
            try {
                const worksData = await fetchJSON(worksUrl);
                if (worksData.description) {
                    const desc = typeof worksData.description === 'string'
                        ? worksData.description
                        : worksData.description.value;
                    if (desc && desc.length > (description?.length || 0)) {
                        description = desc;
                    }
                }
            } catch (e) {
                // Works API failed, use what we have
            }
        }

        return description;
    } catch (e) {
        return null;
    }
}

// Google Books API - fallback
async function getGoogleBooksDescription(isbn, title, author) {
    try {
        // Try ISBN first (more accurate)
        if (isbn) {
            const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`;
            const result = await fetchJSON(url);
            if (result.items && result.items[0]?.volumeInfo?.description) {
                return result.items[0].volumeInfo.description;
            }
        }

        // Fall back to title + author search
        const query = `${title} ${author || ''}`.trim();
        const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`;
        const result = await fetchJSON(url);
        if (result.items && result.items[0]?.volumeInfo?.description) {
            return result.items[0].volumeInfo.description;
        }

        return null;
    } catch (e) {
        return null;
    }
}

// Get best description from multiple sources
async function getBestDescription(isbn, title, author) {
    // Try all sources in parallel
    const [wikiDesc, openLibDesc, googleDesc] = await Promise.all([
        getWikipediaDescription(title, author),
        getOpenLibraryDescription(isbn, title, author),
        getGoogleBooksDescription(isbn, title, author)
    ]);

    // Collect all valid descriptions with their sources
    const descriptions = [];
    if (wikiDesc) descriptions.push({ description: wikiDesc, source: 'wikipedia' });
    if (openLibDesc) descriptions.push({ description: openLibDesc, source: 'openlibrary' });
    if (googleDesc) descriptions.push({ description: googleDesc, source: 'google' });

    if (descriptions.length === 0) {
        return null;
    }

    // Return the longest one
    descriptions.sort((a, b) => b.description.length - a.description.length);
    return descriptions[0];
}

async function main() {
    const args = process.argv.slice(2);
    let sourceFilter = null; // null = try all, 'openlibrary', 'google'

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--source' || args[i] === '-s') {
            sourceFilter = args[i + 1];
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Book Description Enricher

Fetches longer descriptions from Open Library and Google Books APIs.

Usage: node enrich-descriptions.js [options]

Options:
  --source, -s <source>   Use specific source: 'openlibrary' or 'google'
  --help, -h              Show this help

Examples:
  node enrich-descriptions.js
  node enrich-descriptions.js --source openlibrary
            `);
            return;
        }
    }

    // Load available books
    let books;
    try {
        books = JSON.parse(fs.readFileSync('available-books.json', 'utf8'));
    } catch (e) {
        console.error('Error: available-books.json not found. Run check-availability.js first.');
        process.exit(1);
    }

    console.log(`Enriching descriptions for ${books.length} books...`);
    console.log('Sources: Open Library (primary) + Google Books (fallback)\n');

    let enriched = 0;
    let alreadyGood = 0;
    let notFound = 0;
    let wikiCount = 0;
    let openLibCount = 0;
    let googleCount = 0;

    for (let i = 0; i < books.length; i++) {
        const book = books[i];
        const currentDesc = (book.description || '').replace(/<[^>]*>/g, '');

        // Skip if we already have a good description (400+ chars without HTML)
        if (currentDesc.length >= 400) {
            process.stdout.write(`[${i + 1}/${books.length}] "${book.title.substring(0, 35)}..." already good\n`);
            alreadyGood++;
            continue;
        }

        process.stdout.write(`[${i + 1}/${books.length}] "${book.title.substring(0, 35)}..." `);

        const isbn = book.isbn || book.cover;
        let result;

        if (sourceFilter === 'openlibrary') {
            const desc = await getOpenLibraryDescription(isbn, book.title, book.author);
            result = desc ? { description: desc, source: 'openlibrary' } : null;
        } else if (sourceFilter === 'google') {
            const desc = await getGoogleBooksDescription(isbn, book.title, book.author);
            result = desc ? { description: desc, source: 'google' } : null;
        } else {
            result = await getBestDescription(isbn, book.title, book.author);
        }

        if (result && result.description.length > currentDesc.length) {
            book.description = result.description;
            book.descriptionSource = result.source;
            console.log(`${result.source} (${result.description.length} chars)`);
            enriched++;
            if (result.source === 'wikipedia') wikiCount++;
            else if (result.source === 'openlibrary') openLibCount++;
            else googleCount++;
        } else if (result) {
            console.log(`kept original (${currentDesc.length} >= ${result.description.length})`);
            notFound++;
        } else {
            console.log('not found');
            notFound++;
        }

        // Rate limit - be respectful to APIs
        await new Promise(r => setTimeout(r, 600));
    }

    // Save updated books
    fs.writeFileSync('available-books.json', JSON.stringify(books, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('ENRICHMENT SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total books: ${books.length}`);
    console.log(`Enriched: ${enriched}`);
    console.log(`  - From Wikipedia: ${wikiCount}`);
    console.log(`  - From Open Library: ${openLibCount}`);
    console.log(`  - From Google Books: ${googleCount}`);
    console.log(`Already good (400+ chars): ${alreadyGood}`);
    console.log(`Not found/shorter: ${notFound}`);
    console.log('='.repeat(50));
    console.log('\nDescriptions saved to available-books.json');
    console.log('Refresh the web page to see longer descriptions.');
}

module.exports = { getOpenLibraryDescription, getGoogleBooksDescription, getBestDescription };

main().catch(console.error);
