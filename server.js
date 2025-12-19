const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // Ensure node-fetch v2 is installed for CommonJS
const { exec } = require('child_process');
require('dotenv').config(); // Load secrets from .env

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// Middleware
app.use(express.json({ limit: '50mb' })); // Increased limit for images
app.use(express.static(__dirname)); // Serve static files (HTML, CSS, JS)

// ==========================================
// DATA & SETTINGS HELPERS
// ==========================================
function readJSON(file) {
    try {
        if (!fs.existsSync(file)) return {};
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        console.error(`Error reading ${file}:`, err);
        return {};
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`Error writing ${file}:`, err);
        return false;
    }
}

// Helper to get merged data (DB + Settings)
function getFullData() {
    const db = readJSON(DB_FILE);
    const settings = readJSON(SETTINGS_FILE);

    // Ensure defaults
    if (!db.posts) db.posts = [];
    if (!db.usedImages) db.usedImages = [];

    // Merge: "settings" key in API response comes from settings.json
    // AND secrets (masked) from .env if needed, but we don't send secrets to client.

    return {
        posts: db.posts,
        usedImages: db.usedImages,
        settings: {
            ...settings,
            hasApiKey: !!process.env.OPENAI_API_KEY, // Tell client we have a key
            hasWebhook: !!process.env.WEBHOOK_URL
        }
    };
}

// ==========================================
// API ENDPOINTS
// ==========================================

// Get all data
app.get('/api/data', (req, res) => {
    res.json(getFullData());
});

// Save all data
// We need to split what goes to db.json and what goes to settings.json
app.post('/api/data', (req, res) => {
    const { posts, usedImages, settings } = req.body;

    // 1. Save DB (Posts & Images)
    const dbSuccess = writeJSON(DB_FILE, { posts, usedImages });

    // 2. Save Settings (Only specific fields)
    let settingsSuccess = true;
    if (settings) {
        // Filter out read-only or secret flags
        const cleanSettings = {
            instagramAccount: settings.instagramAccount,
            frequency: settings.frequency,
            timeStart: settings.timeStart,
            timeEnd: settings.timeEnd,
            defaultTone: settings.defaultTone
        };
        settingsSuccess = writeJSON(SETTINGS_FILE, cleanSettings);
    }

    if (dbSuccess && settingsSuccess) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// PROXY: Generate Text (Client sends prompt, Server puts API Key)
app.post('/api/generate-text', async (req, res) => {
    const { prompt, imageUrl } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Clé API non configurée sur le serveur (.env)' });
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "image_url", image_url: { url: imageUrl } }
                        ]
                    }
                ],
                max_tokens: 1000
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'OpenAI Error');

        res.json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SHARED PUBLISH LOGIC
// ==========================================
async function publishPostLogic(post, db) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) throw new Error('Webhook URL not configured on server.');

    const payload = {
        id: post.id,
        text: post.text,
        status: 'published_by_server',
        scheduled_date: post.scheduledDate,
        image_name: post.imageName,
        image_data: post.imageData.includes(',') ? post.imageData.split(',')[1] : post.imageData,
        tone_used: post.tone
    };

    console.log(`Sending to Webhook: ${webhookUrl.substring(0, 20)}...`);

    // Debug: Log payload size and snippet
    console.log(`Payload size: ${JSON.stringify(payload).length} bytes`);
    console.log(`Image Snippet (Start): ${payload.image_data.substring(0, 50)}...`);

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log(`Webhook Response Status: ${response.status}`);
    console.log(`Webhook Response Body: ${responseText}`);

    if (!response.ok) throw new Error(`Webhook failed: ${response.status} - ${responseText}`);

    // Success: Update post local status
    post.status = 'published';
    if (!db.usedImages) db.usedImages = [];
    if (!db.usedImages.includes(post.imageName)) db.usedImages.push(post.imageName);

    return true;
}

// Manual Publish Endpoint
app.post('/api/publish/:id', async (req, res) => {
    const postId = parseInt(req.params.id);
    const db = readJSON(DB_FILE);
    const post = db.posts.find(p => p.id === postId);

    if (!post) {
        return res.status(404).json({ error: 'Post not found' });
    }

    try {
        console.log(`Manual publish requested for Post ID ${postId}...`);
        await publishPostLogic(post, db);
        writeJSON(DB_FILE, db); // Save updated status
        res.json({ success: true });
    } catch (error) {
        console.error('Manual Publish Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// AUTOMATION CRON (Run every minute)
// ==========================================
setInterval(async () => {
    // console.log('--- Cron Check ---'); 
    const db = readJSON(DB_FILE); // Always reload DB to get latest status
    const now = new Date();

    const postsToPublish = db.posts.filter(post => {
        return post.status === 'scheduled' && new Date(post.scheduledDate) <= now;
    });

    if (postsToPublish.length === 0) return;

    console.log(`Found ${postsToPublish.length} posts to publish via Cron.`);
    let dbChanged = false;

    for (const post of postsToPublish) {
        try {
            console.log(`Cron Publishing post ID ${post.id}...`);
            await publishPostLogic(post, db);
            dbChanged = true;
        } catch (err) {
            console.error('Automation Error:', err);
        }
    }

    if (dbChanged) {
        writeJSON(DB_FILE, db);
        console.log('Database updated by Cron.');
    }
}, 60000); // Check every 60 seconds

// ==========================================
// AUTO-UPDATE SYSTEM (Zero Touch)
// ==========================================
setInterval(() => {
    // console.log('Checking for updates...');
    exec('git pull', (error, stdout, stderr) => {
        if (error) {
            console.error('Auto-Update Error:', error);
            return;
        }

        // Check if there are changes
        if (stdout.includes('Already up to date.')) {
            // Nothing to do
            return;
        }

        console.log('Update detected! Applying changes...');
        console.log(stdout);

        // If "package.json" changed, we might need npm install, 
        // but for simplicity, we just restart. 

        // Graceful Restart (Let PM2 handle the reboot)
        console.log('Restarting server to apply updates...');
        process.exit(0);
    });
}, 300000); // Check every 5 minutes (300,000 ms)

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Secrets loaded from .env');
    console.log('Auto-Update active (Every 5 min)');
});
