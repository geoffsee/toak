import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface GlobOptions {
  cwd?: string;
  dot?: boolean;
  absolute?: boolean;
  follow?: boolean;
  nodir?: boolean;
}

/**
 * Simple glob implementation that supports basic ** patterns
 * Specifically designed to replace the glob dependency for .aiignore file matching
 */
export async function glob(pattern: string, options: GlobOptions = {}): Promise<string[]> {
  const {
    cwd = process.cwd(),
    dot = false,
    absolute = false,
    follow = true,
    nodir = false,
  } = options;

  const results: string[] = [];

  // Convert glob pattern to regex
  // For **/.aiignore pattern, we want to match .aiignore in any directory
  const patternParts = pattern.split('/');
  const fileName = patternParts[patternParts.length - 1];
  const hasDoubleStar = patternParts.includes('**');

  function walkDir(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      // Skip directories we can't read
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      // Skip hidden files/dirs unless dot option is true
      if (!dot && entry.name.startsWith('.') && entry.name !== fileName) {
        continue;
      }

      let isDirectory = entry.isDirectory();

      // Handle symlinks
      if (entry.isSymbolicLink() && follow) {
        try {
          const stats = statSync(fullPath);
          isDirectory = stats.isDirectory();
        } catch (error) {
          // Skip broken symlinks
          continue;
        }
      }

      if (isDirectory) {
        // Recursively walk subdirectories for ** patterns
        if (hasDoubleStar) {
          walkDir(fullPath);
        }
      } else {
        // Check if file matches the pattern
        if (matchesPattern(entry.name, fileName)) {
          // Skip directories if nodir is true
          if (nodir && isDirectory) {
            continue;
          }

          const resultPath = absolute ? fullPath : relative(cwd, fullPath);
          results.push(resultPath);
        }
      }
    }
  }

  function matchesPattern(fileName: string, pattern: string): boolean {
    // Simple pattern matching - supports exact match and basic wildcards
    if (pattern === fileName) {
      return true;
    }

    // Convert glob pattern to regex
    const regexPattern = pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(fileName);
  }

  walkDir(cwd);
  return results;
}
