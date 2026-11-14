# NPR-BPL Checker

Book discovery tool that finds critically acclaimed books available at Brooklyn Public Library. Aggregates titles from NPR Books We Love, Library Journal, NYT Notable Books, and Modern Library, then checks real-time availability via OverDrive (eBooks) and BiblioCommons (print).

## Quick Start

```bash
npm install
npm run serve    # Express server on http://localhost:3000
npm run check    # Refresh availability (~15 min for 500+ books)
```

Main UI: `http://localhost:3000/index-simple.html`
Full UI with chat: `http://localhost:3000/index.html`

## Environment

- Requires Node.js v18+
- `.env` needs `ANTHROPIC_API_KEY` (for `/api/chat` Claude librarian chatbot)
- `PORT` defaults to 3000

## Project Structure

### Core
- `server.js` - Express server, serves static files, `/api/chat` endpoint (Claude-powered recommendations), auto-refreshes availability if >24h old
- `check-availability.js` - Two-step availability checker: OverDrive eBooks then BiblioCommons print. Sequential with rate limiting (150ms/200ms delays)
- `index-simple.html` - Lightweight UI: genre filtering, shuffle, book grid
- `index.html` - Full UI with integrated chat interface

### Data Files
- `books.json` - All curated book titles (input)
- `available-books.json` - Currently available books with format/copy info (output)
- `availability-results.json` - Full results including unavailable/error books
- `last-checked.json` - Timestamp of last check

### Scrapers
- `scrape-npr.js` - NPR Books We Love (2013-2025), handles gzip/brotli
- `scrape-nyt.js` - NYT Notable Books via Goodreads
- `scrape-library-journal.js` - Library Journal Best Books
- `scrape-modern-library.js` - Modern Library 100 Best Novels
- `scrape-best-audiobooks.js` / `scrape-audiofile.js` - Audiobook sources
- `fetch-ratings.js` - Goodreads ratings
- `enrich-descriptions.js` - Descriptions from Open Library + Wikipedia

## Key Patterns

- **JSON extraction from HTML**: `extractJsonObject()` in check-availability.js counts braces while respecting string escaping to extract embedded JSON
- **Fuzzy title matching**: Normalizes, removes stop words, requires 80%+ word match. OverDrive is searched by title (before any colon) + primary author's last name, and a match also requires that last name among the item's creators (`primaryAuthorLastNames()` ignores translators/editors). Without this, same-titled books by other authors were matched. The list's `author` is kept; the library's is stored as `bplAuthor`
- **Always-available eBooks**: OverDrive `availabilityType: 'always'` titles have no copy count; stored as `alwaysAvailable: true`
- **Compression handling**: scrape-npr.js detects and handles gzip/deflate/brotli
- **Cover images**: NPR-hosted via ISBN, with SVG placeholder fallback
- **Chat model**: `claude-sonnet-5-5`, limited to first 100 books for context

## Adapting for Other Libraries

Update URLs in `check-availability.js`:
- OverDrive: `https://YOURLIBRARY.overdrive.com`
- BiblioCommons: `https://YOURLIBRARY.bibliocommons.com`

## Gotchas

- Availability checks are slow (~15 min) - sequential HTTPS with rate limiting to avoid IP bans
- HTML scraping is fragile - website changes break parsers
- As of Nov 2026, `brooklyn.bibliocommons.com` returns 410 "Site Disabled", so the print check always finds nothing. BPL's catalog moved to `discover.bklynlibrary.org`; the print parser needs rewriting for it
- All scrapers use Chrome user-agent strings to avoid blocks
