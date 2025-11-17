// @ts-ignore - for debugging
import globMatcher from '../src/globMatcher';

// Access the internal function for debugging
const globToRegex = (globMatcher as any).globToRegex || (() => {
  // Fallback if we can't access internal
  return { source: 'N/A', flags: '' };
});

// Debug function to show what's happening
function testPattern(file: string, pattern: string, expected: boolean) {
  const result = globMatcher.isMatch(file, pattern);
  const symbol = result === expected ? '✓' : '✗';

  // Try to get regex for debugging
  let regexStr = 'N/A';
  try {
    // We'll need to export globToRegex for this to work
    // For now, just show the result
  } catch (e) {}

  console.log(`${symbol} isMatch('${file}', '${pattern}') = ${result} (expected ${expected})`);
  return result === expected;
}

console.log('=== Testing Basic Wildcards ===');
testPattern('test.js', '*.js', true);
testPattern('test.ts', '*.js', false);
testPattern('src/test.js', '*.js', false);  // Should NOT match - *.js is basename only
testPattern('test.config.js', '*.config.js', true);

console.log('\n=== Testing ** Patterns ===');
testPattern('src/components/Button.js', '**/*.js', true);
testPattern('Button.js', '**/*.js', true);
testPattern('src/deep/nested/file.js', '**/*.js', true);
testPattern('src/components/Button.ts', '**/*.js', false);

console.log('\n=== Testing Directory Patterns ===');
testPattern('node_modules/package/index.js', '**/node_modules/', true);
testPattern('src/node_modules/test.js', '**/node_modules/', true);
testPattern('node_modules_backup/test.js', '**/node_modules/', false);

console.log('\n=== Testing ? Wildcard ===');
testPattern('test.js', 'tes?.js', true);
testPattern('tesa.js', 'tes?.js', true); // Changed from text.js
testPattern('test.js', 'te??.js', true); // Changed from te.js
testPattern('testing.js', 'tes?.js', false);

console.log('\n=== Testing Brace Expansion ===');
testPattern('test.js', '*.{js,ts}', true);
testPattern('test.ts', '*.{js,ts}', true);
testPattern('test.jsx', '*.{js,ts}', false);