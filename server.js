const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Check if availability data is stale (> 24 hours old)
function checkAndRefreshAvailability() {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    try {
        const lastCheckedPath = path.join(__dirname, 'last-checked.json');
        if (!fs.existsSync(lastCheckedPath)) {
            console.log('No last-checked.json found - running availability check...');
            runAvailabilityCheck();
            return;
        }

        const data = JSON.parse(fs.readFileSync(lastCheckedPath, 'utf8'));
        const lastChecked = new Date(data.lastChecked);
        const now = new Date();
        const age = now - lastChecked;

        if (age > TWENTY_FOUR_HOURS) {
            const hours = Math.round(age / (60 * 60 * 1000));
            console.log(`Availability data is ${hours} hours old - refreshing...`);
            runAvailabilityCheck();
        } else {
            const hours = Math.round(age / (60 * 60 * 1000));
            console.log(`Availability data is ${hours} hours old (fresh)`);
        }
    } catch (e) {
        console.error('Error checking availability freshness:', e.message);
    }
}

function runAvailabilityCheck() {
    console.log('Starting availability check in background...');
    const child = spawn('node', ['check-availability.js'], {
        cwd: __dirname,
        stdio: 'inherit',
        detached: true
    });
    child.unref();
}

// Initialize Anthropic client (reads ANTHROPIC_API_KEY from environment)
const anthropic = new Anthropic();

// Middleware
app.use(express.json({ limit: '5mb' }));

// CORS headers for local development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.static('.'));

// System prompt for the librarian chatbot
const SYSTEM_PROMPT = `You are a friendly librarian helping users find their next great read.
You have access to a curated list of highly-rated books currently available
at the Brooklyn Public Library via Libby/OverDrive.

Your approach:
1. First, warmly greet the user and ask what book they read recently
2. Ask a follow-up about what they enjoyed or didn't enjoy about it
3. Ask what kind of reading experience they're in the mood for
4. Based on their answers, recommend 2-3 books from the available list
5. Explain why each book might appeal to them

Keep responses conversational and concise (2-3 paragraphs max). When recommending books,
include the title, author, a brief personalized pitch, and the borrow link.

Format book recommendations like this:
**Title** by Author - Your pitch for why they'd enjoy it.
[Borrow from BPL](borrowUrl)

IMPORTANT: Only recommend books from the "Available Books" list provided below.
Do not recommend books that aren't on this list, as they may not be available.
Each book includes a borrowUrl - always include this link in your recommendations.

Available books will be provided in the conversation context.`;

// POST /api/chat - Chat with Claude about book recommendations
app.post('/api/chat', async (req, res) => {
    try {
        const { messages, availableBooks } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        // Build context with available books
        let booksContext = '';
        if (availableBooks && Array.isArray(availableBooks) && availableBooks.length > 0) {
            // Limit to a reasonable number of books for context
            const booksForContext = availableBooks.slice(0, 100).map(book => {
                const tags = book.tags ? book.tags.filter(t =>
                    !['seriously great writing', 'rather short', 'rather long'].includes(t.toLowerCase())
                ).join(', ') : '';
                return `- "${book.title}" by ${book.author}${tags ? ` (${tags})` : ''}${book.goodreadsRating ? ` - ${book.goodreadsRating}/5 on Goodreads` : ''}
  Borrow: ${book.borrowUrl || 'N/A'}`;
            }).join('\n');
            booksContext = `\n\nAvailable Books:\n${booksForContext}`;
        }

        const fullSystemPrompt = SYSTEM_PROMPT + booksContext;

        // Call Claude API
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: fullSystemPrompt,
            messages: messages
        });

        // Extract the text response
        const assistantMessage = response.content[0].type === 'text'
            ? response.content[0].text
            : '';

        res.json({
            message: assistantMessage,
            role: 'assistant'
        });

    } catch (error) {
        console.error('Chat API error:', error);

        if (error.status === 401) {
            return res.status(401).json({
                error: 'Invalid API key. Please set ANTHROPIC_API_KEY environment variable.'
            });
        }

        res.status(500).json({
            error: 'Failed to get response from Claude. Please try again.'
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Make sure ANTHROPIC_API_KEY is set in your environment');

    // Check if availability data needs refreshing
    checkAndRefreshAvailability();
});
