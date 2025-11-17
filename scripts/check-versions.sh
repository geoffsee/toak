#!/bin/bash
# Script to check and sync versions between Rust and Node.js packages

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# File paths
RUST_CARGO_TOML="$ROOT_DIR/packages/toak-rs/Cargo.toml"
NODE_PACKAGE_JSON="$ROOT_DIR/packages/toak/package.json"
ROOT_CARGO_TOML="$ROOT_DIR/Cargo.toml"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to extract version from Cargo.toml
get_rust_version() {
    # Handle both "version = " and "version.workspace = true" cases
    local file="$1"

    # First check if it's a workspace reference
    if grep -q "^version.workspace = true" "$file"; then
        # If it's a workspace reference, get version from root Cargo.toml
        grep '^version = ' "$ROOT_DIR/Cargo.toml" | head -1 | sed 's/^version = "\([^"]*\)".*/\1/'
    else
        # Otherwise get the direct version
        grep '^version = ' "$file" | head -1 | sed 's/^version = "\([^"]*\)".*/\1/'
    fi
}

# Function to extract version from package.json
get_node_version() {
    grep '"version"' "$1" | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/'
}

# Get current versions
RUST_VERSION=$(get_rust_version "$RUST_CARGO_TOML")
NODE_VERSION=$(get_node_version "$NODE_PACKAGE_JSON")
ROOT_RUST_VERSION=$(get_rust_version "$ROOT_CARGO_TOML")

echo "Version Check Report"
echo "===================="
echo ""
echo "📦 Node.js (toak):         $NODE_VERSION"
echo "🦀 Rust (toak-rs):         $RUST_VERSION"
echo "🦀 Root Workspace:         $ROOT_RUST_VERSION"
echo ""

# Check if versions match
MISMATCH=0

if [ "$RUST_VERSION" != "$NODE_VERSION" ]; then
    echo -e "${RED}✗ Version mismatch between Rust and Node.js${NC}"
    echo "  Rust: $RUST_VERSION"
    echo "  Node: $NODE_VERSION"
    MISMATCH=1
fi

if [ "$RUST_VERSION" != "$ROOT_RUST_VERSION" ]; then
    echo -e "${RED}✗ Version mismatch between Rust crate and root workspace${NC}"
    echo "  Rust crate: $RUST_VERSION"
    echo "  Root workspace: $ROOT_RUST_VERSION"
    MISMATCH=1
fi

if [ $MISMATCH -eq 0 ]; then
    echo -e "${GREEN}✓ All versions match!${NC}"
    exit 0
else
    echo ""
    echo -e "${YELLOW}To fix versions, run:${NC}"
    echo "  ./scripts/sync-versions.sh <new-version>"
    echo ""
    echo "Example: ./scripts/sync-versions.sh 0.2.0"
    exit 1
fi
