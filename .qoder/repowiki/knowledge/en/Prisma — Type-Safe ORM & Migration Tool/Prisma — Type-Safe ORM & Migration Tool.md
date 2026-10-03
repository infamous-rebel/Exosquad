---
kind: external_dependency
name: Prisma — Type-Safe ORM & Migration Tool
slug: prisma
category: external_dependency
category_hints:
    - sdk_real_api
scope:
    - '**'
source_files:
    - packages/database/prisma/schema.prisma
---

### Identity
Prisma is the type-safe ORM and migration tool over PostgreSQL.

### Role in EXOSQUAD
Defines the canonical schema (Tenant, User, Source, Observation, Product, ProductVariant, Evidence, Job, ApiConnection, AuditLog) and generates the typed client consumed by other packages.

### Integration points
- Client generation: `pnpm db:generate` → `pnpm --filter @exosquad/database generate`.
- Migrations: `pnpm db:migrate` / `db:migrate:dev` → `pnpm --filter @exosquad/database migrate:deploy` / `migrate:dev`.

### Correct integration shape
- Use the generated Prisma client from `@exosquad/database`; do not construct raw SQL or bypass the client for new models.
- Schema changes go through Prisma migrations, not direct SQL edits.
- Tenant-scoped queries must filter by `tenantId` on every model.

Verify exact client import path and generated types against the consuming package.