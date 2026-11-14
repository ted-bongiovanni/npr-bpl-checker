const fs = require('fs');
const { fetchPage, searchUrlFor, findAvailableMatch } = require('./overdrive');

// Check library availability for audiobooks

// Load audiobooks from JSON
let audiobooks;
try {
    audiobooks = JSON.parse(fs.readFileSync('audiobooks.json', 'utf8'));
} catch (e) {
    console.error('Error: audiobooks.json not found. Run scrape-audiofile.js first.');
    process.exit(1);
}

async function checkAvailability() {
    console.log(`Checking audiobook availability for ${audiobooks.length} titles...`);
    console.log('This will take approximately ' + Math.round(audiobooks.length * 0.3 / 60) + ' minutes.\n');

    const availableAudiobooks = [];
    const unavailableAudiobooks = [];
    const errors = [];

    for (let i = 0; i < audiobooks.length; i++) {
        const audiobook = audiobooks[i];
        const progress = `[${i + 1}/${audiobooks.length}]`;

        try {
            // Search OverDrive (title + author's last name, available now, audiobooks only)
            const html = await fetchPage(searchUrlFor(audiobook, 'audiobook-overdrive'));
            const result = findAvailableMatch(html, {
                title: audiobook.title,
                author: audiobook.author,
                type: 'audiobook',
                extraStopWords: ['audiobook']
            });

            if (result.available) {
                const ratingStr = result.starRating ? ` ⭐${result.starRating.toFixed(1)}` : '';
                console.log(`${progress} 🎧 AVAILABLE: "${result.title}" (${result.availableCopies}/${result.ownedCopies} copies)${ratingStr}`);
                availableAudiobooks.push({
                    ...audiobook,
                    bplTitle: result.title,
                    bplAuthor: result.author,
                    // OverDrive title ID: the front end links straight to this edition's page
                    overdriveId: result.overdriveId || null,
                    availableCopies: result.availableCopies,
                    ownedCopies: result.ownedCopies,
                    bplDescription: result.description,
                    subjects: result.subjects,
                    format: 'audiobook',
                    // OverDrive ratings
                    starRating: result.starRating,
                    starRatingCount: result.starRatingCount
                });
            } else {
                console.log(`${progress} ⏳ Not available: "${audiobook.title}"`);
                unavailableAudiobooks.push(audiobook);
            }

        } catch (error) {
            console.log(`${progress} ⚠️ Error: "${audiobook.title}" - ${error.message}`);
            errors.push({ audiobook, error: error.message });
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Save results
    const results = {
        checkedAt: new Date().toISOString(),
        source: 'AudioFile Earphones Awards',
        summary: {
            total: audiobooks.length,
            available: availableAudiobooks.length,
            unavailable: unavailableAudiobooks.length,
            errors: errors.length
        },
        available: availableAudiobooks,
        unavailable: unavailableAudiobooks,
        errors: errors
    };

    fs.writeFileSync('audiobook-availability-results.json', JSON.stringify(results, null, 2));
    fs.writeFileSync('available-audiobooks.json', JSON.stringify(availableAudiobooks, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('AUDIOBOOK AVAILABILITY SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total audiobooks checked: ${audiobooks.length}`);
    console.log(`🎧 Available now: ${availableAudiobooks.length}`);
    console.log(`⏳ Not available: ${unavailableAudiobooks.length}`);
    console.log(`⚠️ Errors: ${errors.length}`);
    console.log('='.repeat(60));
    console.log('\nResults saved to:');
    console.log('  - audiobook-availability-results.json (full results)');
    console.log('  - available-audiobooks.json (only available audiobooks)');

    if (availableAudiobooks.length > 0) {
        console.log('\n🎧 AVAILABLE AUDIOBOOKS YOU CAN BORROW NOW:');
        availableAudiobooks.forEach((book, i) => {
            console.log(`  ${i + 1}. "${book.bplTitle || book.title}"`);
            console.log(`     Narrated by ${book.narrator}`);
        });
    } else {
        console.log('\n😢 No immediately available audiobooks found from this list.');
        console.log('Try again later - availability changes frequently!');
    }
}

checkAvailability().catch(console.error);
