const fs = require('fs');

// Modern Library Top 100 Novels (Board's List)
// https://sites.prh.com/modernlibrary100
const MODERN_LIBRARY_NOVELS = [
    { rank: 1, title: "Ulysses", author: "James Joyce" },
    { rank: 2, title: "The Great Gatsby", author: "F. Scott Fitzgerald" },
    { rank: 3, title: "A Portrait of the Artist as a Young Man", author: "James Joyce" },
    { rank: 4, title: "Lolita", author: "Vladimir Nabokov" },
    { rank: 5, title: "Brave New World", author: "Aldous Huxley" },
    { rank: 6, title: "The Sound and the Fury", author: "William Faulkner" },
    { rank: 7, title: "Catch-22", author: "Joseph Heller" },
    { rank: 8, title: "Darkness at Noon", author: "Arthur Koestler" },
    { rank: 9, title: "Sons and Lovers", author: "D.H. Lawrence" },
    { rank: 10, title: "The Grapes of Wrath", author: "John Steinbeck" },
    { rank: 11, title: "Under the Volcano", author: "Malcolm Lowry" },
    { rank: 12, title: "The Way of All Flesh", author: "Samuel Butler" },
    { rank: 13, title: "1984", author: "George Orwell" },
    { rank: 14, title: "I, Claudius", author: "Robert Graves" },
    { rank: 15, title: "To the Lighthouse", author: "Virginia Woolf" },
    { rank: 16, title: "An American Tragedy", author: "Theodore Dreiser" },
    { rank: 17, title: "The Heart Is a Lonely Hunter", author: "Carson McCullers" },
    { rank: 18, title: "Slaughterhouse-Five", author: "Kurt Vonnegut" },
    { rank: 19, title: "Invisible Man", author: "Ralph Ellison" },
    { rank: 20, title: "Native Son", author: "Richard Wright" },
    { rank: 21, title: "Henderson the Rain King", author: "Saul Bellow" },
    { rank: 22, title: "Appointment in Samarra", author: "John O'Hara" },
    { rank: 23, title: "U.S.A.", author: "John Dos Passos" },
    { rank: 24, title: "Winesburg, Ohio", author: "Sherwood Anderson" },
    { rank: 25, title: "A Passage to India", author: "E.M. Forster" },
    { rank: 26, title: "The Wings of the Dove", author: "Henry James" },
    { rank: 27, title: "The Ambassadors", author: "Henry James" },
    { rank: 28, title: "Tender Is the Night", author: "F. Scott Fitzgerald" },
    { rank: 29, title: "The Studs Lonigan Trilogy", author: "James T. Farrell" },
    { rank: 30, title: "The Good Soldier", author: "Ford Madox Ford" },
    { rank: 31, title: "Animal Farm", author: "George Orwell" },
    { rank: 32, title: "The Golden Bowl", author: "Henry James" },
    { rank: 33, title: "Sister Carrie", author: "Theodore Dreiser" },
    { rank: 34, title: "A Handful of Dust", author: "Evelyn Waugh" },
    { rank: 35, title: "As I Lay Dying", author: "William Faulkner" },
    { rank: 36, title: "All the King's Men", author: "Robert Penn Warren" },
    { rank: 37, title: "The Bridge of San Luis Rey", author: "Thornton Wilder" },
    { rank: 38, title: "Howards End", author: "E.M. Forster" },
    { rank: 39, title: "Go Tell It on the Mountain", author: "James Baldwin" },
    { rank: 40, title: "The Heart of the Matter", author: "Graham Greene" },
    { rank: 41, title: "Lord of the Flies", author: "William Golding" },
    { rank: 42, title: "Deliverance", author: "James Dickey" },
    { rank: 43, title: "A Dance to the Music of Time", author: "Anthony Powell" },
    { rank: 44, title: "Point Counter Point", author: "Aldous Huxley" },
    { rank: 45, title: "The Sun Also Rises", author: "Ernest Hemingway" },
    { rank: 46, title: "The Secret Agent", author: "Joseph Conrad" },
    { rank: 47, title: "Nostromo", author: "Joseph Conrad" },
    { rank: 48, title: "The Rainbow", author: "D.H. Lawrence" },
    { rank: 49, title: "Women in Love", author: "D.H. Lawrence" },
    { rank: 50, title: "Tropic of Cancer", author: "Henry Miller" },
    { rank: 51, title: "The Naked and the Dead", author: "Norman Mailer" },
    { rank: 52, title: "Portnoy's Complaint", author: "Philip Roth" },
    { rank: 53, title: "Pale Fire", author: "Vladimir Nabokov" },
    { rank: 54, title: "Light in August", author: "William Faulkner" },
    { rank: 55, title: "On the Road", author: "Jack Kerouac" },
    { rank: 56, title: "The Maltese Falcon", author: "Dashiell Hammett" },
    { rank: 57, title: "Parade's End", author: "Ford Madox Ford" },
    { rank: 58, title: "The Age of Innocence", author: "Edith Wharton" },
    { rank: 59, title: "Zuleika Dobson", author: "Max Beerbohm" },
    { rank: 60, title: "The Moviegoer", author: "Walker Percy" },
    { rank: 61, title: "Death Comes for the Archbishop", author: "Willa Cather" },
    { rank: 62, title: "From Here to Eternity", author: "James Jones" },
    { rank: 63, title: "The Wapshot Chronicles", author: "John Cheever" },
    { rank: 64, title: "The Catcher in the Rye", author: "J.D. Salinger" },
    { rank: 65, title: "A Clockwork Orange", author: "Anthony Burgess" },
    { rank: 66, title: "Of Human Bondage", author: "W. Somerset Maugham" },
    { rank: 67, title: "Heart of Darkness", author: "Joseph Conrad" },
    { rank: 68, title: "Main Street", author: "Sinclair Lewis" },
    { rank: 69, title: "The House of Mirth", author: "Edith Wharton" },
    { rank: 70, title: "The Alexandria Quartet", author: "Lawrence Durrell" },
    { rank: 71, title: "A High Wind in Jamaica", author: "Richard Hughes" },
    { rank: 72, title: "A House for Mr. Biswas", author: "V.S. Naipaul" },
    { rank: 73, title: "The Day of the Locust", author: "Nathanael West" },
    { rank: 74, title: "A Farewell to Arms", author: "Ernest Hemingway" },
    { rank: 75, title: "Scoop", author: "Evelyn Waugh" },
    { rank: 76, title: "The Prime of Miss Jean Brodie", author: "Muriel Spark" },
    { rank: 77, title: "Finnegans Wake", author: "James Joyce" },
    { rank: 78, title: "Kim", author: "Rudyard Kipling" },
    { rank: 79, title: "A Room with a View", author: "E.M. Forster" },
    { rank: 80, title: "Brideshead Revisited", author: "Evelyn Waugh" },
    { rank: 81, title: "The Adventures of Augie March", author: "Saul Bellow" },
    { rank: 82, title: "Angle of Repose", author: "Wallace Stegner" },
    { rank: 83, title: "A Bend in the River", author: "V.S. Naipaul" },
    { rank: 84, title: "The Death of the Heart", author: "Elizabeth Bowen" },
    { rank: 85, title: "Lord Jim", author: "Joseph Conrad" },
    { rank: 86, title: "Ragtime", author: "E.L. Doctorow" },
    { rank: 87, title: "The Old Wives' Tale", author: "Arnold Bennett" },
    { rank: 88, title: "The Call of the Wild", author: "Jack London" },
    { rank: 89, title: "Loving", author: "Henry Green" },
    { rank: 90, title: "Midnight's Children", author: "Salman Rushdie" },
    { rank: 91, title: "Tobacco Road", author: "Erskine Caldwell" },
    { rank: 92, title: "Ironweed", author: "William Kennedy" },
    { rank: 93, title: "The Magus", author: "John Fowles" },
    { rank: 94, title: "Wide Sargasso Sea", author: "Jean Rhys" },
    { rank: 95, title: "Under the Net", author: "Iris Murdoch" },
    { rank: 96, title: "Sophie's Choice", author: "William Styron" },
    { rank: 97, title: "The Sheltering Sky", author: "Paul Bowles" },
    { rank: 98, title: "The Postman Always Rings Twice", author: "James M. Cain" },
    { rank: 99, title: "The Ginger Man", author: "J.P. Donleavy" },
    { rank: 100, title: "The Magnificent Ambersons", author: "Booth Tarkington" },
];

