/**
 * Generate local SVG placeholder images for Greek Civilization kiosk
 * Creates beautiful, category-themed placeholder images
 */

const fs = require('fs');
const path = require('path');

// Load image library
const libraryPath = path.join(__dirname, '..', 'data', 'greek-images.json');
const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));

// Output directory
const outputDir = path.join(__dirname, '..', 'public', 'images', 'greek');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Category color themes
const categoryThemes = {
  'architecture_temples': { bg: '#4A5568', accent: '#E6FFFA', icon: '🏛️', gradient: '#2D3748' },
  'architecture_theaters': { bg: '#744210', accent: '#FED7AA', icon: '🎭', gradient: '#5F370E' },
  'architecture_public': { bg: '#2C5282', accent: '#BEE3F8', icon: '🏛️', gradient: '#1E3A5F' },
  'sculpture_classical': { bg: '#718096', accent: '#F7FAFC', icon: '🗿', gradient: '#4A5568' },
  'sculpture_female': { bg: '#805AD5', accent: '#FAF5FF', icon: '👤', gradient: '#6B46C1' },
  'sculpture_male': { bg: '#553C9A', accent: '#E9D8FD', icon: '👤', gradient: '#44337A' },
  'pottery': { bg: '#C05621', accent: '#FFFAF0', icon: '🏺', gradient: '#9C4221' },
  'daily_life': { bg: '#DD6B20', accent: '#FFFAF0', icon: '🏛️', gradient: '#C05621' },
  'gods_major': { bg: '#805AD5', accent: '#FAF5FF', icon: '⚡', gradient: '#6B46C1' },
  'gods_minor': { bg: '#9F7AEA', accent: '#FAF5FF', icon: '✨', gradient: '#805AD5' },
  'philosophy': { bg: '#2D3748', accent: '#E2E8F0', icon: '📜', gradient: '#1A202C' },
  'warfare': { bg: '#742A2A', accent: '#FED7D7', icon: '⚔️', gradient: '#63171B' },
  'ships': { bg: '#2C5282', accent: '#BEE3F8', icon: '⛵', gradient: '#1E3A5F' },
  'default': { bg: '#4A5568', accent: '#E2E8F0', icon: '🏛️', gradient: '#2D3748' }
};

// Get theme for category
function getTheme(category) {
  const mainCategory = Object.keys(categoryThemes).find(cat =>
    category.toLowerCase().includes(cat)
  );
  return categoryThemes[mainCategory] || categoryThemes.default;
}

// Format title for display
function formatTitle(title) {
  return title.replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Generate SVG for an image
function generateSVG(imageData) {
  const theme = getTheme(imageData.category);
  const displayTitle = formatTitle(imageData.title);
  const displayCategory = imageData.category.replace(/_/g, ' ').toUpperCase();
  const era = imageData.era || '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="grad-${imageData.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.bg};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${theme.gradient};stop-opacity:1" />
    </linearGradient>
    <pattern id="pattern-${imageData.id}" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="40" height="40" fill="none"/>
      <circle cx="20" cy="20" r="1" fill="${theme.accent}" opacity="0.1"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect fill="url(#grad-${imageData.id})" width="1200" height="800"/>
  <rect fill="url(#pattern-${imageData.id})" width="1200" height="800"/>

  <!-- Icon -->
  <text x="50%" y="35%" fill="${theme.accent}" font-size="120" text-anchor="middle" opacity="0.4">
    ${theme.icon}
  </text>

  <!-- Title -->
  <text x="50%" y="50%" fill="white" font-size="48" text-anchor="middle" font-family="Georgia, serif" font-weight="bold" opacity="0.95">
    ${displayTitle.length > 40 ? displayTitle.substring(0, 37) + '...' : displayTitle}
  </text>

  <!-- Category -->
  <text x="50%" y="58%" fill="${theme.accent}" font-size="20" text-anchor="middle" font-family="Arial, sans-serif" opacity="0.7" letter-spacing="2">
    ${displayCategory}
  </text>

  <!-- Era -->
  ${era ? `<text x="50%" y="65%" fill="${theme.accent}" font-size="18" text-anchor="middle" font-family="Arial, sans-serif" opacity="0.5" font-style="italic">
    ${era}
  </text>` : ''}

  <!-- Decorative border -->
  <rect x="40" y="40" width="1120" height="720" fill="none" stroke="${theme.accent}" stroke-width="2" opacity="0.2" rx="10"/>
  <rect x="50" y="50" width="1100" height="700" fill="none" stroke="${theme.accent}" stroke-width="1" opacity="0.1" rx="8"/>
</svg>`;
}

// Generate all images
let generated = 0;
let total = 0;

console.log('🎨 Generating local Greek Civilization images...\n');

for (const [categoryName, images] of Object.entries(library.collections)) {
  console.log(`📁 ${categoryName}:`);

  for (const imageData of images) {
    total++;
    const svg = generateSVG(imageData);
    const outputPath = path.join(outputDir, `${imageData.id}.svg`);

    fs.writeFileSync(outputPath, svg, 'utf8');
    generated++;

    console.log(`  ✅ ${imageData.id}.svg`);
  }
  console.log('');
}

console.log(`\n✅ Generated ${generated}/${total} images`);
console.log(`📂 Output directory: ${outputDir}`);
console.log('\n🎉 Done! Images are ready to use.');
