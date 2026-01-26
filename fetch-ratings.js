const https = require('https');
const fs = require('fs');

// Function to make HTTPS request
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
                return fetchPage(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Fetch Goodreads rating by scraping search results
async function getGoodreadsRating(title, author) {
    try {
        const query = encodeURIComponent(`${title} ${author || ''}`);
        const url = `https://www.goodreads.com/search?q=${query}`;
        const html = await fetchPage(url);

        // Look for rating patterns in the HTML
        // Pattern 1: "X.XX avg rating" in minirating
        let match = html.match(/(\d\.\d{2})\s*avg\s*rating/i);
        if (match) {
            return parseFloat(match[1]);
        }

        // Pattern 2: aria-label with stars
        match = html.match(/aria-label="(\d\.\d{1,2})\s*(?:out of 5 )?stars?"/i);
        if (match) {
            return parseFloat(match[1]);
        }

        // Pattern 3: Rating value in JSON-LD
        match = html.match(/"ratingValue":\s*"?(\d\.\d{1,2})"?/i);
        if (match) {
            return parseFloat(match[1]);
        }

        // Pattern 4: averageRating in data
        match = html.match(/averageRating['":\s]+(\d\.\d{1,2})/i);
        if (match) {
            return parseFloat(match[1]);
        }

        return null;
    } catch (e) {
        return null;
    }
}

async function main() {
    // Load available books
    let books;
    try {
        books = JSON.parse(fs.readFileSync('available-books.json', 'utf8'));
    } catch (e) {
        console.error('Error: available-books.json not found. Run check-availability.js first.');
        process.exit(1);
    }

    console.log(`Fetching Goodreads ratings for ${books.length} books...`);
    console.log('This will take approximately ' + Math.round(books.length * 1.5 / 60) + ' minutes.\n');

    let found = 0;
    let notFound = 0;

    for (let i = 0; i < books.length; i++) {
        const book = books[i];
        const title = book.bplTitle || book.title;
        const author = book.author || '';

        process.stdout.write(`[${i + 1}/${books.length}] "${title.substring(0, 40)}${title.length > 40 ? '...' : ''}"... `);

        const rating = await getGoodreadsRating(title, author);

        if (rating) {
            book.goodreadsRating = rating;
            console.log(`⭐ ${rating}`);
            found++;
        } else {
            console.log('not found');
            notFound++;
        }

        // Delay to avoid rate limiting (Goodreads is stricter)
        await new Promise(r => setTimeout(r, 1000));
    }

    // Save updated books
    fs.writeFileSync('available-books.json', JSON.stringify(books, null, 2));

    console.log('\n' + '='.repeat(50));
    console.log('RATINGS SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total books: ${books.length}`);
    console.log(`⭐ Ratings found: ${found}`);
    console.log(`❓ Not found: ${notFound}`);
    console.log('='.repeat(50));
    console.log('\nRatings saved to available-books.json');
    console.log('Refresh the web page to see ratings.');
}

main().catch(console.error);
