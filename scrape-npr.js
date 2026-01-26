const https = require('https');
const fs = require('fs');

// Available tags for NPR Books We Love (as they appear in the JSON)
const AVAILABLE_TAGS = [
    { id: 'staff-picks', name: 'Staff Picks', jsonValue: 'staff picks' },
    { id: 'book-club-ideas', name: 'Book Club Ideas', jsonValue: 'book club ideas' },
    { id: 'eye-opening-reads', name: 'Eye-Opening Reads', jsonValue: 'eye-opening reads' },
    { id: 'seriously-great-writing', name: 'Seriously Great Writing', jsonValue: 'seriously great writing' },
    { id: 'fiction', name: 'Fiction', jsonValue: 'fiction' },
    { id: 'nonfiction', name: 'Nonfiction', jsonValue: 'nonfiction' },
    { id: 'biography-memoir', name: 'Biography & Memoir', jsonValue: 'biography & memoir' },
    { id: 'comics-graphic-novels', name: 'Comics & Graphic Novels', jsonValue: 'comics & graphic novels' },
    { id: 'cookbooks-food', name: 'Cookbooks & Food', jsonValue: 'cookbooks & food' },
    { id: 'historical-fiction', name: 'Historical Fiction', jsonValue: 'historical fiction' },
    { id: 'kids-books', name: "Kids' Books", jsonValue: "kids' books" },
    { id: 'love-romance', name: 'Love & Romance', jsonValue: 'love & romance' },
    { id: 'mysteries-thrillers', name: 'Mysteries & Thrillers', jsonValue: 'mysteries & thrillers' },
    { id: 'sci-fi-fantasy-speculative-fiction', name: 'Sci Fi, Fantasy & Speculative Fiction', jsonValue: 'sci fi, fantasy & speculative fiction' },
    { id: 'short-stories-essays-poetry', name: 'Short Stories, Essays & Poetry', jsonValue: 'short stories, essays & poetry' },
    { id: 'young-adult', name: 'Young Adult', jsonValue: 'young adult' },
    { id: 'family-matters', name: 'Family Matters', jsonValue: 'family matters' },
    { id: 'for-art-lovers', name: 'For Art Lovers', jsonValue: 'for art lovers' },
    { id: 'for-history-lovers', name: 'For History Lovers', jsonValue: 'for history lovers' },
    { id: 'for-music-lovers', name: 'For Music Lovers', jsonValue: 'for music lovers' },
    { id: 'for-sports-lovers', name: 'For Sports Lovers', jsonValue: 'for sports lovers' },
    { id: 'funny-stuff', name: 'Funny Stuff', jsonValue: 'funny stuff' },
    { id: 'identity-culture', name: 'Identity & Culture', jsonValue: 'identity & culture' },
    { id: 'its-all-geek-to-me', name: "It's All Geek To Me", jsonValue: "it's all geek to me" },
    { id: 'lets-talk-about-sex', name: "Let's Talk About Sex", jsonValue: "let's talk about sex" },
    { id: 'no-biz-like-show-biz', name: 'No Biz Like Show Biz', jsonValue: 'no biz like show biz' },
    { id: 'science', name: 'Science!', jsonValue: 'science!' },
    { id: 'the-states-were-in', name: "The States We're In", jsonValue: "the states we're in" },
    { id: 'tales-from-around-the-world', name: 'Tales From Around The World', jsonValue: 'tales from around the world' },
    { id: 'the-dark-side', name: 'The Dark Side', jsonValue: 'the dark side' },
    { id: 'rather-long', name: 'Rather Long', jsonValue: 'rather long' },
    { id: 'rather-short', name: 'Rather Short', jsonValue: 'rather short' }
];

