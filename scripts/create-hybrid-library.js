/**
 * Create hybrid library using:
 * - Real downloaded JPGs where available
 * - SVG placeholders for everything else
 */

const fs = require('fs');
const path = require('path');

const libraryPath = path.join(__dirname, '..', 'data', 'greek-images.json');
const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

const imagesDir = path.join(__dirname, '..', 'public', 'images', 'greek');

// Get list of successfully downloaded images
const downloadedFiles = fs.readdirSync(imagesDir);
const downloadedIds = new Set();

for (const file of downloadedFiles) {
  const id = file.replace(/\.(jpg|svg|png)$/, '');
  if (file.endsWith('.jpg')) {
    downloadedIds.add(id);
  }
}

console.log(`Found ${downloadedIds.size} real downloaded images`);
console.log('Real images:', Array.from(downloadedIds).join(', '));

// Create hybrid library
const hybridLibrary = {
  collections: {}
};

let realCount = 0;
let svgCount = 0;

for (const [categoryName, images] of Object.entries(library.collections)) {
  hybridLibrary.collections[categoryName] = images.map(img => {
    const hasRealImage = downloadedIds.has(img.id);

    if (hasRealImage) {
      realCount++;
      return {
        ...img,
        cdn_url: `/images/greek/${img.id}.jpg`,
        image_type: 'photo',
        original_url: img.cdn_url
      };
    } else {
      svgCount++;
      return {
        ...img,
        cdn_url: `/images/greek/${img.id}.svg`,
        image_type: 'svg_placeholder',
        original_url: img.cdn_url
      };
    }
  });
}

// Save hybrid library
const outputPath = path.join(__dirname, '..', 'data', 'greek-images-local.json');
fs.writeFileSync(outputPath, JSON.stringify(hybridLibrary, null, 2), 'utf8');

console.log(`\n✅ Created hybrid library:`);
console.log(`   📸 Real photos: ${realCount}`);
console.log(`   🎨 SVG placeholders: ${svgCount}`);
console.log(`   📄 Output: ${outputPath}`);
