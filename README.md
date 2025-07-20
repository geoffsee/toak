# code-tokenizer


[![npm version](https://img.shields.io/npm/v/toak)](https://www.npmjs.com/package/toak)
![Tests](https://github.com/seemueller-io/code-tokenizer/actions/workflows/tests.yml/badge.svg)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0.html)

## Overview

`toak` is a cli tool, nameed for phonetics, that processes git repository files, cleans code, redacts sensitive information, and generates a `prompt.md` with token counts using the Llama 3 tokenizer.

```shell
$ cd your-git-repo
$ npx toak
```

![toak](https://github.com/seemueller-io/code-tokenizer/blob/471c2a359e342c0103d2074650afe1f1b2b5f71d/toak.jpg?raw=true)


## Features

### Data Processing
- Reads tracked files from git repository
- Removes comments, imports, and unnecessary whitespace
- Redacts sensitive information (API keys, tokens, JWT, hashes)
- Counts tokens using llama3-tokenizer-js
- Supports nested .toak-ignore files
- Removes single-line and multi-line comments
- Strips console.log statements
- Removes import statements
- Cleans up whitespace and empty lines
- Redacts API keys and secrets
- Masks JWT tokens
- Hides authorization tokens
- Redacts Base64 encoded strings
- Masks cryptographic hashes

## Requirements

- npm/bun/yarn/pnpm
  
## Usage

### CLI
```bash
npx toak
```

### Programmatic Usage

```typescript
import { MarkdownGenerator } from 'toak';

const generator = new MarkdownGenerator({
  dir: './project',
  outputFilePath: './output.md',
  verbose: true
});

const result = await generator.createMarkdownDocument();
```

## Configuration

### MarkdownGenerator Options

```typescript
interface MarkdownGeneratorOptions {
  dir?: string;                    // Project directory (default: '.')
  outputFilePath?: string;         // Output file path (default: './prompt.md')
  fileTypeExclusions?: Set<string>;// File types to exclude
  fileExclusions?: string[];      // File patterns to exclude
  customPatterns?: Record<string, any>;      // Custom cleaning patterns
  customSecretPatterns?: Record<string, any>;// Custom redaction patterns
  verbose?: boolean;              // Enable verbose logging (default: true)
}
```

### Ignore File Configuration

Create a `.toak-ignore` file in any directory to specify exclusions. The tool supports nested ignore files that affect their directory and subdirectories.

Example `.toak-ignore`:
```plaintext
# Ignore specific files
secrets.json
config.private.ts

# Ignore directories
build/
temp/

# Glob patterns
**/*.test.ts
**/._*
```

#### Default Exclusions

The tool automatically excludes common file types and patterns:

File Types:
- Images: .jpg, .jpeg, .png, .gif, .bmp, .svg, .webp, etc.
- Fonts: .ttf, .woff, .woff2, .eot, .otf
- Binaries: .exe, .dll, .so, .dylib, .bin
- Archives: .zip, .tar, .gz, .rar, .7z
- Media: .mp3, .mp4, .avi, .mov, .wav
- Data: .db, .sqlite, .sqlite3
- Config: .lock

File Patterns:
- Configuration files: .*rc, tsconfig.json, package-lock.json
- Version control: .git*, .hg*, .svn*
- Environment files: .env*
- Build outputs: build/, dist/, out/
- Dependencies: node_modules/
- Documentation: docs/, README*, CHANGELOG*
- IDE settings: .idea/, .vscode/
- Test files: test/, spec/, __tests__/

## Development

This project uses [Bun](https://bun.sh) for development. To contribute:

### Setup
```bash
git clone <repository>
cd toak
bun install
```

### Scripts
```bash
# Build the project
bun run build

# Run tests
bun test

# Lint code
bun run lint

# Fix linting issues
bun run lint:fix

# Format code
bun run format

# Fix all (format + lint)
bun run fix

# Development mode
bun run dev

# Publish development version
bun run deploy:dev
```

### Project Structure
```
src/
├── index.ts              # Main exports
├── TokenCleaner.ts       # Code cleaning and redaction
├── MarkdownGenerator.ts  # Markdown generation logic
├── cli.ts               # CLI implementation
├── fileExclusions.ts    # File exclusion patterns
└── fileTypeExclusions.ts # File type exclusions
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

### Guidelines
- Write TypeScript code following the project's style
- Include appropriate error handling
- Add documentation for new features
- Include tests for new functionality
- Update the README for significant changes


## Note

This tool requires a git repository to function properly as it uses `git ls-files` to identify tracked files.

## License

### GNU AFFERO GENERAL PUBLIC LICENSE
Version 3, 19 November 2007
© 2024 Geoff Seemueller

