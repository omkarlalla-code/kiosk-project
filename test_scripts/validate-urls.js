// Validate WikiMedia image URLs
const fs = require('fs');
const https = require('https');

const libraryPath = './data/greek-images.json';
const library = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'));

let totalImages = 0;
let brokenUrls = [];
let validUrls = 0;

async function checkUrl(url, id, title) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        validUrls++;
        console.log(`✅ [${id}] ${title}`);
        resolve({ id, title, url, status: 'OK' });
      } else {
        brokenUrls.push({ id, title, url, status: res.statusCode });
        console.log(`❌ [${id}] ${title} - HTTP ${res.statusCode}`);
        resolve({ id, title, url, status: res.statusCode });
      }
    }).on('error', (err) => {
      brokenUrls.push({ id, title, url, error: err.message });
      console.log(`❌ [${id}] ${title} - ${err.message}`);
      resolve({ id, title, url, error: err.message });
    });
  });
}

async function validateAll() {
  const checks = [];

  for (const [category, images] of Object.entries(library.collections)) {
    for (const img of images) {
      totalImages++;
      checks.push(checkUrl(img.cdn_url, img.id, img.title));
    }
  }

  await Promise.all(checks);

  console.log(`\n📊 Results:`);
  console.log(`   Total images: ${totalImages}`);
  console.log(`   ✅ Valid: ${validUrls}`);
  console.log(`   ❌ Broken: ${brokenUrls.length}`);

  if (brokenUrls.length > 0) {
    console.log(`\n🔴 Broken URLs:`);
    brokenUrls.forEach(({ id, title, url, status, error }) => {
      console.log(`\n   ID: ${id}`);
      console.log(`   Title: ${title}`);
      console.log(`   URL: ${url}`);
      console.log(`   Error: ${error || `HTTP ${status}`}`);
    });
  }
}

validateAll();