// Modern Library Top 100 Nonfiction (Board's List)
const MODERN_LIBRARY_NONFICTION = [
    { rank: 1, title: "The Education of Henry Adams", author: "Henry Adams" },
    { rank: 2, title: "The Varieties of Religious Experience", author: "William James" },
    { rank: 3, title: "Up from Slavery", author: "Booker T. Washington" },
    { rank: 4, title: "A Room of One's Own", author: "Virginia Woolf" },
    { rank: 5, title: "Silent Spring", author: "Rachel Carson" },
    { rank: 6, title: "Selected Essays, 1917-1932", author: "T.S. Eliot" },
    { rank: 7, title: "The Double Helix", author: "James D. Watson" },
    { rank: 8, title: "Speak, Memory", author: "Vladimir Nabokov" },
    { rank: 9, title: "The American Language", author: "H.L. Mencken" },
    { rank: 10, title: "The Elements of Style", author: "William Strunk and E.B. White" },
    { rank: 11, title: "An American Dilemma", author: "Gunnar Myrdal" },
    { rank: 12, title: "Principia Mathematica", author: "Alfred North Whitehead and Bertrand Russell" },
    { rank: 13, title: "The Mismeasure of Man", author: "Stephen Jay Gould" },
    { rank: 14, title: "The Mirror and the Lamp", author: "M.H. Abrams" },
    { rank: 15, title: "The Art of the Soluble", author: "Peter Medawar" },
    { rank: 16, title: "The Ants", author: "Bert Holldobler and Edward O. Wilson" },
    { rank: 17, title: "A Theory of Justice", author: "John Rawls" },
    { rank: 18, title: "Art and Illusion", author: "Ernst Gombrich" },
    { rank: 19, title: "The Making of the English Working Class", author: "E.P. Thompson" },
    { rank: 20, title: "The Souls of Black Folk", author: "W.E.B. Du Bois" },
    { rank: 21, title: "Principia Ethica", author: "G.E. Moore" },
    { rank: 22, title: "Philosophy and Civilization", author: "John Dewey" },
    { rank: 23, title: "On Growth and Form", author: "D'Arcy Wentworth Thompson" },
    { rank: 24, title: "Ideas and Opinions", author: "Albert Einstein" },
    { rank: 25, title: "The Age of Jackson", author: "Arthur M. Schlesinger Jr." },
    { rank: 26, title: "The Making of the Atomic Bomb", author: "Richard Rhodes" },
    { rank: 27, title: "Black Lamb and Grey Falcon", author: "Rebecca West" },
    { rank: 28, title: "Autobiographies", author: "W.B. Yeats" },
    { rank: 29, title: "Science and Civilization in China", author: "Joseph Needham" },
    { rank: 30, title: "Goodbye to All That", author: "Robert Graves" },
    { rank: 31, title: "Homage to Catalonia", author: "George Orwell" },
    { rank: 32, title: "The Autobiography of Mark Twain", author: "Mark Twain" },
    { rank: 33, title: "Children of Crisis", author: "Robert Coles" },
    { rank: 34, title: "A Study of History", author: "Arnold J. Toynbee" },
    { rank: 35, title: "The Autobiography of Malcolm X", author: "Malcolm X and Alex Haley" },
    { rank: 36, title: "The Right Stuff", author: "Tom Wolfe" },
    { rank: 37, title: "Eminent Victorians", author: "Lytton Strachey" },
    { rank: 38, title: "Working", author: "Studs Terkel" },
    { rank: 39, title: "Darkness Visible", author: "William Styron" },
    { rank: 40, title: "The Liberal Imagination", author: "Lionel Trilling" },
    { rank: 41, title: "The Second World War", author: "Winston Churchill" },
    { rank: 42, title: "Out of Africa", author: "Isak Dinesen" },
    { rank: 43, title: "Jefferson and His Time", author: "Dumas Malone" },
    { rank: 44, title: "In the American Grain", author: "William Carlos Williams" },
    { rank: 45, title: "Cadillac Desert", author: "Marc Reisner" },
    { rank: 46, title: "The House of Morgan", author: "Ron Chernow" },
    { rank: 47, title: "The Sweet Science", author: "A.J. Liebling" },
    { rank: 48, title: "The Open Society and Its Enemies", author: "Karl Popper" },
    { rank: 49, title: "The Art of Memory", author: "Frances A. Yates" },
    { rank: 50, title: "Religion and the Rise of Capitalism", author: "R.H. Tawney" },
    { rank: 51, title: "A Preface to Morals", author: "Walter Lippmann" },
    { rank: 52, title: "The Gate of Heavenly Peace", author: "Jonathan D. Spence" },
    { rank: 53, title: "The Structure of Scientific Revolutions", author: "Thomas S. Kuhn" },
    { rank: 54, title: "The Nature and Destiny of Man", author: "Reinhold Niebuhr" },
    { rank: 55, title: "Notes of a Native Son", author: "James Baldwin" },
    { rank: 56, title: "The Autobiography of Alice B. Toklas", author: "Gertrude Stein" },
    { rank: 57, title: "The Promised Land", author: "Nicholas Lemann" },
    { rank: 58, title: "The City in History", author: "Lewis Mumford" },
    { rank: 59, title: "Life on the Mississippi", author: "Mark Twain" },
    { rank: 60, title: "The Journal of Henry David Thoreau", author: "Henry David Thoreau" },
    { rank: 61, title: "Samuel Johnson", author: "Walter Jackson Bate" },
    { rank: 62, title: "The General Theory of Employment, Interest and Money", author: "John Maynard Keynes" },
    { rank: 63, title: "The Lives of a Cell", author: "Lewis Thomas" },
    { rank: 64, title: "The Frontier in American History", author: "Frederick Jackson Turner" },
    { rank: 65, title: "Black Boy", author: "Richard Wright" },
    { rank: 66, title: "Aspects of the Novel", author: "E.M. Forster" },
    { rank: 67, title: "The Civil War", author: "Shelby Foote" },
    { rank: 68, title: "The Gulag Archipelago", author: "Aleksandr Solzhenitsyn" },
    { rank: 69, title: "The Proper Study of Mankind", author: "Isaiah Berlin" },
    { rank: 70, title: "The Nature of the Chemical Bond", author: "Linus Pauling" },
    { rank: 71, title: "Notes on the State of Virginia", author: "Thomas Jefferson" },
    { rank: 72, title: "The Clash of Civilizations and the Remaking of World Order", author: "Samuel P. Huntington" },
    { rank: 73, title: "The Economy of Cities", author: "Jane Jacobs" },
    { rank: 74, title: "The Great Bridge", author: "David McCullough" },
    { rank: 75, title: "Patriotic Gore", author: "Edmund Wilson" },
    { rank: 76, title: "Samuel Adams", author: "Noelle Sickels" },
    { rank: 77, title: "Democracy in America", author: "Alexis de Tocqueville" },
    { rank: 78, title: "Shelley: The Pursuit", author: "Richard Holmes" },
    { rank: 79, title: "The Rise of Theodore Roosevelt", author: "Edmund Morris" },
    { rank: 80, title: "The Informed Heart", author: "Bruno Bettelheim" },
    { rank: 81, title: "The American Political Tradition", author: "Richard Hofstadter" },
    { rank: 82, title: "The Contours of American History", author: "William Appleman Williams" },
    { rank: 83, title: "The Face of Battle", author: "John Keegan" },
    { rank: 84, title: "The Strange Career of Jim Crow", author: "C. Vann Woodward" },
    { rank: 85, title: "Vermeer", author: "Lawrence Gowing" },
    { rank: 86, title: "A Bright Shining Lie", author: "Neil Sheehan" },
    { rank: 87, title: "West with the Night", author: "Beryl Markham" },
    { rank: 88, title: "This Boy's Life", author: "Tobias Wolff" },
    { rank: 89, title: "A Mathematician's Apology", author: "G.H. Hardy" },
    { rank: 90, title: "Six Easy Pieces", author: "Richard P. Feynman" },
    { rank: 91, title: "Pilgrim at Tinker Creek", author: "Annie Dillard" },
    { rank: 92, title: "The Golden Bough", author: "James George Frazer" },
    { rank: 93, title: "Shadow and Act", author: "Ralph Ellison" },
    { rank: 94, title: "The Power Broker", author: "Robert A. Caro" },
    { rank: 95, title: "The American Way of Death", author: "Jessica Mitford" },
    { rank: 96, title: "In Cold Blood", author: "Truman Capote" },
    { rank: 97, title: "The Journalist and the Murderer", author: "Janet Malcolm" },
    { rank: 98, title: "The Tipping Point", author: "Malcolm Gladwell" },
    { rank: 99, title: "Operating Instructions", author: "Anne Lamott" },
    { rank: 100, title: "Melbourne", author: "David Cecil" },
];

