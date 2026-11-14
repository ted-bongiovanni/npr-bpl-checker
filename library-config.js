// Library settings shared by the availability scripts (Node) and the web pages (browser).
// To point the app at another library, change `overdriveSlug` (the part before
// ".overdrive.com" in the library's OverDrive address) and `name`.
(function (root) {
    const LIBRARY = {
        name: 'Brooklyn Public Library',
        homepage: 'https://www.bklynlibrary.org/',
        overdriveSlug: 'brooklyn',
        // Old print catalog; disabled since Nov 2026, so print checks find nothing
        bibliocommonsSlug: 'brooklyn',
        // Current print catalog search page
        catalogSearchBase: 'https://discover.bklynlibrary.org/',
        // Lists are English-language, so only English editions count as a match
        language: 'en'
    };

    LIBRARY.overdriveBase = `https://${LIBRARY.overdriveSlug}.overdrive.com`;

    LIBRARY.bibliocommonsSearchUrl = (query) =>
        `https://${LIBRARY.bibliocommonsSlug}.bibliocommons.com/v2/search?query=${encodeURIComponent(query)}&searchType=keyword`;

    // Print catalog search, for the "Paper" buttons
    LIBRARY.catalogSearchUrl = (query) =>
        `${LIBRARY.catalogSearchBase}?search=${encodeURIComponent(query)}&catalog=true`;

    // Direct link to one title (one edition) in the library's OverDrive collection
    LIBRARY.overdriveTitleUrl = (id) => `${LIBRARY.overdriveBase}/media/${encodeURIComponent(id)}`;

    // Title search; `format` is e.g. 'ebook-overdrive' or 'audiobook-overdrive'
    LIBRARY.overdriveSearchUrl = (query, { format, onlyAvailable = false } = {}) => {
        const params = new URLSearchParams({ query });
        if (onlyAvailable) params.set('showOnlyAvailable', 'true');
        if (format) params.set('format', format);
        return `${LIBRARY.overdriveBase}/search?${params}`;
    };

    // Link to borrow a book: its exact title page when we know the OverDrive ID,
    // otherwise a title search
    LIBRARY.overdriveBorrowUrl = (book, { format } = {}) => book && book.overdriveId
        ? LIBRARY.overdriveTitleUrl(book.overdriveId)
        : LIBRARY.overdriveSearchUrl((book && (book.bplTitle || book.title)) || '', { format });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LIBRARY;
    } else {
        root.LIBRARY = LIBRARY;
    }
})(typeof window !== 'undefined' ? window : globalThis);
