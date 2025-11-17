// Direct regex test
const pattern1 = /^(?:.*\/)?node_modules\/(?:\/.*)?$/;

console.log('Testing:', pattern1);
console.log('node_modules/package/index.js:', pattern1.test('node_modules/package/index.js'));
console.log('src/node_modules/test.js:', pattern1.test('src/node_modules/test.js'));
console.log('node_modules/:', pattern1.test('node_modules/'));

// Simpler test
const pattern2 = /^(?:.*\/)?node_modules\//;
console.log('\nSimpler pattern (no end):', pattern2);
console.log('node_modules/package/index.js:', pattern2.test('node_modules/package/index.js'));
console.log('src/node_modules/test.js:', pattern2.test('src/node_modules/test.js'));

// Even simpler
const pattern3 = /node_modules\//;
console.log('\nEven simpler (no anchors):', pattern3);
console.log('node_modules/package/index.js:', pattern3.test('node_modules/package/index.js'));
console.log('src/node_modules/test.js:', pattern3.test('src/node_modules/test.js'));
