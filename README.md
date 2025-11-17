# toak

### _Tokenization_

[![npm version](https://img.shields.io/npm/v/toak)](https://www.npmjs.com/package/toak)
[![Crates.io](https://img.shields.io/crates/v/toak-rs.svg)](https://crates.io/crates/toak-rs)
![Tests](https://github.com/geoffsee/toak/actions/workflows/tests.yml/badge.svg)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0.html)

## Overview

`toak` is a cli tool, named for phonetics, that processes git repository files, cleans code, redacts sensitive information, and generates a `prompt.md` with token counts using the Llama 3 tokenizer.

## Quickstart

Choose your preferred implementation:

### Node.js/npm (TypeScript)

```bash
cd /path/to/your-git-repo
npx toak
```

### Rust (faster performance)

```bash
# Install from crates.io
cargo install toak-rs

# Run in your repository
cd /path/to/your-git-repo
toak
```

![toak](/toak.png)

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

## Implementation Comparison

| Feature        | TypeScript (npm)         | Rust (crates.io)    |
| -------------- | ------------------------ | ------------------- |
| Installation   | `npm` required           | No runtime required |
| Performance    | Moderate                 | ⚡ Blazing fast     |
| Memory Usage   | Higher                   | Low                 |
| Binary Size    | Large                    | Compact             |
| Async I/O      | Yes (Node.js)            | Yes (Tokio)         |
| Feature Parity | Reference implementation | Full                |
| Maintenance    | Active                   | Active              |

### Why Choose Rust?

- **Faster Execution**: Compiled binary runs 2-10x faster than Node.js
- **Smaller Package**: Single binary vs. node_modules directory
- **No Runtime**: Works on any system without Node.js installed
- **Production Ready**: Suitable for CI/CD pipelines and servers

### Why Choose TypeScript?

- **Easy Installation**: `npx` works out of the box
- **Customization**: Access to JavaScript library ecosystem
- **Programmatic API**: Use as a library in Node.js projects

## Requirements

### For TypeScript (npm) version

- npm/bun/yarn/pnpm
- Node.js 20.18.1+

### For Rust version

- Cargo (Rust package manager)
- Git (for repository processing)

## Usage

### CLI

```bash
npx toak
```

### Programmatic Usage

```typescript
import { MarkdownGenerator } from "toak";

const generator = new MarkdownGenerator({
  dir: "./project",
  outputFilePath: "./output.md",
  verbose: true,
});

const result = await generator.createMarkdownDocument();
```

## Configuration

### MarkdownGenerator Options

```typescript
interface MarkdownGeneratorOptions {
  dir?: string; // Project directory (default: '.')
  outputFilePath?: string; // Output file path (default: './prompt.md')
  fileTypeExclusions?: Set<string>; // File types to exclude
  fileExclusions?: string[]; // File patterns to exclude
  customPatterns?: Record<string, any>; // Custom cleaning patterns
  customSecretPatterns?: Record<string, any>; // Custom redaction patterns
  verbose?: boolean; // Enable verbose logging (default: true)
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

- Configuration files: .\*rc, tsconfig.json, package-lock.json
- Version control: .git*, .hg*, .svn\*
- Environment files: .env\*
- Build outputs: build/, dist/, out/
- Dependencies: node_modules/
- Documentation: docs/, README*, CHANGELOG*
- IDE settings: .idea/, .vscode/
- Test files: test/, spec/, **tests**/

## Development

This is a monorepo with implementations in both TypeScript and Rust.

### TypeScript Version

Uses [Bun](https://bun.sh) for development:

```bash
git clone <repository>
cd toak
bun install
```

**Scripts:**

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

**Project Structure:**

```
packages/toak/src/
├── index.ts              # Main exports
├── TokenCleaner.ts       # Code cleaning and redaction
├── MarkdownGenerator.ts  # Markdown generation logic
├── cli.ts               # CLI implementation
├── fileExclusions.ts    # File exclusion patterns
└── fileTypeExclusions.ts # File type exclusions
```

### Rust Version

Located in `packages/toak-rs/`. Requires Rust 1.70+:

```bash
cd packages/toak-rs
```

**Commands:**

```bash
# Build
cargo build --release

# Run
cargo run -- -d /path/to/repo

# Test
cargo test

# Format
cargo fmt

# Lint
cargo clippy

# Documentation
cargo doc --no-deps --open

# Publish to crates.io
cargo publish --token <CRATES_IO_TOKEN>
```

**Project Structure:**

```
packages/toak-rs/src/
├── main.rs               # CLI entry point
├── cli.rs               # Argument parsing
├── token_cleaner.rs     # Code cleaning and redaction
└── markdown_generator.rs # Markdown generation logic
```

**Release Process:**

See [RELEASE_GUIDE.md](packages/toak-rs/RELEASE_GUIDE.md) for detailed instructions on publishing to crates.io.

Quick release:

1. Update version in `packages/toak-rs/Cargo.toml`
2. Create a GitHub release with tag `toak-rs-vX.Y.Z`
3. Automated workflow publishes to crates.io

## Contributing

Contributions are welcome for both TypeScript and Rust implementations!

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

### Guidelines for TypeScript

- Write TypeScript code following the project's style
- Include appropriate error handling
- Add documentation for new features
- Include tests for new functionality
- Update the README for significant changes

### Guidelines for Rust

- Follow Rust naming conventions and idioms
- Ensure code passes `cargo clippy` without warnings
- Run `cargo fmt` before committing
- Include unit tests in the same file or in a tests module
- Update documentation in the crate README
- Ensure all tests pass: `cargo test`

### Code Quality

- Both implementations are tested on every push/PR
- Automated workflow checks formatting and linting
- Versions must be synchronized (see Version Management section)
- All tests must pass before merging

### Version Management

Since this monorepo has both Node.js and Rust implementations, versions must stay synchronized.

**Check versions:**

```bash
./scripts/check-versions.sh
```

**Update versions:**

```bash
./scripts/sync-versions.sh 1.0.0
```

See [scripts/README.md](scripts/README.md) for detailed documentation.

## Note

This tool requires a git repository to function properly as it uses `git ls-files` to identify tracked files.

## License

### GNU AFFERO GENERAL PUBLIC LICENSE

Version 3, 19 November 2007
© 2024 Geoff Seemueller
