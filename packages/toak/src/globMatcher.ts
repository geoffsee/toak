/**
 * A lightweight glob pattern matcher that works with Node.js and Bun
 * Replaces micromatch dependency for basic glob pattern matching
 */

/**
 * Options for the isMatch function
 */
export interface MatchOptions {
  /** Whether to match dot files (files/directories starting with .) */
  dot?: boolean;
  /** Base directory for relative patterns */
  basename?: string;
  /** Whether to return on first match (optimization) */
  firstMatch?: boolean;
}

/**
 * Converts a glob pattern to a regular expression
 */
function makeRe(pattern: string, options: MatchOptions = {}): RegExp {
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
      case '(':
      case ')':
      case '+':
      case '|':
      case '^':
      case '$':
      case '@':
      case '%':
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

  // Build the final regex based on pattern type
  let finalRe = '';

  if (isBasenamePattern) {
    // Basename-only pattern - should only match files without path separators
    finalRe = '^' + reStr + '$';
  } else if (pattern.startsWith('**/')) {
    // Globstar at start - can match at any depth
    // The reStr already contains (?:.*\/)? from parsing **/
    // Just wrap it with anchors
    finalRe = '^' + reStr + '$';
  } else {
    // Pattern with path - match from start
    finalRe = '^' + reStr;
  }

  // Handle directory patterns
  if (pattern.endsWith('/')) {
    // Directory pattern - match dir and everything under it
    // The pattern already has \/ at the end from parsing, so just add optional content
    if (!finalRe.endsWith('$')) {
      finalRe += '(?:.*)?$';
    } else {
      finalRe = finalRe.slice(0, -1) + '(?:.*)?$';
    }
  } else if (!finalRe.endsWith('$')) {
    finalRe += '$';
  }

  // Handle dot files
  if (!options.dot && !pattern.includes('.*') && !pattern.includes('/.')) {
    // Exclude hidden files unless explicitly included
    const segments = pattern.split('/');
    const hasHiddenSegment = segments.some(s => s.startsWith('.'));
    if (!hasHiddenSegment) {
      // Add lookahead to exclude hidden files
      finalRe = '(?!(?:^|.*\\/)\\.(?!\\.\\/))' + finalRe;
    }
  }

  return new RegExp(finalRe, process.platform === 'win32' ? 'i' : '');
}

/**
 * Checks if a file path matches any of the given glob patterns
 * Compatible API with micromatch.isMatch
 *
 * @param filepath - The file path to test
 * @param patterns - A single pattern string or array of pattern strings
 * @param options - Options for matching behavior
 * @returns true if the file matches any pattern, false otherwise
 */
export function isMatch(
  filepath: string,
  patterns: string | string[],
  options: MatchOptions = {}
): boolean {
  // Normalize the input path
  if (!filepath) return false;
  filepath = filepath.replace(/\\/g, '/');

  // Remove leading ./
  if (filepath.startsWith('./')) {
    filepath = filepath.slice(2);
  }

  // Convert to array
  const patternList = Array.isArray(patterns) ? patterns : [patterns];

  let hasMatch = false;

  for (const pattern of patternList) {
    if (!pattern) continue;

    // Handle negation
    const isNegation = pattern.startsWith('!');
    const actualPattern = isNegation ? pattern.slice(1) : pattern;

    // For basename-only patterns (no /), only match files without path separators
    const normalizedPattern = actualPattern.replace(/\\/g, '/');
    const isBasenamePattern = !normalizedPattern.includes('/');

    // If pattern is basename-only and filepath has a /, it should NOT match
    if (isBasenamePattern && filepath.includes('/')) {
      continue; // Skip this pattern
    }

    // Create regex and test
    const re = makeRe(actualPattern, options);
    const matched = re.test(filepath);

    if (isNegation) {
      // If negation matches, return false immediately
      if (matched) return false;
    } else {
      // Track if any normal pattern matched
      if (matched) hasMatch = true;
    }
  }

  return hasMatch;
}

/**
 * Returns an array of files that match the given patterns
 *
 * @param files - Array of file paths to filter
 * @param patterns - A single pattern string or array of pattern strings
 * @param options - Options for matching behavior
 * @returns Array of files that match the patterns
 */
export function filter(
  files: string[],
  patterns: string | string[],
  options: MatchOptions = {}
): string[] {
  return files.filter(file => isMatch(file, patterns, options));
}

/**
 * Creates a matcher function for the given patterns
 *
 * @param patterns - A single pattern string or array of pattern strings
 * @param options - Options for matching behavior
 * @returns A function that tests if a file matches the patterns
 */
export function matcher(
  patterns: string | string[],
  options: MatchOptions = {}
): (filepath: string) => boolean {
  return (filepath: string) => isMatch(filepath, patterns, options);
}

// Export default object for compatibility with micromatch
export default {
  isMatch,
  filter,
  matcher
};