# EXOSQUAD Architecture

> Production SaaS platform for foreign-product intelligence, supply discovery,
> demand intelligence, authenticity analysis, logistics, landed-cost analysis
> and reseller decision intelligence for Bangladesh.

---

## 1. System Overview

EXOSQUAD is a multi-tenant intelligence platform that ingests data from real external sources, normalizes it into a canonical model, resolves product entities, and provides actionable supply/demand/authenticity intelligence.

The system follows a pipeline architecture:

```
REAL SOURCES → INGESTION → RAW OBSERVATIONS → NORMALIZATION
→ ENTITY RESOLUTION → PRODUCT GRAPH → ANALYSIS → OPPORTUNITY
```

AI is an interface and reasoning layer over this infrastructure. Deterministic calculations remain deterministic. External data is never fabricated.

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | TypeScript (strict) | Type safety across entire stack |
| Runtime | Node.js ≥20 | Mature async I/O, excellent for ingestion workloads |
| Package Manager | pnpm + Turborepo | Fast, disk-efficient monorepo builds |
| API Server | Fastify v5 | High-performance, schema validation, plugin architecture |
| Database | PostgreSQL 16 | ACID, JSONB for flexible data, battle-tested |
| ORM | Prisma | Type-safe queries, migrations, excellent DX |
| Queue | BullMQ + Redis 7 | Reliable job processing, retries, rate limiting, DLQ |
| Auth | jose (JWT) | Standard-compliant, no vendor lock-in |
| Logger | Pino | Structured JSON logging, Fastify-native integration |
| Validation | Zod | Runtime type safety, composable schemas |
| Testing | Vitest | Fast, TypeScript-native, workspace support |
| Local Dev | Docker Compose | Consistent PostgreSQL + Redis without local installs |

---

## 3. Service Boundaries

### 3.1 API Server (`apps/api`)
- Fastify HTTP server
- Handles all client requests
- Authentication and authorization
- Rate limiting and security headers
- Request tracking with correlation IDs
- Routes: health, auth, sources, (Phase 2+: products, analysis, alerts)

### 3.2 Worker (`apps/worker`)
- BullMQ job processors
- Runs ingestion, normalization, and analysis pipelines
- Separate health endpoint for monitoring
- Independent scaling from API server
- Graceful shutdown with job completion

### 3.3 Shared Packages
- `@exosquad/database` — Prisma schema, client, migrations
- `@exosquad/common` — Error hierarchy, validation schemas, shared types
- `@exosquad/config` — Environment validation (Zod)
- `@exosquad/logger` — Pino structured logger with child logger support

---

## 4. Database Strategy

### 4.1 Multi-Tenancy
Every table includes a `tenantId` foreign key. All queries filter by tenant. Tenant isolation is enforced at both the application and database level.

### 4.2 Core Tables (Phase 1)
| Table | Purpose |
|-------|---------|
| `tenants` | Multi-tenant organizations |
| `users` | Authentication and authorization |
| `sources` | Configurable data ingestion endpoints |
| `observations` | Immutable raw data from sources |
| `products` | Resolved product entities |
| `product_variants` | SKU/variant level detail |
| `evidence` | Provenance chain linking conclusions to sources |
| `jobs` | Async job tracking and persistence |
| `api_connections` | Universal API connector configuration |
| `audit_logs` | Immutable action audit trail |

### 4.3 Data Principles
- Observations are NEVER overwritten — append-only
- Every observation preserves: raw payload, URL, retrieval timestamp, content hash, parser version
- Product identity distinguishes: brand, product, SKU, variant, pack size, volume, weight, country, GTIN
- Confidence scoring for all entity resolutions

---

## 5. Queue Strategy

### 5.1 Queue Architecture
| Queue | Purpose | Concurrency | Rate Limit |
|-------|---------|-------------|------------|
| `ingestion` | Fetch data from external sources | Configurable | 50/min |
| `normalization` | Transform raw → canonical model | Configurable | — |

