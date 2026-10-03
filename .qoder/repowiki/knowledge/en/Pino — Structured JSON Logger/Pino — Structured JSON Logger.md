---
kind: external_dependency
name: Pino — Structured JSON Logger
slug: pino
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
---

### Identity
Pino is the structured JSON logging library used throughout EXOSQUAD.

### Role in EXOSQUAD
Produces production-ready JSON logs with child loggers bound to context (`requestId`, `tenantId`, `jobId`). Pretty-printed in development via `pino-pretty`.

### Integration points
- Exposed as the `@exosquad/logger` shared package.
- Used by both API and worker processes.

### Durable usage pattern
- Create child loggers scoped to request/job context rather than passing a logger instance around.
- All log entries carry correlation IDs for distributed tracing across API → worker.

Verify exact child logger creation API against the logger package.