// Available years
const AVAILABLE_YEARS = ['2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016', '2015', '2014', '2013'];

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json,*/*',
                'Accept-Encoding': 'gzip, deflate, br',
            }
        };
        https.get(url, options, (res) => {
            let data = '';

            // Handle gzip/deflate
            const encoding = res.headers['content-encoding'];
            let stream = res;
            if (encoding === 'gzip') {
                const zlib = require('zlib');
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                const zlib = require('zlib');
                stream = res.pipe(zlib.createInflate());
            } else if (encoding === 'br') {
                const zlib = require('zlib');
                stream = res.pipe(zlib.createBrotliDecompress());
            }

            stream.on('data', chunk => data += chunk);
            stream.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid JSON: ' + e.message));
                }
            });
            stream.on('error', reject);
        }).on('error', reject);
    });
}

// Convert tag ID to JSON value for filtering
function tagIdToJsonValue(tagId) {
    const tag = AVAILABLE_TAGS.find(t => t.id === tagId);
    return tag ? tag.jsonValue : tagId.replace(/-/g, ' ');
}

async function scrapeNPRBooks(year = '2025', tags = []) {
    console.log(`Fetching NPR Books We Love ${year}...`);

    try {
        // Fetch the JSON directly from NPR
        const url = `https://apps.npr.org/best-books/${year}.json`;
        let books = await fetchJSON(url);

        console.log(`Found ${books.length} total books for ${year}`);

        // Filter by tags if specified (match ANY of the specified tags)
        if (tags.length > 0) {
            const tagValues = tags.map(t => tagIdToJsonValue(t).toLowerCase());
            console.log(`Filtering by tags: ${tagValues.join(', ')}`);

            books = books.filter(book => {
                const bookTags = (book.tags || []).map(t => t.toLowerCase());
                // Book must have ALL specified tags
                return tagValues.every(tag => bookTags.includes(tag));
            });

            console.log(`${books.length} books match all specified tags`);
        }

        // Convert to our format
        return books.map(book => ({
            title: book.title,
            author: book.author,
            isbn: book.cover, // NPR uses 'cover' field for ISBN
            year: year,
            tags: book.tags || [],
            nprId: book.id
        }));

    } catch (error) {
        console.error(`Error fetching data:`, error.message);
        return [];
    }
}

// Search Goodreads for rating (using their search results page)
function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

async function getGoodreadsRating(title, author) {
    try {
        const query = encodeURIComponent(`${title} ${author}`);
        const url = `https://www.goodreads.com/search?q=${query}`;
        const html = await fetchPage(url);

        // Look for rating in search results
        const ratingMatch = html.match(/(\d+\.\d+)\s*avg\s*rating/i);
        if (ratingMatch) {
            return parseFloat(ratingMatch[1]);
        }

        const altMatch = html.match(/aria-label="(\d+\.\d+)\s*stars?"/i);
        if (altMatch) {
            return parseFloat(altMatch[1]);
        }

        return null;
    } catch (e) {
        return null;
    }
}

// Command line interface
async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let years = ['2025'];
    let tags = [];
    let showHelp = false;
    let includeRatings = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--year' || args[i] === '-y') {
            years = args[i + 1].split(',').map(y => y.trim());
            i++;
        } else if (args[i] === '--tags' || args[i] === '-t') {
            tags = args[i + 1].split(',').map(t => t.trim());
            i++;
        } else if (args[i] === '--ratings' || args[i] === '-r') {
            includeRatings = true;
        } else if (args[i] === '--help' || args[i] === '-h') {
            showHelp = true;
        } else if (args[i] === '--list-tags') {
            console.log('\nAvailable tags:');
            AVAILABLE_TAGS.forEach(t => console.log(`  ${t.id}: ${t.name}`));
            return;
        } else if (args[i] === '--list-years') {
            console.log('\nAvailable years:', AVAILABLE_YEARS.join(', '));
            return;
        }
    }

    if (showHelp) {
        console.log(`
NPR Books We Love Scraper

Usage: node scrape-npr.js [options]

Options:
  --year, -y <years>    Comma-separated years to scrape (default: 2025)
  --tags, -t <tags>     Comma-separated list of tag IDs to filter by (books must match ALL tags)
  --ratings, -r         Include Goodreads ratings (slower)
  --list-tags           Show all available tags
  --list-years          Show all available years
  --help, -h            Show this help

Examples:
  node scrape-npr.js --year 2025
  node scrape-npr.js --year 2024,2025
  node scrape-npr.js --tags "fiction,seriously-great-writing"
  node scrape-npr.js --year 2025 --tags fiction --ratings
        `);
        return;
    }

    console.log(`\nScraping NPR Books We Love for years: ${years.join(', ')}`);
    if (tags.length > 0) {
        console.log(`Filtering by tags: ${tags.join(', ')}`);
    }

    let allBooks = [];

    for (const year of years) {
        const books = await scrapeNPRBooks(year, tags);
        allBooks = allBooks.concat(books);
    }

    if (allBooks.length === 0) {
        console.log('No books found matching your criteria.');
        return;
    }

    // Optionally fetch Goodreads ratings
    if (includeRatings) {
        console.log('\nFetching Goodreads ratings (this may take a while)...');
        for (let i = 0; i < allBooks.length; i++) {
            const book = allBooks[i];
            process.stdout.write(`[${i + 1}/${allBooks.length}] ${book.title.substring(0, 40)}... `);
            const rating = await getGoodreadsRating(book.title, book.author || '');
            book.goodreadsRating = rating;
            console.log(rating ? `${rating}/5` : 'not found');
            await new Promise(r => setTimeout(r, 500));
        }
    }

    console.log(`\nTotal: ${allBooks.length} books`);

    // Save to books.json
    fs.writeFileSync('books.json', JSON.stringify(allBooks, null, 2));
    console.log(`Saved to books.json`);

    // Also save filter metadata
    const metadata = {
        years,
        tags,
        scrapedAt: new Date().toISOString(),
        bookCount: allBooks.length
    };
    fs.writeFileSync('scrape-metadata.json', JSON.stringify(metadata, null, 2));

    console.log('\nNext step: node check-availability.js');
}

// Export for use as module
module.exports = { scrapeNPRBooks, AVAILABLE_TAGS, AVAILABLE_YEARS, getGoodreadsRating };

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}
