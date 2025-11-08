# Code Agent UI

A React + Vite UI that connects to the local `repo-data-api` GraphQL server to:

- Browse repository files
- Search chunked content
- List and build packages
- Start and monitor a simple autonomous build agent
- Create apps from a high-level spec (todo app templates in JS and Python)

Run locally:

- Start the UI: `cd packages/code-agent && bun run dev`
- The dev server auto-starts repo-data-api with Bun and proxies `/graphql` to it. Requires `bun` on PATH. No second process needed.
- To point to a remote API, set `VITE_GRAPHQL_URL` (defaults to `/graphql`).
