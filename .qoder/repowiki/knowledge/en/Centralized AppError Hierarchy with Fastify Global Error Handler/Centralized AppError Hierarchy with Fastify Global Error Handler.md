---
kind: error_handling
name: Centralized AppError Hierarchy with Fastify Global Error Handler
category: error_handling
scope:
    - '**'
source_files:
    - packages/common/src/index.ts
    - apps/api/src/app.ts
    - apps/api/test/unit/errors.test.ts
    - apps/api/src/plugins/auth.ts
    - apps/api/src/routes/sources.ts
    - apps/api/src/services/auth.ts
---

## Approach

The Exosquad monorepo uses a **centralized error hierarchy** defined in the shared `@exosquad/common` package, combined with a **single Fastify global error handler** that translates domain errors into uniform JSON responses. There is no use of `try/catch`/`catch` chains for normal control flow — business logic throws typed `AppError` subclasses, and the HTTP layer converts them to status-coded JSON.

## Key Files

- `packages/common/src/index.ts` — defines the entire error class hierarchy and exports it as part of the shared types package.
- `apps/api/src/app.ts` — registers Fastify's `setErrorHandler`, which is the single point where all unhandled errors are converted to HTTP responses.
- `apps/api/test/unit/errors.test.ts` — unit tests asserting every subclass' default status code, code string, message shape, and `instanceof AppError` / `instanceof Error` guarantees.
- `apps/api/src/plugins/auth.ts` — example consumer throwing `UnauthorizedError`.
- `apps/api/src/routes/sources.ts` — example consumer throwing `NotFoundError`.
- `apps/api/src/services/auth.ts` — example consumer throwing `ConflictError`, `UnauthorizedError`, `NotFoundError`.

## Error Hierarchy (`@exosquad/common`)

All application errors extend a single base class:

```ts
class AppError extends Error {
  statusCode: number;
  code: string;
  context?: Record<string, unknown>;
  toJSON(): { error: { code; message; context? } }
}
```

Concrete subclasses (all exported from `packages/common/src/index.ts`):

| Class | Default `statusCode` | Default `code` | Purpose |
|---|---:|---|---|
| `AppError` | 500 | `INTERNAL_ERROR` | Base type; also usable directly for custom codes |
| `NotFoundError` | 404 | `NOT_FOUND` | Missing resource, carries `{ resource, id }` context |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` | Auth failures (missing/expired token, bad credentials) |
| `ForbiddenError` | 403 | `FORBIDDEN` | Permission denied |
| `ConflictError` | 409 | `CONFLICT` | Duplicate/conflicting data |
| `ValidationError` | 400 | `VALIDATION_ERROR` | Zod/validation failures, carries `details` |
| `RateLimitError` | 429 | `RATE_LIMITED` | Rate limiting, optional `retryAfter` context |
| `SourceError` | 502 | `SOURCE_ERROR` | External source failures, carries `sourceId` plus extra context |

Each subclass sets `this.name` to its own class name and calls `super(message, statusCode, code, context)` so the base constructor wires `Object.setPrototypeOf(this, new.target.prototype)` for correct prototype chain behavior.

## API Error Handling Flow (`apps/api/src/app.ts`)

The `App.registerErrorHandling()` method installs one Fastify `setErrorHandler` that processes errors in this exact order:

1. **Fastify schema validation errors** — detected via `error.validation`. Logged at `error` level with `{ err, url }`, returns `400` with body `{ error: { code: "VALIDATION_ERROR", message, details: error.validation } }`.
2. **Known application errors** — detected via `error instanceof AppError`. Logged at `error` level with `{ err, url, statusCode }`, returns `reply.status(error.statusCode).send(error.toJSON())`.
3. **Unknown/unexpected errors** — logged at `error` level with `{ err, url }`, returns `500` with body `{ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } }`.

This is the only place in the API where raw `Error` objects reach the response layer; routes and services throw typed errors and never construct response bodies themselves.

## Worker Process

The worker (`apps/worker/src/app.ts`) does not define an equivalent global error handler. It exposes a minimal health server on port `config.PORT + 1` and delegates job processing to `QueueManager`. Errors inside BullMQ processors are not intercepted by a dedicated handler in this file.

## Conventions Observed

- Domain code throws typed error classes rather than returning error objects or using `Result<T>` patterns.
- Every error subclass has a stable, uppercase `code` string used as the machine-readable error identifier in JSON responses.
- Human-readable messages are kept in `message`; structured diagnostic data goes in `context` (and `details` for `ValidationError`).
- The `toJSON()` contract is `{ error: { code, message, context? } }`, which the global handler sends verbatim for `AppError` instances.
- Unknown errors are never leaked to clients — the global handler replaces them with a generic `INTERNAL_ERROR` payload.
- Validation errors from Zod/Fastify are normalized through the same `VALIDATION_ERROR` code path as `ValidationError` instances.
- Tests in `apps/api/test/unit/errors.test.ts` assert that each subclass produces its documented default `statusCode`, `code`, and `message`, and that every subclass satisfies both `instanceof AppError` and `instanceof Error`.

## Rules Enforced by Code

- All application exceptions must be instances of `AppError` (or one of its subclasses) so the global Fastify handler can branch on `instanceof AppError` — enforced by the handler's dispatch logic in `apps/api/src/app.ts:54`.
- Every subclass must call the `AppError` constructor with `(message, statusCode, code, context?)` and set `this.name` to the subclass name — enforced by the base constructor's `Object.setPrototypeOf(this, new.target.prototype)` and by the test suite asserting `instanceof AppError` for each subclass (`apps/api/test/unit/errors.test.ts:125-132`).
- Unknown errors must not expose internal stack traces or field values to callers — enforced by the catch-all branch in `apps/api/src/app.ts:62-69` which always returns the fixed `INTERNAL_ERROR` payload.