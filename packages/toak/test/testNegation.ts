import { isMatch } from '../src/globMatcher';

console.log('Testing negation patterns:');
console.log('isMatch("test.js", ["*.js", "!test.js"]):', isMatch('test.js', ['*.js', '!test.js']));
console.log('Expected: false');

console.log(
  '\nisMatch("other.js", ["*.js", "!test.js"]):',
  isMatch('other.js', ['*.js', '!test.js'])
);
console.log('Expected: true');

console.log(
  '\nisMatch("node_modules/test.js", ["**/*.js", "!**/node_modules/**"]):',
  isMatch('node_modules/test.js', ['**/*.js', '!**/node_modules/**'])
);
console.log('Expected: false');
