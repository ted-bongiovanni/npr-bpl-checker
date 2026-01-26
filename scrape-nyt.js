const https = require('https');
const fs = require('fs');

// NYT 100 Notable Books - scraped from Goodreads list
// Since NYT website is paywalled, we fetch from the Goodreads curated list

const AVAILABLE_YEARS = ['2024', '2023', '2022', '2021', '2020'];

// Goodreads list IDs for NYT Notable Books by year
const GOODREADS_LIST_IDS = {
    '2024': '220793',
    '2023': '195453',
    '2022': '179330',
    '2021': '166695',
    '2020': '153291'
};

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        };

        const protocol = url.startsWith('https') ? https : require('http');
        protocol.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : `https://www.goodreads.com${res.headers.location}`;
                return fetchPage(redirectUrl).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function parseGoodreadsListPage(html, year) {
    const books = [];

    // Match book entries - Goodreads uses specific patterns
    // Pattern: <a class="bookTitle" ... href="/book/show/...">TITLE</a>
    // followed by <a class="authorName" ...>AUTHOR</a>

    const bookPattern = /<tr[^>]*>[\s\S]*?<a[^>]*class="bookTitle"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*class="authorName"[^>]*>([^<]+)<\/a>/gi;

    let match;
    while ((match = bookPattern.exec(html)) !== null) {
        const url = match[1];
        const title = match[2].trim()
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&nbsp;/g, ' ');
        const author = match[3].trim()
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"');

        // Extract Goodreads book ID from URL
        const idMatch = url.match(/\/book\/show\/(\d+)/);
        const goodreadsId = idMatch ? idMatch[1] : null;

        books.push({
            title,
            author,
            year,
            goodreadsId,
            goodreadsUrl: `https://www.goodreads.com${url}`,
            source: `NYT 100 Notable Books ${year}`,
            tags: ['nyt-notable']
        });
    }

    return books;
}

async function scrapeNYTBooks(years = ['2024']) {
    console.log(`Scraping NYT 100 Notable Books for years: ${years.join(', ')}\n`);

    let allBooks = [];

    for (const year of years) {
        const listId = GOODREADS_LIST_IDS[year];
        if (!listId) {
            console.log(`No Goodreads list ID for year ${year}, skipping...`);
            continue;
        }

        console.log(`Fetching NYT Notable Books ${year}...`);

        try {
            // Fetch multiple pages if needed (Goodreads shows 100 per page)
            const url = `https://www.goodreads.com/list/show/${listId}.The_New_York_Times_100_Notable_Books_of_${year}?page=1`;
            const html = await fetchPage(url);

            const books = parseGoodreadsListPage(html, year);
            console.log(`  Found ${books.length} books for ${year}`);

            allBooks = allBooks.concat(books);

            // Check if there are more pages
            if (html.includes('next_page')) {
                const url2 = `https://www.goodreads.com/list/show/${listId}?page=2`;
                const html2 = await fetchPage(url2);
                const books2 = parseGoodreadsListPage(html2, year);
                console.log(`  Found ${books2.length} more books on page 2`);
                allBooks = allBooks.concat(books2);
            }

        } catch (e) {
            console.log(`  Error fetching ${year}: ${e.message}`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 1000));
    }

    // Deduplicate by title+author
    const uniqueBooks = [];
    const seen = new Set();
    for (const book of allBooks) {
        const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueBooks.push(book);
        }
    }

    console.log(`\nTotal unique books: ${uniqueBooks.length}`);
    return uniqueBooks;
}

async function main() {
    const args = process.argv.slice(2);
    let years = ['2024'];
    let showHelp = false;
    let mergeWithExisting = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--year' || args[i] === '-y') {
            years = args[i + 1].split(',').map(y => y.trim());
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            showHelp = true;
        } else if (args[i] === '--merge' || args[i] === '-m') {
            mergeWithExisting = true;
        } else if (args[i] === '--list-years') {
            console.log('\nAvailable years:', AVAILABLE_YEARS.join(', '));
            return;
        }
    }

    if (showHelp) {
        console.log(`
NYT 100 Notable Books Scraper

Usage: node scrape-nyt.js [options]

Options:
  --year, -y <years>    Comma-separated years to scrape (default: 2024)
  --merge, -m           Merge with existing books.json instead of overwriting
  --list-years          Show all available years
  --help, -h            Show this help

Examples:
  node scrape-nyt.js --year 2024
  node scrape-nyt.js --year 2024,2023 --merge
        `);
        return;
    }

    try {
        let books = await scrapeNYTBooks(years);

        if (mergeWithExisting && fs.existsSync('books.json')) {
            console.log('\nMerging with existing books.json...');
            const existing = JSON.parse(fs.readFileSync('books.json', 'utf8'));

            // Deduplicate
            const seen = new Set(existing.map(b => `${b.title.toLowerCase()}|${(b.author || '').toLowerCase()}`));
            let added = 0;
            for (const book of books) {
                const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
                if (!seen.has(key)) {
                    existing.push(book);
                    seen.add(key);
                    added++;
                }
            }
            books = existing;
            console.log(`Added ${added} new books (${books.length} total)`);
        }

        // Save results
        fs.writeFileSync('books.json', JSON.stringify(books, null, 2));
        console.log(`\nSaved ${books.length} books to books.json`);

        // Update metadata
        const metadata = {
            sources: ['NYT 100 Notable Books'],
            years,
            scrapedAt: new Date().toISOString(),
            bookCount: books.length
        };

        if (mergeWithExisting && fs.existsSync('scrape-metadata.json')) {
            const existingMeta = JSON.parse(fs.readFileSync('scrape-metadata.json', 'utf8'));
            metadata.sources = [...new Set([...(existingMeta.sources || []), ...metadata.sources])];
            metadata.years = [...new Set([...(existingMeta.years || []), ...metadata.years])];
        }

        fs.writeFileSync('scrape-metadata.json', JSON.stringify(metadata, null, 2));

        console.log('\nNext step: node check-availability.js');

    } catch (e) {
        console.error('Scraping failed:', e.message);
        process.exit(1);
    }
}

module.exports = { scrapeNYTBooks, AVAILABLE_YEARS };

if (require.main === module) {
    main().catch(console.error);
}