function main() {
    console.log('Modern Library Top 100 Scraper');
    console.log('==============================\n');

    const allNewBooks = [];

    // Process novels
    for (const novel of MODERN_LIBRARY_NOVELS) {
        allNewBooks.push({
            title: novel.title,
            author: novel.author,
            isbn: "",
            year: "classic",
            tags: ["fiction", "Modern Library Top 100"],
            source: "Modern Library Top 100 Novels",
            rank: novel.rank
        });
    }
    console.log(`Prepared ${MODERN_LIBRARY_NOVELS.length} novels`);

    // Process nonfiction
    for (const book of MODERN_LIBRARY_NONFICTION) {
        allNewBooks.push({
            title: book.title,
            author: book.author,
            isbn: "",
            year: "classic",
            tags: ["nonfiction", "Modern Library Top 100"],
            source: "Modern Library Top 100 Nonfiction",
            rank: book.rank
        });
    }
    console.log(`Prepared ${MODERN_LIBRARY_NONFICTION.length} nonfiction books`);
    console.log(`Total new: ${allNewBooks.length}\n`);

    // Load existing books.json and merge
    let existing = [];
    if (fs.existsSync('books.json')) {
        existing = JSON.parse(fs.readFileSync('books.json', 'utf8'));
        console.log(`Existing books.json has ${existing.length} books`);
    }

    // Deduplicate by title+author (case-insensitive)
    const seen = new Set(existing.map(b =>
        `${(b.title || '').toLowerCase()}|${(b.author || '').toLowerCase()}`
    ));

    let added = 0;
    for (const book of allNewBooks) {
        const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
        if (!seen.has(key)) {
            existing.push(book);
            seen.add(key);
            added++;
        } else {
            // If duplicate exists, add the Modern Library tag to existing entry
            const existingBook = existing.find(b =>
                b.title.toLowerCase() === book.title.toLowerCase() &&
                (b.author || '').toLowerCase() === book.author.toLowerCase()
            );
            if (existingBook && !(existingBook.tags || []).includes('Modern Library Top 100')) {
                existingBook.tags = existingBook.tags || [];
                existingBook.tags.push('Modern Library Top 100');
                if (!existingBook.source) {
                    existingBook.source = book.source;
                }
                console.log(`  Tagged existing: "${book.title}" by ${book.author}`);
            }
        }
    }

    fs.writeFileSync('books.json', JSON.stringify(existing, null, 2));
    console.log(`\nAdded ${added} new books (${existing.length} total in books.json)`);
    console.log(`\nNext step: npm run check`);
}

module.exports = { MODERN_LIBRARY_NOVELS, MODERN_LIBRARY_NONFICTION };

if (require.main === module) {
    main();
}
