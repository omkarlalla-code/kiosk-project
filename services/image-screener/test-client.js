/**
 * Test client for Image Screener service
 * Usage: node test-client.js
 */

const axios = require('axios');

const IMAGE_SCREENER_URL = 'http://localhost:3001';

const testImages = [
  {
    id: 'parthenon',
    cdn_url: 'https://images.unsplash.com/photo-1555993539-1732b0258235?w=1920&h=1080&fit=crop'
  },
  {
    id: 'acropolis',
    cdn_url: 'https://images.unsplash.com/photo-1603565816030-6b389eeb23cb?w=1920&h=1080&fit=crop'
  },
  {
    id: 'greek_statue',
    cdn_url: 'https://images.unsplash.com/photo-1578926078055-e96aa0d81f2a?w=1920&h=1080&fit=crop'
  }
];

async function testHealth() {
  console.log('\n🏥 Testing health endpoint...');
  try {
    const response = await axios.get(`${IMAGE_SCREENER_URL}/health`);
    console.log('✅ Health check:', response.data);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
  }
}

async function testSinglePreload() {
  console.log('\n📥 Testing single preload...');
  try {
    const image = testImages[0];
    console.log(`Preloading: ${image.id}`);

    const response = await axios.post(`${IMAGE_SCREENER_URL}/preload`, {
      id: image.id,
      cdn_url: image.cdn_url,
      resize: false
    });

    console.log('✅ Preload response:', response.data);
  } catch (error) {
    console.error('❌ Preload failed:', error.message);
  }
}

async function testBatchPreload() {
  console.log('\n📦 Testing batch preload...');
  try {
    console.log(`Batch preloading ${testImages.length} images`);

    const response = await axios.post(`${IMAGE_SCREENER_URL}/batch_preload`, {
      images: testImages.map(img => ({
        id: img.id,
        cdn_url: img.cdn_url,
        resize: false
      }))
    });

    console.log('✅ Batch preload response:', response.data);
  } catch (error) {
    console.error('❌ Batch preload failed:', error.message);
  }
}

async function testReadyCheck() {
  console.log('\n✅ Testing ready check...');
  try {
    const image = testImages[0];
    const response = await axios.get(`${IMAGE_SCREENER_URL}/ready/${image.id}`);
    console.log(`Status for ${image.id}:`, response.data);
  } catch (error) {
    console.error('❌ Ready check failed:', error.message);
  }
}

async function testCacheStats() {
  console.log('\n📊 Testing cache stats...');
  try {
    const response = await axios.get(`${IMAGE_SCREENER_URL}/cache/stats`);
    console.log('Cache statistics:', response.data);
  } catch (error) {
    console.error('❌ Cache stats failed:', error.message);
  }
}

async function testCacheClear() {
  console.log('\n🗑️  Testing cache clear...');
  try {
    const response = await axios.delete(`${IMAGE_SCREENER_URL}/cache`);
    console.log('Cache cleared:', response.data);
  } catch (error) {
    console.error('❌ Cache clear failed:', error.message);
  }
}

async function runTests() {
  console.log('🧪 Image Screener Service Test Suite\n');

  await testHealth();
  await testSinglePreload();
  await testReadyCheck();
  await testBatchPreload();
  await testCacheStats();
  await testCacheClear();
  await testCacheStats();

  console.log('\n✅ All tests completed!\n');
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
