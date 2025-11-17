# toak-rs

A blazing-fast Rust implementation of the `toak` CLI tool for tokenizing git repositories into markdown files.

## Overview

`toak-rs` processes git repository files, cleans code, redacts sensitive information, and generates a `prompt.md` file with token counts. This Rust version provides better performance compared to the TypeScript implementation while maintaining full feature parity.

## Features

- **Fast Processing**: Written in Rust for optimal performance
- **Code Cleaning**: Removes comments, imports, and unnecessary whitespace
- **Secret Redaction**: Automatically masks API keys, tokens, JWT, hashes, and other sensitive data
- **Token Counting**: Counts tokens in the generated markdown
- **Nested Ignore Files**: Supports `.toak-ignore` files at any directory level
- **Git Integration**: Works with any git repository
- **Async I/O**: Non-blocking file operations using Tokio

## Installation

### From crates.io

```bash
cargo install toak-rs
```

### From source

```bash
git clone https://github.com/geoffsee/toak.git
cd toak/packages/toak-rs
cargo install --path .
```

## Usage

```bash
# Generate prompt.md in current directory
toak

# Specify custom directory and output file
toak -d /path/to/repo -o output.md

# Run in quiet mode (no verbose output)
toak --quiet

# Show help
toak --help
```

### Command-line Options

- `-d, --dir <DIR>`: Project directory to process (default: `.`)
- `-o, --output-file-path <OUTPUT_FILE_PATH>`: Output markdown file path (default: `prompt.md`)
- `--quiet`: Disable verbose output
- `-p, --prompt <PROMPT>`: Preset prompt template (currently a placeholder)
- `-h, --help`: Print help information

## Configuration

### .toak-ignore Files

Create `.toak-ignore` files to exclude patterns from processing. These work similarly to `.gitignore`:

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

The tool recursively loads `.toak-ignore` files from any directory level.

## Default Exclusions

The tool automatically excludes:

**File Types:**

- Images: `.jpg`, `.png`, `.gif`, `.svg`, `.webp`, etc.
- Fonts: `.ttf`, `.woff`, `.eot`, `.otf`
- Binaries: `.exe`, `.dll`, `.so`, `.dylib`
- Archives: `.zip`, `.tar`, `.gz`, `.rar`, `.7z`
- Media: `.mp3`, `.mp4`, `.avi`, `.mov`, `.wav`
- Databases: `.db`, `.sqlite`, `.sqlite3`

**Patterns:**

- Configuration files (`.env*`, `tsconfig.json`, `package-lock.json`)
- Version control (`.git*`, `.hg*`, `.svn*`)
- Build outputs (`build/`, `dist/`, `out/`)
- Dependencies (`node_modules/`, `target/`)
- Documentation (`docs/`, `README*`, `CHANGELOG*`)
- IDE settings (`.idea/`, `.vscode/`)
- Tests (`test/`, `spec/`, `__tests__/`)

## How It Works

1. **File Discovery**: Uses `git ls-files` to get tracked files
2. **Filtering**: Applies file type and pattern-based exclusions
3. **Code Cleaning**: Removes comments, imports, console logs, and whitespace
4. **Secret Redaction**: Masks sensitive information (API keys, tokens, etc.)
5. **Token Counting**: Counts tokens in the cleaned content
6. **Markdown Generation**: Creates a markdown file with all processed files
7. **Configuration**: Automatically manages `.toak-ignore` and `.gitignore` files

## Requirements

- Rust 1.70+
- Git

## Performance

The Rust implementation provides significant performance improvements over the TypeScript version:

- Faster binary execution
- Lower memory footprint
- Better concurrency with Tokio

## License

GNU AFFERO GENERAL PUBLIC LICENSE Version 3 (AGPL-3.0-or-later)

## Contributing

Contributions are welcome! Please feel free to submit pull requests.

## Related Projects

- [toak](https://npmjs.com/package/toak) - The original TypeScript implementation on npm
- [repo-tokenizer](https://github.com/geoffsee/toak) - Main repository
