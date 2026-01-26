const https = require('https');
const fs = require('fs');

// Scrape AudioFile Best Audiobooks (multiple years)
// These are curated year-end selections - higher quality, more likely to be available

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        };

        https.get(url, options, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : `https://www.audiofilemagazine.com${res.headers.location}`;
                return fetchPage(redirectUrl).then(resolve).catch(reject);
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Parse Best Audiobooks page HTML
function parseBestAudiobooksPage(html, year) {
    const audiobooks = [];

    // Split by <li class entries - each audiobook is in a list item
    const entries = html.split(/<li\s+class="[^"]*"\s+data-filter="([^"]+)"\s+data-year="(\d+)"/);

    for (let i = 1; i < entries.length; i += 3) {
        const genre = entries[i];
        const entryYear = entries[i + 1];
        const content = entries[i + 2];

        if (!content) continue;

        // Extract review ID from image URL or review link
        const idMatch = content.match(/\/(\d{6})\.jpg/) ||
                       content.match(/\/reviews\/read\/(\d+)/);
        if (!idMatch) continue;
        const id = idMatch[1];

        // Extract title from alt attribute
        const titleMatch = content.match(/alt="([^"]+)"/);
        if (!titleMatch) continue;
        const title = titleMatch[1]
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .trim();

        // Extract author and narrator from lead paragraph
        // Pattern: "TITLE by AUTHOR, read by NARRATOR"
        const leadMatch = content.match(/<p class="lead">([^<]+)<\/p>/);
        let author = '';
        let narrator = '';

        if (leadMatch) {
            const leadText = leadMatch[1]
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"');

            // Parse "TITLE by AUTHOR, read by NARRATOR" or "TITLE by AUTHOR"
            const byMatch = leadText.match(/by\s+([^,]+),\s*read\s+by\s+(.+)$/i) ||
                           leadText.match(/by\s+(.+)$/i);

            if (byMatch) {
                author = byMatch[1].trim();
                narrator = byMatch[2] ? byMatch[2].trim() : '';
            }
        }

        // Extract review excerpt
        const reviewMatch = content.match(/<p>\s*([^<]+(?:<[^>]+>[^<]*)*?)\s*<\/p>/);
        let review = '';
        if (reviewMatch) {
            review = reviewMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, ' ')
                .trim();
        }

        // Map genre codes to readable names
        const genreMap = {
            'fiction': 'Fiction',
            'non-fiction': 'Nonfiction & Culture',
            'memoir': 'Biography & Memoir',
            'mystery': 'Mystery & Suspense',
            'scifi': 'Science Fiction & Fantasy',
            'children': 'Children & Family',
            'ya': 'Young Adult',
            'romance': 'Romance',
            'multi': 'Multi-Voice'
        };

        if (title && (author || narrator)) {
            audiobooks.push({
                id,
                url: `https://www.audiofilemagazine.com/reviews/read/${id}/`,
                title,
                author,
                narrator,
                genre: genreMap[genre] || genre,
                review,
                year: parseInt(entryYear) || year,
                isBestOf: true,
                source: `AudioFile Best Audiobooks ${entryYear || year}`
            });
        }
    }

    return audiobooks;
}

// Fetch individual review page for full details
async function fetchReviewDetails(reviewUrl) {
    try {
        const html = await fetchPage(reviewUrl);

        const details = {};

        // Extract duration/runtime
        const durationMatch = html.match(/(\d+(?:\.\d+)?)\s*hours?\s*\(Unabridged\)/i) ||
                             html.match(/(\d+(?:\.\d+)?)\s*hrs?\.?\s*\(Unabridged\)/i);
        if (durationMatch) {
            details.duration = parseFloat(durationMatch[1]);
        }

        // Extract ISBN (13-digit number)
        const isbnMatch = html.match(/(\d{13})/);
        if (isbnMatch) {
            details.isbn = isbnMatch[1];
        }

        // Extract publisher
        const publisherMatch = html.match(/<span[^>]*>Publisher:<\/span>\s*([^<]+)/i) ||
                              html.match(/Publisher:\s*([^<\n]+)/i);
        if (publisherMatch) {
            details.publisher = publisherMatch[1].trim();
        }

        return details;

    } catch (e) {
        return {};
    }
}

