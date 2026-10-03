---
kind: external_dependency
name: Redis 7 — BullMQ Job Queue Backend
slug: redis
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
source_files:
    - docker-compose.yml
    - apps/worker/package.json
---

### Identity
Redis 7 (`redis:7-alpine`) is the job queue backend used by BullMQ.

### Role in EXOSQUAD
Stores queued jobs for the worker process across two queues: `ingestion` (rate-limited to 50/min) and `normalization`. Provides retries, exponential backoff, dead-letter retention, and graceful shutdown semantics.

### Integration points
- `docker-compose.yml` exposes Redis on port 6379 as `exosquad-redis` with a named volume.
- `apps/worker/package.json` depends on `bullmq` + `ioredis`.
- Worker health endpoint checks queue connectivity.

### Durable usage model
- Jobs include idempotency keys, max attempts (default 3), and structured logging keyed by `jobId`, `queue`, and `duration`.
- The queue layer is separate from the DB; persistence of job metadata lives in the `jobs` PostgreSQL table while execution state lives in Redis.

Verify exact BullMQ client configuration against the worker source.