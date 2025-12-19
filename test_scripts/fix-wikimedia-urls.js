// Fix WikiMedia URLs - convert thumb URLs to direct URLs
const fs = require('fs');

const libraryPath = './data/greek-images.json';
const library = JSON.parse(fs.readFileSync(libraryPath, 'utf-8'));

let fixed = 0;

for (const [category, images] of Object.entries(library.collections)) {
  for (const img of images) {
    const oldUrl = img.cdn_url;

    // Convert thumb URL to direct URL
    // From: https://upload.wikimedia.org/wikipedia/commons/thumb/X/YZ/File.jpg/WIDTHpx-File.jpg
    // To: https://upload.wikimedia.org/wikipedia/commons/X/YZ/File.jpg

    if (oldUrl.includes('/thumb/')) {
      const parts = oldUrl.split('/thumb/');
      if (parts.length === 2) {
        const pathPart = parts[1]; // e.g., "d/da/The_Parthenon_in_Athens.jpg/1280px-The_Parthenon_in_Athens.jpg"
        const pathSegments = pathPart.split('/');

        if (pathSegments.length >= 3) {
          // Extract: hash1/hash2/filename.ext
          const hash1 = pathSegments[0];
          const hash2 = pathSegments[1];
          const filename = pathSegments[2];

          // Build direct URL
          const newUrl = `https://upload.wikimedia.org/wikipedia/commons/${hash1}/${hash2}/${filename}`;

          img.cdn_url = newUrl;
          fixed++;

          console.log(`✅ Fixed: ${img.id}`);
          console.log(`   Old: ${oldUrl}`);
          console.log(`   New: ${newUrl}\n`);
        }
      }
    }
  }
}

// Save fixed library
fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2));

console.log(`\n📊 Fixed ${fixed} URLs`);
console.log(`✅ Saved to ${libraryPath}`);
