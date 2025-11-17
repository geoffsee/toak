#!/bin/bash
# Script to sync versions across Rust and Node.js packages
# Only updates package versions, not dependency versions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Check if version argument is provided
if [ $# -ne 1 ]; then
    echo "Usage: $0 <new-version>"
    echo ""
    echo "Example: $0 0.2.0"
    echo ""
    echo "This script will update versions in:"
    echo "  - packages/toak/package.json"
    echo "  - packages/toak-rs/Cargo.toml"
    echo "  - Cargo.toml (root workspace)"
    exit 1
fi

NEW_VERSION="$1"

# Validate version format (simple check for semantic versioning)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in semver format (e.g., 1.2.3)"
    exit 1
fi

# File paths
RUST_CARGO_TOML="$ROOT_DIR/packages/toak-rs/Cargo.toml"
NODE_PACKAGE_JSON="$ROOT_DIR/packages/toak/package.json"
ROOT_CARGO_TOML="$ROOT_DIR/Cargo.toml"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Updating versions to $NEW_VERSION${NC}"
echo ""

# Update Node.js package
echo "📦 Updating packages/toak/package.json..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS requires -i ''
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$NODE_PACKAGE_JSON"
else
    # Linux
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$NODE_PACKAGE_JSON"
fi

# Update Rust packages (both root and crate-specific)
echo "🦀 Updating Cargo.toml files..."
for CARGO_FILE in "$ROOT_CARGO_TOML" "$RUST_CARGO_TOML"; do
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Only update version at the start of a line in [package] or [workspace.package] sections
        sed -i '' "s/^\(version = \)\"[^\"]*\"/\1\"$NEW_VERSION\"/" "$CARGO_FILE"
    else
        # Only update version at the start of a line in [package] or [workspace.package] sections
        sed -i "s/^\(version = \)\"[^\"]*\"/\1\"$NEW_VERSION\"/" "$CARGO_FILE"
    fi
done

echo ""
echo -e "${GREEN}✓ Successfully updated all versions to $NEW_VERSION${NC}"
echo ""
echo "Files updated:"
echo "  ✓ packages/toak/package.json"
echo "  ✓ packages/toak-rs/Cargo.toml"
echo "  ✓ Cargo.toml (root workspace)"
echo ""
echo "Next steps:"
echo "  1. Review the changes: git diff"
echo "  2. Commit: git add . && git commit -m 'Bump version to $NEW_VERSION'"
echo "  3. Create a release on GitHub with tag format:"
echo "     - For main release: v$NEW_VERSION"
echo "     - Or component-specific: toak-rs-v$NEW_VERSION"
