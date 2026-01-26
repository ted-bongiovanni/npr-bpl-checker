# BPL Book Finder

Find critically acclaimed books available right now at Brooklyn Public Library.

Books are curated from:
- NPR Books We Love (2013-2025)
- Library Journal Best Books
- NYT 100 Notable Books

## Quick Start

```bash
# Install dependencies
npm install

# Start the web server
npm run serve
```

Open http://localhost:3000/index-simple.html

## Requirements

- Node.js v18 or higher
- That's it!

## Features

- **569 available books** from award lists
- **Format badges** showing eBook and/or Print availability
- **Genre filtering** (Fiction, Nonfiction, Memoir, etc.)
- **Shuffle** to discover new books
- Links directly to BPL catalog to borrow

## Refreshing Book Data

Availability changes daily. To refresh:

```bash
# Check which books are currently available (~15 min)
npm run check

# Fetch fuller descriptions from Open Library (~5 min)
node enrich-descriptions.js
```

## File Overview

| File | Purpose |
|------|---------|
| `index-simple.html` | The main UI |
| `available-books.json` | Books available at BPL with format info |
| `books.json` | Full list of books to check |
| `check-availability.js` | Checks BPL for eBook + Print availability |
| `enrich-descriptions.js` | Fetches descriptions from Open Library |
| `server.js` | Simple web server |

## Scrapers (Optional)

Add more books from best-of lists:

```bash
# NPR Books We Love
node scrape-npr.js --year 2025

# NYT Notable Books (via Goodreads)
node scrape-nyt.js --merge

# Library Journal Best Books
node scrape-library-journal.js --merge
```

Then run `npm run check` to check availability.

## For Other Libraries

This is configured for Brooklyn Public Library. To adapt for another library:

1. Find your library's OverDrive URL (e.g., `nypl.overdrive.com`)
2. Find your library's catalog URL (e.g., `nypl.bibliocommons.com`)
3. Update the URLs in `check-availability.js`

Most large US libraries use OverDrive + BiblioCommons, so minimal changes needed.
