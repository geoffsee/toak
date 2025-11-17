# Version Management Scripts

These scripts help manage version consistency across the monorepo's TypeScript and Rust implementations.

## Scripts

### `check-versions.sh`

Checks that versions match across all packages.

**Usage:**

```bash
./scripts/check-versions.sh
```

**Output:**

- Lists versions in:
  - Node.js package (`packages/toak/package.json`)
  - Rust crate (`packages/toak-rs/Cargo.toml`)
  - Root workspace (`Cargo.toml`)
- Shows mismatches in red
- Exits with code 0 if all versions match, 1 if there are mismatches

**Example output (matching versions):**

```
Version Check Report
====================

📦 Node.js (toak):         4.0.4
🦀 Rust (toak-rs):         4.0.4
🦀 Root Workspace:         4.0.4

✓ All versions match!
```

### `sync-versions.sh`

Updates package versions across all packages to a specified version. **Only updates package/crate versions, not dependency versions.**

**Usage:**

```bash
./scripts/sync-versions.sh <new-version>
```

**Arguments:**

- `<new-version>`: New version in semver format (e.g., `1.2.3`)

**Example:**

```bash
./scripts/sync-versions.sh 4.1.0
```

**Files updated:**

- `packages/toak/package.json` - Updates `"version"` field
- `packages/toak-rs/Cargo.toml` - Updates `version` field in `[package]` section
- `Cargo.toml` (root workspace) - Updates `version` in `[workspace.package]` section

**Important:** Dependency versions (like `tokio = { version = "1.35" }`) are NOT modified by this script.

**Next steps after running:**

1. Review changes: `git diff`
2. Commit: `git add . && git commit -m 'Bump version to X.Y.Z'`
3. Create GitHub release with tag:
   - `v4.1.0` for main release
   - `toak-rs-v4.1.0` for component-specific release

## CI/CD Integration

The version check is automatically run on:

- All pushes to `main` branch
- All pull requests to `main` branch
- All merge queue events

If versions are mismatched, the CI workflow will fail and indicate which versions need to be synced.

## Version Requirements

Versions must follow [Semantic Versioning](https://semver.org/):

- Format: `MAJOR.MINOR.PATCH`
- Example: `4.0.4`, `1.2.3`

## Monorepo Version Strategy

Since this is a monorepo with TypeScript and Rust implementations:

- **Single version number**: Both implementations share the same version
- **Synchronized releases**: When releasing, both packages are updated together
- **Breaking changes**: Major version bumps apply to both implementations

This ensures that `toak@4.0.4` on npm corresponds to `toak-rs v4.0.4` on crates.io.

## Troubleshooting

### Scripts not executable

```bash
chmod +x scripts/*.sh
```

### Version format not recognized

Ensure version follows `X.Y.Z` format (three numeric parts separated by dots).

### Scripts fail to find files

Ensure you're running scripts from the repository root:

```bash
# Good
./scripts/check-versions.sh

# Bad (from scripts directory)
./check-versions.sh
```

## Adding New Packages

If you add more packages to the monorepo:

1. Update `check-versions.sh` to include version extraction for the new package
2. Update `sync-versions.sh` to update the new package's version file
3. Add the package to the version check CI/CD workflow
