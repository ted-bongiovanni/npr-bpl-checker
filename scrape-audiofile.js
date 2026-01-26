const https = require('https');
const fs = require('fs');

// AudioFile Earphones Awards scraper
// Scrapes award-winning audiobooks from AudioFile Magazine

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        };

        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            ...options
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

// Parse the Earphones Awards page HTML
function parseEarphonesPage(html) {
    const audiobooks = [];

    // Split by review-item divs - each entry is contained in one
    const entries = html.split('<div class="review-item">').slice(1); // Skip first (before any entry)

    for (const entry of entries) {
        // Extract URL and ID from the review link
        const urlMatch = entry.match(/href="(https:\/\/www\.audiofilemagazine\.com\/reviews\/read\/(\d+)\/[^"]+)"/i);
        if (!urlMatch) continue;

        const url = urlMatch[1];
        const id = urlMatch[2];

        // Extract title from alt attribute or h3
        const titleMatch = entry.match(/alt="([^"]+)"/i) ||
                          entry.match(/<h3[^>]*><a[^>]*>([^<]+)/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        // Extract author and narrator from h4
        const h4Match = entry.match(/<h4>by\s*<a[^>]*>([^<]+)<\/a>\s*\|\s*Read by\s*<a[^>]*>([^<]+)<\/a>/i);
        const author = h4Match ? h4Match[1].trim() : '';
        const narrator = h4Match ? h4Match[2].trim() : '';

        // Extract publisher from h5
        const h5Match = entry.match(/<h5>([^<]+)<\/h5>/i);
        const publisher = h5Match ? h5Match[1].replace(/&amp;/g, '&').trim() : '';

        // Extract genre from category link
        const genreMatch = entry.match(/<a[^>]*class="review-item-category[^"]*"[^>]*><span>([^<]+)<\/span><\/a>/i);
        const genre = genreMatch ? genreMatch[1].replace(/&amp;/g, '&').trim() : '';

        // Extract review excerpt from p tag
        const reviewMatch = entry.match(/<p>([^<]+(?:<[^>]+>[^<]*)*?)\.\.\.\s*<a[^>]*>Read More<\/a>/i);
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

        if (title && (author || narrator)) {
            audiobooks.push({
                id,
                url,
                title,
                author,
                narrator,
                publisher,
                genre,
                review,
                isEarphonesAward: true
            });
        }
    }

    return audiobooks;
}

// Fetch individual review page for full details (ISBN, duration, year)
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

        // Extract publication year/date
        const dateMatch = html.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
        if (dateMatch) {
            details.year = dateMatch[1];
        }

        // Get a longer review if available
        const fullReviewMatch = html.match(/<div[^>]*class="[^"]*review-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                               html.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        if (fullReviewMatch) {
            details.fullReview = fullReviewMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/\s+/g, ' ')
                .trim();
        }

        return details;

    } catch (e) {
        console.error(`Error fetching details: ${e.message}`);
        return {};
    }
}

// Scrape the main Earphones Awards page
async function scrapeEarphonesAwards(fetchDetails = true) {
    console.log('Fetching AudioFile Earphones Awards...\n');

    const url = 'https://www.audiofilemagazine.com/reviews/earphones/';
    const html = await fetchPage(url);

    // Parse entries from the page
    const audiobooks = parseEarphonesPage(html);
    console.log(`Found ${audiobooks.length} audiobooks on the awards page\n`);

    if (fetchDetails && audiobooks.length > 0) {
        console.log('Fetching additional details for each audiobook...\n');

        for (let i = 0; i < audiobooks.length; i++) {
            const book = audiobooks[i];
            process.stdout.write(`[${i + 1}/${audiobooks.length}] "${book.title.substring(0, 35)}${book.title.length > 35 ? '...' : ''}"... `);

            const details = await fetchReviewDetails(book.url);

            if (details.isbn) book.isbn = details.isbn;
            if (details.duration) book.duration = details.duration;
            if (details.year) book.year = details.year;
            if (details.fullReview && details.fullReview.length > (book.review || '').length) {
                book.review = details.fullReview;
            }

            console.log(details.isbn ? `✓ (ISBN: ${details.isbn})` : '✓');

            // Rate limit to be respectful
            await new Promise(r => setTimeout(r, 800));
        }
    }

    return audiobooks;
}

// Main function
async function main() {
    const args = process.argv.slice(2);
    let showHelp = false;
    let testMode = false;
    let skipDetails = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--help' || args[i] === '-h') {
            showHelp = true;
        } else if (args[i] === '--test' || args[i] === '-t') {
            testMode = true;
        } else if (args[i] === '--quick' || args[i] === '-q') {
            skipDetails = true;
        }
    }

    if (showHelp) {
        console.log(`
AudioFile Earphones Awards Scraper

Usage: node scrape-audiofile.js [options]

Options:
  --test, -t       Test mode - only process first 5 entries
  --quick, -q      Quick mode - skip fetching individual details
  --help, -h       Show this help

Output:
  Creates audiobooks.json with scraped audiobook data

Note:
  This scraper fetches the current Earphones Award winners from AudioFile Magazine.
  The awards are given monthly to exceptional audiobook narrations.
        `);
        return;
    }

    try {
        let audiobooks = await scrapeEarphonesAwards(!skipDetails);

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

        // Show sample entry
        if (audiobooks.length > 0) {
            console.log('\nSample entry:');
            const sample = audiobooks[0];
            console.log(`  Title: ${sample.title}`);
            console.log(`  Author: ${sample.author}`);
            console.log(`  Narrator: ${sample.narrator}`);
            console.log(`  Genre: ${sample.genre}`);
            if (sample.isbn) console.log(`  ISBN: ${sample.isbn}`);
            if (sample.duration) console.log(`  Duration: ${sample.duration} hours`);
        }

        console.log('='.repeat(50));
        console.log('\nSaved to audiobooks.json');
        console.log('Next step: node check-audiobook-availability.js');

        // Also save metadata
        const metadata = {
            source: 'AudioFile Earphones Awards',
            scrapedAt: new Date().toISOString(),
            audiobookCount: audiobooks.length,
            genres: [...new Set(audiobooks.map(b => b.genre).filter(Boolean))]
        };
        fs.writeFileSync('audiobook-metadata.json', JSON.stringify(metadata, null, 2));

    } catch (e) {
        console.error('Scraping failed:', e.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = { scrapeEarphonesAwards, fetchReviewDetails, parseEarphonesPage };

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
