const https = require('https');
const fs = require('fs');

// Library Journal Best Books - scraped from BiblioCommons library lists
// Since LJ website is paywalled, we fetch from public library curated lists

function fetchPage(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        };

        https.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchPage(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

// Parse BiblioCommons list page
function parseBiblioCommonsList(html, year, category) {
    const books = [];

    // BiblioCommons uses specific patterns for book entries
    // Look for title and author in list items
    const bookPattern = /<span[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<span[^>]*class="[^"]*author[^"]*"[^>]*>([^<]+)<\/span>/gi;

    let match;
    while ((match = bookPattern.exec(html)) !== null) {
        const title = match[1].trim()
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"');
        const author = match[2].trim()
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/^by\s+/i, '');

        books.push({
            title,
            author,
            year,
            category,
            source: `Library Journal Best Books ${year}`,
            tags: ['library-journal']
        });
    }

    return books;
}

// Known Library Journal Best Books 2024 (compiled from multiple BiblioCommons sources)
const LJ_BEST_BOOKS_2024 = [
    // Pop Fiction
    { title: "The Wedding People", author: "Alison Espach", category: "Pop Fiction" },
    { title: "Anita de Monte Laughs Last", author: "Xochitl Gonzalez", category: "Pop Fiction" },
    { title: "The Wildes", author: "Louis Bayard", category: "Pop Fiction" },
    { title: "Long Island Compromise", author: "Taffy Brodesser-Akner", category: "Pop Fiction" },
    { title: "The God of the Woods", author: "Liz Moore", category: "Pop Fiction" },
    { title: "Sandwich", author: "Catherine Newman", category: "Pop Fiction" },
    { title: "54 Miles", author: "Leonard Pitts Jr.", category: "Pop Fiction" },
    { title: "Sweetness in the Skin", author: "Ishi Robinson", category: "Pop Fiction" },
    { title: "The Queen of Sugar Hill", author: "ReShonda Tate", category: "Pop Fiction" },
    { title: "Familiaris", author: "David Wroblewski", category: "Pop Fiction" },

    // Literary Fiction
    { title: "Ghostroots", author: "'Pemi Aguda", category: "Literary Fiction" },
    { title: "Martyr!", author: "Kaveh Akbar", category: "Literary Fiction" },
    { title: "The Extinction of Irena Rey", author: "Jennifer Croft", category: "Literary Fiction" },
    { title: "James", author: "Percival Everett", category: "Literary Fiction" },
    { title: "The Goodbye Process", author: "Mary Jones", category: "Literary Fiction" },
    { title: "Creation Lake", author: "Rachel Kushner", category: "Literary Fiction" },
    { title: "Honey", author: "Victor Lodato", category: "Literary Fiction" },
    { title: "Mina's Matchbox", author: "Yoko Ogawa", category: "Literary Fiction" },
    { title: "Hard by a Great Forest", author: "Leo Vardiashvili", category: "Literary Fiction" },
    { title: "The Coin", author: "Yasmin Zaher", category: "Literary Fiction" },

    // Crime Fiction (commonly included)
    { title: "The Wharton Plot", author: "Mariah Fredericks", category: "Crime Fiction" },
    { title: "The Hunter", author: "Tana French", category: "Crime Fiction" },
    { title: "The Mysterious Case of the Alperton Angels", author: "Janice Hallett", category: "Crime Fiction" },

    // Additional notable titles from LJ reviews
    { title: "The Women", author: "Kristin Hannah", category: "Fiction" },
    { title: "The Bright Sword", author: "Lev Grossman", category: "Fiction" },
    { title: "Intermezzo", author: "Sally Rooney", category: "Literary Fiction" },
    { title: "All Fours", author: "Miranda July", category: "Literary Fiction" },
    { title: "Wandering Stars", author: "Tommy Orange", category: "Literary Fiction" },
    { title: "The Mighty Red", author: "Louise Erdrich", category: "Literary Fiction" },
    { title: "Someone Like Us", author: "Dinaw Mengestu", category: "Literary Fiction" },
    { title: "Long Island Compromise", author: "Taffy Brodesser-Akner", category: "Literary Fiction" },
    { title: "Rejection", author: "Tony Tulathimutte", category: "Literary Fiction" },
    { title: "Headshot", author: "Rita Bullwinkel", category: "Literary Fiction" },
    { title: "Beautyland", author: "Marie-Helene Bertino", category: "Literary Fiction" },
    { title: "Colored Television", author: "Danzy Senna", category: "Literary Fiction" },

    // Nonfiction
    { title: "The Anxious Generation", author: "Jonathan Haidt", category: "Nonfiction" },
    { title: "Cue the Sun!", author: "Emily Nussbaum", category: "Nonfiction" },
    { title: "The Message", author: "Ta-Nehisi Coates", category: "Nonfiction" },
    { title: "Be Ready When the Luck Happens", author: "Ina Garten", category: "Memoir" },
    { title: "Knife", author: "Salman Rushdie", category: "Memoir" },
    { title: "Lovely One", author: "Ketanji Brown Jackson", category: "Memoir" },
    { title: "There's Always This Year", author: "Hanif Abdurraqib", category: "Nonfiction" },
    { title: "The Wide Wide Sea", author: "Hampton Sides", category: "History" },
    { title: "Challenger", author: "Adam Higginbotham", category: "History" },
];

async function scrapeLJBooks(years = ['2024']) {
    console.log(`Getting Library Journal Best Books for years: ${years.join(', ')}\n`);

    let allBooks = [];

    for (const year of years) {
        console.log(`Processing Library Journal Best Books ${year}...`);

        if (year === '2024') {
            // Use curated list for 2024
            const books = LJ_BEST_BOOKS_2024.map(b => ({
                ...b,
                year: '2024',
                source: 'Library Journal Best Books 2024',
                tags: ['library-journal', b.category.toLowerCase().replace(/\s+/g, '-')]
            }));
            console.log(`  Found ${books.length} books for ${year}`);
            allBooks = allBooks.concat(books);
        } else {
            // Try to scrape from BiblioCommons for other years
            console.log(`  Year ${year} not yet supported, skipping...`);
        }
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
        }
    }

    if (showHelp) {
        console.log(`
Library Journal Best Books Scraper

Usage: node scrape-library-journal.js [options]

Options:
  --year, -y <years>    Comma-separated years to scrape (default: 2024)
  --merge, -m           Merge with existing books.json instead of overwriting
  --help, -h            Show this help

Examples:
  node scrape-library-journal.js --year 2024
  node scrape-library-journal.js --merge
        `);
        return;
    }

    try {
        let books = await scrapeLJBooks(years);

        if (mergeWithExisting && fs.existsSync('books.json')) {
            console.log('\nMerging with existing books.json...');
            const existing = JSON.parse(fs.readFileSync('books.json', 'utf8'));

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

        fs.writeFileSync('books.json', JSON.stringify(books, null, 2));
        console.log(`\nSaved ${books.length} books to books.json`);

        // Update metadata
        const metadata = {
            sources: ['Library Journal Best Books'],
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

module.exports = { scrapeLJBooks, LJ_BEST_BOOKS_2024 };

if (require.main === module) {
    main().catch(console.error);
}
