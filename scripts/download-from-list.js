/**
 * Download real images from curated working URLs
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Load curated URLs
const urlListPath = path.join(__dirname, '..', 'data', 'greek-images-working-urls.json');
const urlList = JSON.parse(fs.readFileSync(urlListPath, 'utf8'));

// Output directory
const outputDir = path.join(__dirname, '..', 'public', 'images', 'greek');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Download a single image with redirects
function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const outputPath = path.join(outputDir, filename);

    console.log(`⬇️  ${filename.padEnd(35)} from ${url.substring(0, 60)}...`);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    const file = fs.createWriteStream(outputPath);

    const makeRequest = (requestUrl) => {
      const reqParsedUrl = new URL(requestUrl);
      const reqProtocol = reqParsedUrl.protocol === 'https:' ? https : http;

      reqProtocol.get(requestUrl, options, (response) => {
        // Follow redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          return makeRequest(response.headers.location);
        }

        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          return reject(new Error(`HTTP ${response.statusCode}`));
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`   ✅ Downloaded successfully`);
          resolve(outputPath);
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        reject(err);
      });
    };

    makeRequest(url);
  });
}

// Get file extension from URL or default to jpg
function getExtension(url) {
  const match = url.match(/\.(jpe?g|png|svg|gif)(?:\?|$)/i);
  return match ? match[1].toLowerCase() : 'jpg';
}

// Download all images
async function downloadAll() {
  let downloaded = 0;
  let failed = 0;
  const total = urlList.images.length;

  console.log('📥 Downloading real Greek Civilization images...');
  console.log(`📋 ${total} images to download\n`);

  for (const imageInfo of urlList.images) {
    const ext = getExtension(imageInfo.url);
    const filename = `${imageInfo.id}.${ext}`;

    try {
      await downloadImage(imageInfo.url, filename);
      downloaded++;
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}`);
      failed++;
    }

    // Small delay to avoid hammering the server
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  console.log('\n' + '='.repeat(70));
  console.log(`✅ Downloaded: ${downloaded}/${total}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}/${total}`);
  }
  console.log(`📂 Output: ${outputDir}`);
  console.log('='.repeat(70));
  console.log('\n💡 Next step: Run "node scripts/create-hybrid-library.js" to update the library');
}

downloadAll().catch(console.error);
