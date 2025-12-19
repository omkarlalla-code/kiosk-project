/**
 * Download REAL images from Wikimedia Commons
 * Saves them locally so they actually work
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Load original image library with real Wikimedia URLs
const libraryPath = path.join(__dirname, '..', 'data', 'greek-images.json');
const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

// Output directory
const outputDir = path.join(__dirname, '..', 'public', 'images', 'greek');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Download a single image
function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const outputPath = path.join(outputDir, filename);

    console.log(`⬇️  Downloading: ${filename}`);

    const file = fs.createWriteStream(outputPath);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    protocol.get(url, options, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(outputPath);
        return downloadImage(response.headers.location, filename)
          .then(resolve)
          .catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        return reject(new Error(`HTTP ${response.statusCode}: ${url}`));
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`   ✅ ${filename}`);
        resolve(outputPath);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      reject(err);
    });
  });
}

// Get file extension from URL
function getExtension(url) {
  const match = url.match(/\.([a-zA-Z]{3,4})(?:\?|$)/);
  return match ? match[1] : 'jpg';
}

// Main download function
async function downloadAllImages() {
  let downloaded = 0;
  let failed = 0;
  let total = 0;

  console.log('📥 Downloading REAL images from Wikimedia Commons...\n');

  for (const [categoryName, images] of Object.entries(library.collections)) {
    console.log(`\n📁 ${categoryName}:`);

    for (const imageData of images) {
      total++;
      const ext = getExtension(imageData.cdn_url);
      const filename = `${imageData.id}.${ext}`;

      try {
        await downloadImage(imageData.cdn_url, filename);
        downloaded++;

        // Small delay to avoid hammering the server
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.log(`   ❌ FAILED: ${filename} - ${error.message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`✅ Downloaded: ${downloaded}/${total}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}/${total}`);
  }
  console.log(`📂 Output directory: ${outputDir}`);
  console.log('='.repeat(50));
}

// Run the download
downloadAllImages().catch(console.error);
