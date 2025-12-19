/**
 * Update image library to use local SVG images instead of external URLs
 */

const fs = require('fs');
const path = require('path');

// Load original image library
const libraryPath = path.join(__dirname, '..', 'data', 'greek-images.json');
const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

// Create updated library with local paths
const updatedLibrary = {
  collections: {}
};

for (const [categoryName, images] of Object.entries(library.collections)) {
  updatedLibrary.collections[categoryName] = images.map(img => ({
    ...img,
    cdn_url: `/images/greek/${img.id}.svg`,  // Local path served by frontend server
    original_url: img.cdn_url  // Keep original for reference
  }));
}

// Save as new file
const outputPath = path.join(__dirname, '..', 'data', 'greek-images-local.json');
fs.writeFileSync(outputPath, JSON.stringify(updatedLibrary, null, 2), 'utf8');

console.log('✅ Updated image library with local paths');
console.log(`📄 Output: ${outputPath}`);
console.log(`\n🔄 Updated ${Object.values(updatedLibrary.collections).flat().length} images to use local SVG files`);
