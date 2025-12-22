# Thinktank Pipeline

A Bun-powered monorepo for the Thinktank pipeline UI and API, built for running multi-stage LLM workflows (planning, synthesis, and review) across multiple models.

## Quick Start

```sh
bun install
cp .env.example .env
bun run env:setup
bun run dev
```

- API (Hono + tRPC): http://localhost:3000
- Web (Vite + React): http://localhost:5173

## Repo Layout

```
apps/
  server/           # Hono + tRPC API
  web-thinktank/    # Vite + React client
  [template]/       # App template
packages/
  db/               # Drizzle + SQLite
  trpc-router/      # Shared tRPC router
  ui-library/       # ShadCN UI primitives
  utils/            # Shared utilities (model lists, helpers)
  [template]/       # Package template
tooling/
  [template]/       # Tooling template
```

## Common Commands

```sh
bun run dev
bun run dev:server
bun run dev:web
bun run lint
bun run format
bun run tsc
bun run check
```

## Docker

Build from the repo root so workspaces resolve:

```sh
docker build -f apps/server/Dockerfile -t thinktank-server .
docker build -f apps/web-thinktank/Dockerfile -t thinktank-web .
```

## Templates

Copy any `[template]` folder when bootstrapping a new app, package, or tooling project to preserve repo conventions.
