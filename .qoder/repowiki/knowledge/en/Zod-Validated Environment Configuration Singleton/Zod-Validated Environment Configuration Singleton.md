---
kind: configuration_system
name: Zod-Validated Environment Configuration Singleton
category: configuration_system
scope:
    - '**'
source_files:
    - packages/config/src/index.ts
    - packages/config/package.json
    - apps/api/src/app.ts
    - apps/api/src/plugins/auth.ts
    - apps/worker/src/app.ts
    - apps/worker/src/queues/queue-manager.ts
    - .gitignore
---

## Approach

The monorepo centralizes runtime configuration in a single shared package `@exosquad/config` (`packages/config`). All environment variables are declared and validated at startup using **Zod** schemas against `process.env`. There is no `.env` loader library (no `dotenv` dependency); the code reads directly from `process.env`, so consumers are expected to load their own `.env` files before importing `@exosquad/config`.

## Key Files

- `packages/config/src/index.ts` — schema definition, validation, singleton export
- `packages/config/package.json` — declares `zod` as the only runtime dependency
- `apps/api/src/app.ts` — imports `config` for `PORT`
- `apps/api/src/plugins/auth.ts` — imports `config.JWT_SECRET`, `config.JWT_EXPIRES_IN`
- `apps/worker/src/app.ts` — imports `config.PORT`
- `apps/worker/src/queues/queue-manager.ts` — imports `config.REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `WORKER_CONCURRENCY`
- `.gitignore` — ignores `.env`, `.env.local`, `.env.*.local`, `packages/database/.env`
- `docs/ARCHITECTURE.md` — documents `@exosquad/config` as the environment-validation package

## Schema & Conventions

The Zod schema groups env vars by concern:

| Group | Variables | Validation |
|---|---|---|
| Database | `DATABASE_URL` | Required URL string |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Host defaults to `localhost`; port coerced to positive int defaulting to `6379`; password optional |
| Application | `NODE_ENV`, `PORT`, `LOG_LEVEL` | `NODE_ENV` enum of `development`/`production`/`test` (default `development`); `PORT` positive int default `3000`; `LOG_LEVEL` enum of Pino levels default `info` |
| Authentication | `JWT_SECRET`, `JWT_EXPIRES_IN` | Secret required with min length 32; expiry string default `24h` |
| Worker | `WORKER_CONCURRENCY` | Positive int default `5` |

Two exports are provided:

1. `loadEnv()` — validates `process.env` via `safeParse`; on failure logs the formatted Zod errors to stderr and throws `Error("Invalid environment configuration")`.
2. `config` — a module-level singleton created by calling `loadEnv()` at import time, typed as `z.infer<typeof envSchema>`.

Consumers import the singleton directly: `import { config } from "@exosquad/config"`.

## Architecture Decisions

- **Fail-fast at import**: Because `config` is instantiated at module load, any missing or invalid env var causes the process to crash immediately rather than propagating undefined values through the app.
- **No dotenv dependency**: The package does not call `dotenv.config()`. Each consuming service is responsible for loading its own `.env` file before importing `@exosquad/config`.
- **Type safety via inference**: Callers get full TypeScript types for every env var through `z.infer`, eliminating manual type declarations elsewhere.
- **Defaults over optionality**: Most vars have sensible defaults (`localhost`, `6379`, `3000`, `development`, `info`, `24h`, `5`) so services can start locally without explicit env setup; only `DATABASE_URL` and `JWT_SECRET` are strictly required.
- **Workspace distribution**: Both `apps/api` and `apps/worker` declare `"@exosquad/config": "workspace:*"` in their `package.json`, making it a pnpm workspace dependency consumed across services.

## Constraints Enforced by Code

- `DATABASE_URL` must be present and parseable as a URL (Zod `.url()`).
- `JWT_SECRET` must be a string of at least 32 characters.
- `NODE_ENV` must be one of `development`, `production`, `test`.
- `LOG_LEVEL` must be one of `fatal`, `error`, `warn`, `info`, `debug`, `trace`.
- `PORT`, `REDIS_PORT`, and `WORKER_CONCURRENCY` must coerce to positive integers.
- If validation fails, `loadEnv()` throws an error and the process exits; there is no fallback path.

## Secrets Handling

Secrets (`DATABASE_URL`, `JWT_SECRET`, optionally `REDIS_PASSWORD`) are treated as plain environment variables. They are not loaded from a secrets manager, encrypted store, or mounted file in this codebase. `.env*` files are gitignored at the repo root and under `packages/database/`.

## Cross-Cutting Notes

Some packages still read `process.env` directly instead of going through `config`: `packages/logger/src/index.ts` reads `LOG_LEVEL` and `NODE_ENV`; `packages/database/src/index.ts` reads `NODE_ENV`. These bypass the Zod validation layer and represent a minor inconsistency relative to the intended pattern.