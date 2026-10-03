---
kind: external_dependency
name: PostgreSQL 16 — Primary Relational Store
slug: postgresql
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
source_files:
    - docker-compose.yml
    - packages/database/prisma/schema.prisma
---

### Identity
PostgreSQL 16 (`postgres:16-alpine` image) is the sole relational database.

### Role in EXOSQUAD
Houses all persistent domain state: tenants, users, sources, observations, products, product variants, evidence, jobs, API connections, and audit logs. Every table carries a `tenantId` foreign key for multi-tenancy isolation.

### Integration points
- `docker-compose.yml` defines the `exosquad-postgres` service on port 5432 with volume-backed data.
- `packages/database/prisma/schema.prisma` declares `provider = "postgresql"` and reads the connection string from `DATABASE_URL`.
- Prisma migrations live under `packages/database/prisma/migrations/` and are deployed via `pnpm db:migrate` / `db:migrate:dev`.

### Durable usage model
- Schema evolution goes through Prisma migrations; never hand-edit tables directly.
- All queries must scope by `tenantId`; tenant isolation is enforced at both application and DB level.
- Observations are append-only (never overwritten); every observation preserves raw payload, URL, retrieval timestamp, content hash, parser version, provenance, and confidence.

Verify exact migration commands against the repo's `package.json` scripts.