async function scrapeBestAudiobooks(years = [2024, 2023, 2022], fetchDetails = true) {
    console.log(`Scraping AudioFile Best Audiobooks for years: ${years.join(', ')}\n`);

    const allAudiobooks = [];

    for (const year of years) {
        const url = `https://www.audiofilemagazine.com/best-audiobooks-${year}/`;
        console.log(`Fetching Best Audiobooks ${year}...`);

        try {
            const html = await fetchPage(url);
            const audiobooks = parseBestAudiobooksPage(html, year);
            console.log(`  Found ${audiobooks.length} audiobooks for ${year}`);
            allAudiobooks.push(...audiobooks);
        } catch (e) {
            console.log(`  Error fetching ${year}: ${e.message}`);
        }

        // Rate limit between years
        await new Promise(r => setTimeout(r, 500));
    }

    // Deduplicate by ID (same book might appear in multiple years)
    const uniqueBooks = [];
    const seenIds = new Set();
    for (const book of allAudiobooks) {
        if (!seenIds.has(book.id)) {
            seenIds.add(book.id);
            uniqueBooks.push(book);
        }
    }

    console.log(`\nTotal unique audiobooks: ${uniqueBooks.length}`);

    // Optionally fetch additional details
    if (fetchDetails && uniqueBooks.length > 0) {
        console.log('\nFetching additional details for each audiobook...\n');

        for (let i = 0; i < uniqueBooks.length; i++) {
            const book = uniqueBooks[i];
            const shortTitle = book.title.substring(0, 30) + (book.title.length > 30 ? '...' : '');
            process.stdout.write(`[${i + 1}/${uniqueBooks.length}] "${shortTitle}"... `);

            const details = await fetchReviewDetails(book.url);

            if (details.isbn) book.isbn = details.isbn;
            if (details.duration) book.duration = details.duration;
            if (details.publisher) book.publisher = details.publisher;

            console.log(details.isbn ? `✓ (ISBN: ${details.isbn})` : '✓');

            // Rate limit
            await new Promise(r => setTimeout(r, 600));
        }
    }

    return uniqueBooks;
}

async function main() {
    const args = process.argv.slice(2);
    let showHelp = false;
    let testMode = false;
    let skipDetails = false;
    let years = [2024, 2023, 2022];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--help' || args[i] === '-h') {
            showHelp = true;
        } else if (args[i] === '--test' || args[i] === '-t') {
            testMode = true;
        } else if (args[i] === '--quick' || args[i] === '-q') {
            skipDetails = true;
        } else if (args[i] === '--years' || args[i] === '-y') {
            const yearStr = args[i + 1];
            if (yearStr) {
                years = yearStr.split(',').map(y => parseInt(y.trim())).filter(y => y);
                i++;
            }
        }
    }

    if (showHelp) {
        console.log(`
AudioFile Best Audiobooks Scraper

Usage: node scrape-best-audiobooks.js [options]

Options:
  --years, -y    Comma-separated years to scrape (default: 2024,2023,2022)
  --test, -t     Test mode - limit to first 5 entries
  --quick, -q    Quick mode - skip fetching individual details
  --help, -h     Show this help

Output:
  Creates audiobooks.json with scraped audiobook data

Example:
  node scrape-best-audiobooks.js --years 2024,2023
        `);
        return;
    }

    try {
        let audiobooks = await scrapeBestAudiobooks(years, !skipDetails);

        if (testMode && audiobooks.length > 5) {
            console.log('\nTest mode: limiting to 5 entries');
            audiobooks = audiobooks.slice(0, 5);
        }

        // Save results
        fs.writeFileSync('audiobooks.json', JSON.stringify(audiobooks, null, 2));

        console.log('\n' + '='.repeat(50));
        console.log('SCRAPING SUMMARY');
        console.log('='.repeat(50));
        console.log(`Total audiobooks: ${audiobooks.length}`);

        // Count by genre
        const genreCounts = {};
        audiobooks.forEach(book => {
            const genre = book.genre || 'Unknown';
            genreCounts[genre] = (genreCounts[genre] || 0) + 1;
        });

        console.log('\nBy genre:');
        Object.entries(genreCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([genre, count]) => {
                console.log(`  ${genre}: ${count}`);
            });

        // Count by year
        const yearCounts = {};
        audiobooks.forEach(book => {
            yearCounts[book.year] = (yearCounts[book.year] || 0) + 1;
        });

        console.log('\nBy year:');
        Object.entries(yearCounts)
            .sort((a, b) => b[0] - a[0])
            .forEach(([year, count]) => {
                console.log(`  ${year}: ${count}`);
            });

        // Show sample entry
        if (audiobooks.length > 0) {
            console.log('\nSample entry:');
            const sample = audiobooks[0];
            console.log(`  Title: ${sample.title}`);
            console.log(`  Author: ${sample.author}`);
            console.log(`  Narrator: ${sample.narrator}`);
            console.log(`  Genre: ${sample.genre}`);
            console.log(`  Year: ${sample.year}`);
            if (sample.isbn) console.log(`  ISBN: ${sample.isbn}`);
            if (sample.duration) console.log(`  Duration: ${sample.duration} hours`);
        }

        console.log('='.repeat(50));
        console.log('\nSaved to audiobooks.json');
        console.log('Next step: node check-audiobook-availability.js');

        // Save metadata
        const metadata = {
            source: 'AudioFile Best Audiobooks',
            scrapedAt: new Date().toISOString(),
            years: years,
            audiobookCount: audiobooks.length,
            genres: [...new Set(audiobooks.map(b => b.genre).filter(Boolean))]
        };
        fs.writeFileSync('audiobook-metadata.json', JSON.stringify(metadata, null, 2));

    } catch (e) {
        console.error('Scraping failed:', e.message);
        process.exit(1);
    }
}

module.exports = { scrapeBestAudiobooks, parseBestAudiobooksPage, fetchReviewDetails };

if (require.main === module) {
    main().catch(console.error);
}
