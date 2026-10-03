---
kind: dependency_management
name: pnpm + Turbo Monorepo Dependency Management
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - turbo.json
    - apps/api/package.json
    - apps/worker/package.json
    - packages/common/package.json
    - packages/config/package.json
    - packages/database/package.json
    - packages/logger/package.json
---

## System / Approach

The Exosquad monorepo uses **pnpm** (v9.0.0, pinned via `packageManager` in root `package.json`) as the package manager and **Turbo** (^2.3.0) for task orchestration across a workspace containing two apps (`apps/api`, `apps/worker`) and four shared packages (`packages/common`, `packages/config`, `packages/database`, `packages/logger`). All Node.js code targets Node >=20.0.0 (enforced by the root `engines` field).

There is no vendoring of third-party dependencies — all external libraries are resolved from the public npm registry through pnpm's default behavior. No `.npmrc`, private registry URL, or `GOPRIVATE`-style configuration was found; dependency resolution relies on the standard pnpm/npm registry.

## Key Files

- `package.json` (root): declares `packageManager: "pnpm@9.0.0"`, `engines.node: ">=20.0.0"`, and top-level scripts that delegate to `turbo run` (`build`, `dev`, `test`, `test:unit`, `test:integration`, `lint`, `typecheck`, `clean`). Also pins dev tooling versions (turbo ^2.3.0, typescript ^5.6.3, eslint ^9.15.0, vitest ^2.1.5).
- `pnpm-workspace.yaml`: declares the workspace layout with globs `packages/*` and `apps/*`.
- `pnpm-lock.yaml`: generated lockfile pinning every transitive dependency to exact versions.
- `turbo.json`: defines task graph (`build`, `test`, `test:unit`, `test:integration`, `lint`, `typecheck`, `dev`, `clean`) with inter-task `dependsOn` rules (e.g. `build` depends on `^build`, meaning dependent packages build first).
- Per-package `package.json` files under `apps/*` and `packages/*` declare runtime vs. dev dependencies.

## Architecture & Conventions

### Workspace-local packages use `workspace:*`
Internal cross-package imports are declared with the pnpm workspace protocol:

- `apps/api/package.json` depends on `@exosquad/common`, `@exosquad/config`, `@exosquad/database`, `@exosquad/logger` all at `workspace:*`.
- `apps/worker/package.json` depends on `@exosquad/database`, `@exosquad/common`, `@exosquad/config`, `@exosquad/logger` all at `workspace:*`.

This means internal packages are never published and are linked directly during install rather than fetched from a registry.

### Shared packages are marked `private: true`
All four packages under `packages/*` set `"private": true`, preventing accidental publication to npm. They each expose `main: "dist/index.js"` and `types: "dist/index.d.ts"`, so consumers get both runtime and TypeScript declarations after `tsc`.

### Version ranges use caret (`^`) semver
External dependencies across the repo consistently use `^`-prefixed version ranges (e.g. `fastify: ^5.1.0`, `zod: ^3.23.8`, `bullmq: ^5.25.0`, `ioredis: ^5.4.1`, `pino: ^9.5.0`, `@prisma/client: ^5.22.0`). The lockfile (`pnpm-lock.yaml`) is what pins exact versions for reproducible installs.

### Task graph enforces build ordering
`turbo.json` configures `build` tasks with `dependsOn: ["^build"]`, ensuring that when building an app, its workspace dependencies are built first. `test`, `test:unit`, `test:integration`, `lint`, and `typecheck` depend on `build`. `dev` is marked `persistent: true` and `cache: false`; `clean` is also uncached.

### Database dependencies are isolated in `@exosquad/database`
Prisma (`prisma` CLI in devDependencies, `@prisma/client` in dependencies) lives only in `packages/database/package.json`. Root scripts `db:generate`, `db:migrate`, `db:migrate:dev` invoke it via `pnpm --filter @exosquad/database ...`, centralizing database tooling behind a single package name.

### Tooling is centralized at the root
TypeScript, ESLint, Vitest, and Turborepo are installed as root `devDependencies` and referenced by workspace members. Each app/package has its own `tsconfig.json` but shares `tsconfig.base.json` at the repo root.

## Conventions & Constraints

- **Package manager is locked**: the root `package.json` specifies `"packageManager": "pnpm@9.0.0"`, which causes pnpm to reject installation if a different version is used (enforced by pnpm itself).
- **Node engine is enforced**: the root `engines.node: ">=20.0.0"` constraint is checked by pnpm/yarn/nvm-based setups before installing.
- **Workspace protocol for internal deps**: internal packages are imported exclusively via `workspace:*` in `dependencies` (observed in both `apps/api` and `apps/worker`).
- **Shared packages are unpublished**: all `packages/*` have `"private": true`, preventing accidental `pnpm publish`.
- **Lockfile is committed**: `pnpm-lock.yaml` exists at the repo root and is the source of truth for exact transitive versions.
- **Build order is enforced by Turbo**: `turbo.json`'s `dependsOn` rules ensure dependent packages build before their consumers; this is structural enforcement by the task runner.
- **No private registry configured**: no `.npmrc`, `registry` override, or scoped private registry URL was found — all third-party dependencies resolve from the public npm registry.