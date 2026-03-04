import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import readline from 'readline';

const apiKey = process.env.API_KEY;

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) =>
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        })
    );
}

async function downloadImage(url, filename) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);

    const dir = './downloads'; // Changed folder name to a generic 'downloads'
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    const dest = path.join(dir, filename);
    const fileStream = fs.createWriteStream(dest);

    await pipeline(response.body, fileStream);
}

async function run() {
    // 1. Simple URL Input
    const targetUrl = await askQuestion("Paste the URL you want to scrape: ");
    
    if (!targetUrl.startsWith('http')) {
        console.error("Please enter a valid URL starting with http:// or https://");
        return;
    }

    console.log(`\n--- 🚀 Starting Extraction for: ${targetUrl} ---`);

    // 2. Start API Extraction
    const createRes = await fetch('https://api.extract.pics/v0/extractions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: targetUrl,
            mode: "basic",
            ignoreInlineImages: true
        }),
    });

    const json = await createRes.json();
    if (!json.data) {
        console.error(`API Error:`, json);
        return;
    }
    
    const id = json.data.id;
    let status = 'pending';
    let apiData = null;

    // 3. Wait for API to finish
    while (status !== 'done' && status !== 'error') {
        const res = await fetch(`https://api.extract.pics/v0/extractions/${id}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        const statusJson = await res.json();
        if (statusJson.data) {
            apiData = statusJson.data;
            status = apiData.status;
        }

        if (status !== 'done' && status !== 'error') {
            process.stdout.write("."); 
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }

    const images = apiData?.images || [];

    // 4. Download Everything Found
    if (images && images.length > 0) {
        console.log(`\n✅ Found ${images.length} images. Starting download...`);

        for (let i = 0; i < images.length; i++) {
            const imgUrl = images[i].url;
            
            // Generate a clean filename
            const ext = path.extname(imgUrl).split('?')[0] || '.jpg';
            const filename = `image_${Date.now()}_${i}${ext}`;

            try {
                await downloadImage(imgUrl, filename);
                console.log(`Saved: ${filename}`);
            } catch (err) {
                console.error(`Failed to download image ${i}:`, err.message);
            }
        }
    } else {
        console.log("\nNo images were found on this page.");
    }

    console.log('\n✨ Task complete!');
}

run().catch(console.error);