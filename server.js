const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Ensure node-fetch v2 is installed for CommonJS

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

// Middleware
app.use(express.json({ limit: '50mb' })); // Increased limit for images
app.use(express.static(__dirname)); // Serve static files (HTML, CSS, JS)

// ==========================================
// DATABASE HELPERS
// ==========================================
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            // Default structure
            return { posts: [], settings: {}, usedImages: [] };
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading DB:', err);
        return { posts: [], settings: {}, usedImages: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error('Error writing DB:', err);
        return false;
    }
}

// ==========================================
// API ENDPOINTS
// ==========================================

// Get all data
app.get('/api/data', (req, res) => {
    const data = readDB();
    res.json(data);
});

// Save all data
app.post('/api/data', (req, res) => {
    const success = writeDB(req.body);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// ==========================================
// AUTOMATION CRON (Run every minute)
// ==========================================
setInterval(async () => {
    console.log('--- Cron Check ---', new Date().toLocaleTimeString());
    const db = readDB();
    const now = new Date();

    // Filter posts that need publishing
    const postsToPublish = db.posts.filter(post => {
        return post.status === 'scheduled' && new Date(post.scheduledDate) <= now;
    });

    if (postsToPublish.length === 0) return;

    console.log(`Found ${postsToPublish.length} posts to publish.`);

    let dbChanged = false;

    for (const post of postsToPublish) {
        try {
            console.log(`Publishing post ID ${post.id}...`);

            // 1. Send to Webhook
            if (db.settings.webhookUrl) {
                // Prepare payload (same logic as client-side)
                const payload = {
                    id: post.id,
                    text: post.text,
                    status: 'published_by_server',
                    scheduled_date: post.scheduledDate,
                    image_name: post.imageName,
                    // Handle base64: remove prefix if exists
                    image_data: post.imageData.includes(',') ? post.imageData.split(',')[1] : post.imageData,
                    tone_used: post.tone
                };

                const response = await fetch(db.settings.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    console.log(`Post ${post.id}: Webhook success.`);
                    post.status = 'published';
                    dbChanged = true;

                    // Mark image as used
                    if (!db.usedImages.includes(post.imageName)) {
                        db.usedImages.push(post.imageName);
                    }
                } else {
                    console.error(`Post ${post.id}: Webhook failed ${response.status}`);
                    // Optional: Add error log to post?
                }
            } else {
                console.warn(`Post ${post.id}: No webhook URL configured. Marking published anyway locally.`);
                post.status = 'published';
                dbChanged = true;
            }

        } catch (err) {
            console.error(`Error publishing post ${post.id}:`, err);
        }
    }

    if (dbChanged) {
        writeDB(db);
        console.log('Database updated after automation.');
    }
}, 60000); // Check every 60 seconds

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Automation active - checking scheduled posts every minute.');
});
