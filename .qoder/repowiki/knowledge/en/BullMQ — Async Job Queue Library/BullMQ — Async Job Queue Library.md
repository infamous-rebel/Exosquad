---
kind: external_dependency
name: BullMQ — Async Job Queue Library
slug: bullmq
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
source_files:
    - apps/worker/package.json
---

### Identity
BullMQ v5 is the in-process job queue library backed by Redis.

### Role in EXOSQUAD
Defines the ingestion and normalization queues consumed by the worker process. Handles retry policy (exponential backoff with jitter), concurrency limits, dead-letter queues, and graceful shutdown.

### Integration points
- `apps/worker/package.json` depends on `bullmq` and `ioredis`.
- Two queues are declared: `ingestion` (rate-limited 50/min) and `normalization`.
- Each job persists its lifecycle state to the `jobs` PostgreSQL table.

### Durable integration pattern
- Workers register processors per queue name; failures propagate with structured logs including `jobId`, `queue`, and `duration`.
- Long-running ingestion is always asynchronous — never handled inline in an HTTP handler.

Verify exact queue names and processor registration against the worker source.