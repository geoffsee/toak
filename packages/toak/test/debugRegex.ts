// Test to see what regex patterns are being generated

function makeRe(pattern: string): RegExp {
  // Normalize separators
  pattern = pattern.replace(/\\/g, '/');

  // Check if this is a basename-only pattern (no path separators)
  const isBasenamePattern = !pattern.includes('/');

  // Build regex string
  let reStr = '';
  let inGroup = false;
  let inClass = false;

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    const next = pattern[i + 1];

    // Character classes
    if (!inClass && c === '[') {
      inClass = true;
      reStr += c;
      continue;
    }
    if (inClass && c === ']') {
      inClass = false;
      reStr += c;
      continue;
    }
    if (inClass) {
      reStr += c;
      continue;
    }

    switch (c) {
      case '/':
        reStr += '\\/';
        break;

      case '*':
        if (next === '*') {
          // Globstar
          const nextNext = pattern[i + 2];
          if (nextNext === '/') {
            // **/ - match zero or more path segments
            reStr += '(?:.*\\/)?';
            i += 2;
          } else if (nextNext === undefined) {
            // ** at end - match everything
            reStr += '.*';
            i += 1;
          } else {
            // ** without / - treat as wildcard
            reStr += '.*';
            i += 1;
          }
        } else {
          // Single * - match anything except /
          reStr += '[^\\/]*';
        }
        break;

      case '?':
        // Match single character except /
        reStr += '[^\\/]';
        break;

      case '.':
        // Escape special regex chars
        reStr += '\\' + c;
        break;

      case '{':
        inGroup = true;
        reStr += '(?:';
        break;

      case '}':
        if (inGroup) {
          inGroup = false;
          reStr += ')';
        } else {
          reStr += '\\}';
        }
        break;

      case ',':
        if (inGroup) {
          reStr += '|';
        } else {
          reStr += '\\,';
        }
        break;

      default:
        reStr += c;
    }
  }

  console.log(`Pattern: ${pattern}`);
  console.log(`reStr after parsing: ${reStr}`);
  console.log(`isBasenamePattern: ${isBasenamePattern}`);

  // Build the final regex based on pattern type
  let finalRe = '';

  if (isBasenamePattern) {
    // Basename-only pattern - should only match files without path separators
    finalRe = '^' + reStr + '$';
  } else if (pattern.startsWith('**/')) {
    // Globstar at start - can match at any depth
    finalRe = '^(?:.*\\/)?';
    // Remove the (?:.*\\/)? we already added
    const index = reStr.indexOf('(?:.*\\/)?');
    console.log(`Index of (?:.*\\/)?: ${index}`);
    const afterGlobstar = reStr.substring(index + 10);
    console.log(`afterGlobstar: ${afterGlobstar}`);
    finalRe += afterGlobstar + '$';
  } else {
    // Pattern with path - match from start
    finalRe = '^' + reStr;
  }

  // Handle directory patterns
  if (pattern.endsWith('/')) {
    // Directory pattern - match dir and contents
    if (!finalRe.endsWith('$')) {
      finalRe += '(?:\\/.*)?$';
    } else {
      finalRe = finalRe.slice(0, -1) + '(?:\\/.*)?$';
    }
  } else if (!finalRe.endsWith('$')) {
    finalRe += '$';
  }

  console.log(`Final regex: ${finalRe}`);
  const re = new RegExp(finalRe);
  console.log(`RegExp object: ${re}`);
  console.log('');

  return re;
}

// Test the patterns that are failing
console.log('=== **/*.js ===');
const re1 = makeRe('**/*.js');
console.log('Test src/components/Button.js:', re1.test('src/components/Button.js'));
console.log('Test Button.js:', re1.test('Button.js'));

console.log('\n=== **/node_modules/ ===');
const re2 = makeRe('**/node_modules/');
console.log('Test node_modules/package/index.js:', re2.test('node_modules/package/index.js'));
console.log('Test src/node_modules/test.js:', re2.test('src/node_modules/test.js'));

console.log('\n=== tes?.js ===');
const re3 = makeRe('tes?.js');
console.log('Test test.js:', re3.test('test.js'));
console.log('Test text.js:', re3.test('text.js'));
