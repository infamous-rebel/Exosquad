---
kind: build_system
name: pnpm + Turbo Monorepo Build System
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - turbo.json
    - pnpm-workspace.yaml
    - docker-compose.yml
    - apps/api/package.json
    - apps/worker/package.json
    - packages/common/package.json
    - packages/config/package.json
    - packages/database/package.json
    - packages/logger/package.json
---

## Overview

The Exosquad monorepo is a Node.js/TypeScript project built with **pnpm workspaces** and **Turbo** for task orchestration and caching. There are no Makefiles, Dockerfiles, or CI pipelines in this repository — containerization is limited to a `docker-compose.yml` for local development infrastructure (PostgreSQL + Redis), and publishing/release tooling is not present.

## Toolchain

- **Package manager**: pnpm 9.0.0 (declared via `packageManager` field in root `package.json`, enforced by `.npmrc`/lockfile).
- **Runtime**: Node.js >=20.0.0 (enforced via `engines.node` in root `package.json`).
- **Task runner**: Turbo ^2.3.0, configured in `turbo.json`.
- **Compiler**: TypeScript 5.6.3, invoked per-package via `tsc`.
- **Test runner**: Vitest 2.1.5, configured per-app package.
- **Linting**: ESLint 9.x with `typescript-eslint` (root `eslint.config.js`).
- **Database migrations**: Prisma 5.22.0 under `packages/database/prisma/`.
- **Local infra**: `docker-compose.yml` spins up PostgreSQL 16-alpine and Redis 7-alpine.

## Monorepo Layout

`pnpm-workspace.yaml` declares two workspace roots:
- `apps/*` — runtime services (`@exosquad/api`, `@exosquad/worker`).
- `packages/*` — internal libraries (`@exosquad/common`, `@exosquad/config`, `@exosquad/database`, `@exosquad/logger`).

Internal packages reference each other via `workspace:*` protocol (e.g. `"@exosquad/common": "workspace:*"` in `apps/api/package.json`). All packages are marked `private: true`, so none are published to a registry.

## Task Graph (`turbo.json`)

| Task | Dependencies | Notes |
|---|---|---|
| `build` | `^build` (topological) | Outputs `dist/**`; cached by Turbo |
| `test` | `build` | Runs after build |
| `test:unit` | `build` | Unit tests only |
| `test:integration` | `build` | Integration tests via separate vitest config |
| `lint` | `^build` | Lints depend on upstream builds |
| `typecheck` | `^build` | Type-checks depend on upstream builds |
| `dev` | none | Persistent, cache disabled |
| `clean` | none | Cache disabled |

The `^build` dependency means every package's dependencies are built first (topological order), then the current package builds. This enforces that shared packages (`common`, `config`, `database`, `logger`) compile before apps consume them.

## Per-Package Scripts

Every package follows the same script contract, which Turbo relies on:

- `build`: runs `tsc` (emits to `dist/`).
- `clean`: `rm -rf dist`.
- `typecheck`: `tsc --noEmit`.

Apps add:
- `dev`: `tsx watch src/index.ts` (hot-reload dev server).
- `start`: `node dist/index.js` (production entry).
- `test`: `vitest run`.
- `test:unit` / `test:integration`: unit vs integration test variants.

The database package adds Prisma-specific scripts: `generate`, `migrate:dev`, `migrate:deploy`, `migrate:status`, `studio`.

## Root-Level Entry Points

Root `package.json` re-exports the unified surface:

```json
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "test:unit": "turbo run test:unit",
    "test:integration": "turbo run test:integration",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "db:generate": "pnpm --filter @exosquad/database generate",
    "db:migrate": "pnpm --filter @exosquad/database migrate:deploy",
    "db:migrate:dev": "pnpm --filter @exosquad/database migrate:dev",
    "clean": "turbo run clean && rm -rf node_modules"
  }
}
```

Database commands use `pnpm --filter` to target `@exosquad/database` directly rather than going through Turbo.

## Artifact Convention

Each package emits compiled JavaScript into its own `dist/` directory. The `main` and `types` fields in every package's `package.json` point at `dist/index.js` and `dist/index.d.ts` respectively. Turbo caches these outputs keyed by content hash (see `.turbo/cache/` entries).

## Versioning

All packages and the root share version `0.1.0`. Versions are static strings in each `package.json` — there is no centralized version bump script, no changelog generator, and no publish step defined.

## Containerization & Deployment

There is no `Dockerfile` and no CI configuration (no `.github/workflows`, no `.gitlab-ci.yml`, etc.). `docker-compose.yml` defines only the external dependencies needed for local development:

- `postgres` service (image `postgres:16-alpine`, port 5432, healthcheck via `pg_isready`).
- `redis` service (image `redis:7-alpine`, port 6379, healthcheck via `redis-cli ping`).

Both use named volumes (`postgres_data`, `redis_data`) and `restart: unless-stopped`. The compose file is documented as local development infrastructure only.

## Conventions Observed

- Every package exposes a `build`, `clean`, and `typecheck` script; adding a new package requires implementing these three scripts for Turbo to pick it up.
- Internal package references always use the `workspace:*` protocol — no fixed versions between sibling packages.
- Apps depend on all four shared packages (`@exosquad/common`, `@exosquad/config`, `@exosquad/database`, `@exosquad/logger`) via `workspace:*`.
- Tests are split into unit and integration suites per app, with separate Vitest configs for integration tests.
- Database operations are funneled through the `@exosquad/database` package; root-level `db:*` scripts delegate to it via `pnpm --filter`.
- No cross-compilation, no multi-platform builds, no release/publish pipeline exists in this repository.