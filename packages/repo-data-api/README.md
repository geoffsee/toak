# Repo Data API

This service indexes the repository into chunked Markdown using `toak` and exposes a GraphQL API for:

- Querying chunked files (`chunks`, `fileChunks`, `searchContent`, `fileNames`, `fileStats`)
- Reading raw files (`readFile(path)`)
- Writing files (`writeFile(path, content)`)
- Listing packages (`listPackages`)
- Building packages (`buildAllPackages`)
- Running a simple autonomous agent (`startAgent(goal)`, `agentSession(id)`) that analyzes the repo and builds packages.
- Generating new projects from high-level specs (`startProjectBuild`) with sessions you can poll via `projectSession(id)`.

Run locally:

- `bun install` at repo root (ensure dependencies are installed)
- `bun run --filter repo-data-api dev` or `cd packages/repo-data-api && bun dev`

GraphQL endpoint: `http://localhost:4000/graphql` (CORS enabled)

Notes:

- DuckDB runs in-memory and refreshes the `repo` view every 30 seconds from `toak`.
- File paths are resolved relative to the repo root and protected against path traversal.
- Project builder currently supports:
  - JavaScript: React + Vite + TypeScript todo app
  - Python: FastAPI + SQLite todo API with static frontend
  - More templates can be added in `src/watch-repo.ts` via `chooseTemplate`.