### 5.2 Job Resilience
All jobs include:
- Exponential backoff with jitter
- Configurable max attempts (default: 3)
- Dead-letter queue after max attempts
- Idempotency keys to prevent duplicate processing
- Structured logging with jobId, queue, duration
- Graceful shutdown (finish current job, don't accept new)

---

## 6. Universal Connector Architecture

The system supports arbitrary data sources through a provider-agnostic connector abstraction:

```
ApiConnection {
  baseUrl, authType, authConfig, headers,
  rateLimit, timeout, retryConfig
}

Source {
  type, connectorType, config (JSON),
  scheduleCron, status
}
```

Connectors handle:
- HTTP method, authentication, headers
- Query parameters, pagination (offset/cursor)
- Rate limiting per source
- Response format parsing and field mapping
- Incremental sync support
- Health checks

External schemas map into EXOSQUAD's canonical data model. The core platform never depends on a specific provider.

---

## 7. Security Architecture

### 7.1 Authentication
- JWT-based (HS256) via `jose` library
- Tokens contain: `sub` (userId), `tenantId`, `role`
- Configurable expiration (default: 24h)
- Bearer token in Authorization header

### 7.2 Authorization
- Role-based: `owner`, `admin`, `member`, `viewer`
- Tenant isolation on every query
- Protected routes via `authenticate` preHandler

### 7.3 Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security` (production only)

### 7.4 Rate Limiting
- Per-IP rate limiting (100 req/min default)
- Rate limit headers on every response
- 429 response with `Retry-After`

### 7.5 Password Security
- bcrypt with 12 rounds
- Minimum 8 characters

---

## 8. Observability

### 8.1 Structured Logging
- Pino JSON output for production log aggregation
- Pretty-print in development
- Child loggers with bound context (requestId, tenantId, jobId)

### 8.2 Request Tracking
- Every request gets a unique `requestId` (UUID or `X-Request-Id` header)
- All log entries within a request carry the requestId
- Enables distributed tracing across services

### 8.3 Health Endpoints
| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Liveness probe — process is running |
| `GET /health/ready` | Readiness probe — dependencies are reachable |
| Worker `GET /health` | Worker liveness |
| Worker `GET /health/ready` | Queue connectivity check |

---

## 9. Testing Strategy

| Level | Scope | Location |
|-------|-------|----------|
| Unit | Business logic, errors, validation | `test/unit/` |
| Integration | API routes with real Fastify | `test/integration/` |
| Database | Prisma queries against test DB | `test/integration/` |
| Worker | Job processors with mocked dependencies | `test/unit/` |

### Testing Principles
- Test failure conditions, not only happy paths
- Mock external dependencies
- Never call real services in tests
- Use testcontainers for database integration tests (Phase 2)

---

## 10. Deployment Architecture

### 10.1 Local Development
```bash
# Start infrastructure
docker compose up -d    # PostgreSQL 16 + Redis 7

# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate:dev

# Start API server
pnpm --filter @exosquad/api dev

# Start worker (separate terminal)
pnpm --filter @exosquad/worker dev
```

### 10.2 Production (Phase 2)
- Container-based deployment
- Separate API and worker processes
- Managed PostgreSQL and Redis
- Environment variables validated at startup
- Zero-downtime deployments

---

## 11. Phase 1 Deliverables

### Genuinely Operational
- [x] Monorepo structure with pnpm + Turborepo
- [x] TypeScript strict mode across all packages
- [x] PostgreSQL schema with 10 tables (multi-tenancy, auth, sources, observations, products, evidence, jobs, API connections, audit)
- [x] Prisma migrations
- [x] Fastify API server with health endpoints
- [x] JWT authentication (signup, login, protected routes)
- [x] Rate limiting and security headers
- [x] Request tracking with correlation IDs
- [x] BullMQ worker with ingestion and normalization queues
- [x] Structured logging with Pino
- [x] Environment validation with Zod
- [x] Error hierarchy with consistent API error format
- [x] Unit tests for errors and validation
- [x] Integration tests for health and auth routes
- [x] Docker Compose for local PostgreSQL + Redis
- [x] Architecture documentation
- [x] AGENTS.md engineering constitution

### Remaining for Phase 2
- [ ] Universal connector framework (HTTP fetching, response parsing)
- [ ] Ingestion pipeline (real data fetching from sources)
- [ ] Normalization pipeline (schema mapping to canonical model)
- [ ] Product entity resolution (brand, SKU, GTIN matching)
- [ ] Evidence chain persistence
- [ ] Source scheduling (cron-based ingestion)
- [ ] Source health monitoring and alerting
- [ ] Redis-backed rate limiting (replace in-memory)
- [ ] Testcontainers for integration tests
- [ ] CI/CD pipeline
- [ ] Production deployment configuration
