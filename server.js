const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8080;

// Database setup
let db;

function connectDB() {
    db = new sqlite3.Database('./urls.db', (err) => {
        if (err) {
            console.error('Error connecting to SQLite database:', err.message);
            process.exit(1);
        }
        console.log('Connected to SQLite database');
        
        // Create table if not exists
        db.run(`CREATE TABLE IF NOT EXISTS urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            long_url TEXT NOT NULL UNIQUE,
            short_url TEXT UNIQUE
        )`, (err) => {
            if (err) {
                console.error('Error creating table:', err.message);
            }
        });
    });
}

// URL encoding function (same logic as Go getShorty)
const charset = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function getShorty(id) {
    if (id === 0) {
        return "0";
    }
    let encoded = "";
    const base = charset.length;
    while (id > 0) {
        const remainder = id % base;
        encoded = charset[remainder] + encoded;
        id = Math.floor(id / base);
    }
    return encoded;
}

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('static'));

// Submit handler - creates short URLs
app.post('/submit', (req, res) => {
    const longURL = req.body.longurl;
    
    if (!longURL) {
        return res.status(400).send('Long URL is required');
    }

    // Check if URL already exists
    db.get('SELECT * FROM urls WHERE long_url = ?', [longURL], (err, row) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }

        if (row) {
            // URL already exists, return existing short URL
            const displayURL = `http://localhost:${PORT}/${row.short_url}`;
            renderResult(res, longURL, displayURL);
        } else {
            // Create new entry
            db.run('INSERT INTO urls (long_url) VALUES (?)', [longURL], function(err) {
                if (err) {
                    console.error('DB create error:', err.message);
                    return res.status(500).send('Failed to save new URL');
                }

                const newID = this.lastID;
                const shortURL = getShorty(newID);

                // Update the entry with short URL
                db.run('UPDATE urls SET short_url = ? WHERE id = ?', [shortURL, newID], (err) => {
                    if (err) {
                        console.error('DB update error:', err.message);
                        return res.status(500).send('Failed to save short URL');
                    }

                    const displayURL = `http://localhost:${PORT}/${shortURL}`;
                    renderResult(res, longURL, displayURL);
                });
            });
        }
    });
});

// Redirect handler - redirects short URLs to long URLs
app.get('/:shortURL', (req, res) => {
    const shortID = req.params.shortURL;
    
    // Handle favicon requests
    if (shortID === 'favicon.ico') {
        return res.status(204).end();
    }

    db.get('SELECT * FROM urls WHERE short_url = ?', [shortID], (err, row) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).send('Database error');
        }

        if (!row) {
            return res.status(404).send('Short URL not found');
        }

        res.redirect(302, row.long_url);
    });
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// Function to render result template
function renderResult(res, longURL, shortURL) {
    const templatePath = path.join(__dirname, 'result.html');
    
    fs.readFile(templatePath, 'utf8', (err, template) => {
        if (err) {
            console.error('Template read error:', err.message);
            return res.status(500).send('Failed to render result');
        }

        const html = template
            .replace('{{.LongURL}}', longURL)
            .replace('{{.ShortURL}}', shortURL);
        
        res.send(html);
    });
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down gracefully...');
    if (db) {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

// Start server
connectDB();

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} to use the URL shortener`);
});