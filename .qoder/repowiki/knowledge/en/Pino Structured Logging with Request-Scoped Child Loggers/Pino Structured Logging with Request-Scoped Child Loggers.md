---
kind: logging_system
name: Pino Structured Logging with Request-Scoped Child Loggers
category: logging_system
scope:
    - '**'
source_files:
    - packages/logger/src/index.ts
    - packages/logger/package.json
    - apps/api/src/plugins/request-tracker.ts
    - apps/api/src/app.ts
    - apps/api/src/index.ts
    - apps/worker/src/processors/ingestion.ts
    - apps/worker/src/processors/normalization.ts
    - apps/worker/src/queues/queue-manager.ts
    - apps/worker/src/app.ts
    - apps/worker/src/index.ts
---

## System Overview

The Exosquad monorepo uses a single shared logging package, `@exosquad/logger`, built on **Pino** (`pino ^9.5.0`) for structured JSON logging. The package is consumed by both the Fastify API server (`apps/api`) and the BullMQ worker (`apps/worker`), providing a consistent logging surface across services.

## Key Files

- `packages/logger/src/index.ts` — sole source file; creates the Pino root logger and exposes `createChildLogger`.
- `packages/logger/package.json` — declares `pino` and `pino-pretty` as dependencies.
- `apps/api/src/plugins/request-tracker.ts` — Fastify plugin that attaches request-scoped child loggers to every HTTP request.
- `apps/api/src/app.ts`, `apps/api/src/index.ts` — import the root `logger` singleton.
- `apps/worker/src/app.ts`, `apps/worker/src/index.ts`, `apps/worker/src/queues/queue-manager.ts` — import the root `logger` singleton.
- `apps/worker/src/processors/ingestion.ts`, `apps/worker/src/processors/normalization.ts` — create per-job child loggers via `createChildLogger`.

## Architecture & Conventions

### Root Logger Initialization

The root logger is created once in `packages/logger/src/index.ts`:

```ts
const level = process.env.LOG_LEVEL || "info";
export const logger = pino({
  level,
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" } }
    : undefined,
  serializers: { err: pino.stdSerializers.err },
  base: { service: "exosquad" },
});
```

Key design points:
- **Log level** is driven by `LOG_LEVEL` env var (default `info`).
- **Pretty printing** (`pino-pretty`) is enabled only when `NODE_ENV !== "production"`; production logs are plain newline-delimited JSON for aggregation.
- **Error serialization** uses `pino.stdSerializers.err` so thrown errors are emitted as structured objects rather than stringified stacks.
- **Base context** includes `service: "exosquad"` on every log line.

### Child Logger Pattern

Consumers never call `pino.child()` directly. Instead they use the exported factory:

```ts
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return logger.child(bindings);
}
```

This centralizes child creation and ensures all bound fields propagate consistently.

### Request-Scoped Context (API)

The Fastify `requestTrackerPlugin` (`apps/api/src/plugins/request-tracker.ts`) runs an `onRequest` hook that:
1. Resolves `x-request-id` from the incoming header or generates one via `crypto.randomUUID()`.
2. Creates a child logger bound to `{ requestId, method, url }`.
3. Attaches it to `request.log` and `request.requestId` for downstream route handlers.

This means every HTTP request's logs carry a stable `requestId` plus the HTTP verb and URL, enabling end-to-end tracing across the API layer.

### Job-Scoped Context (Worker)

BullMQ job processors follow the same pattern: each processor (`ingestion.ts`, `normalization.ts`) calls `createChildLogger({ jobId, ... })` at the start of its handler, so all logs emitted during a job's lifecycle are grouped under that job's identifier.

### Consumption Across Services

- `apps/api` imports the root `logger` in `app.ts` and `index.ts` for startup/shutdown events, and uses `createChildLogger` inside the request tracker.
- `apps/worker` imports the root `logger` in `app.ts` and `index.ts`, and uses `createChildLogger` in each queue processor.
- `apps/worker/src/queues/queue-manager.ts` uses the root logger for queue lifecycle events.

## Conventions & Constraints

- **Single logger entry point**: All logging goes through `@exosquad/logger`; direct `import pino` is not used in application code.
- **Structured JSON output**: Production logs are newline-delimited JSON (no pretty-print transport) for ingestion by log aggregators.
- **Environment-driven level**: `LOG_LEVEL` controls minimum severity; default is `info`.
- **Service identity**: Every log line carries `service: "exosquad"` via Pino's `base` option.
- **Error objects are serialized**: Errors passed to log methods are serialized via `pino.stdSerializers.err` rather than being coerced to strings.
- **Context propagation via child loggers**: Request-scoped and job-scoped context is propagated by creating child loggers with bound fields (`requestId`, `method`, `url`, `jobId`, etc.) rather than passing a logger instance around manually.
- **No custom sinks or transports beyond Pino defaults**: The package does not define additional transports, formatters, or log routing rules — it relies on Pino's stdout output and environment-based pretty-print toggle.