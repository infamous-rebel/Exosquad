# AGENTS.md — EXOSQUAD Engineering Constitution

> This file is the permanent engineering constitution for EXOSQUAD.
> Every agent, contributor, and AI assistant MUST follow these rules.
> Last updated: Phase 1 Foundation

---

## 1. PROJECT OVERVIEW

EXOSQUAD is a production SaaS platform for foreign-product intelligence, supply discovery, demand intelligence, authenticity analysis, logistics, landed-cost analysis, and reseller decision intelligence for Bangladesh.

This is a **real commercial product** — not a demo, prototype, MVP, or proof of concept. Every implemented feature must be genuinely functional, persisted, testable, and deployable.

---

## 2. ENGINEERING PRINCIPLES

### 2.1 No Fabricated Data
- NEVER generate fake products, suppliers, market statistics, or "live" data
- NEVER create placeholder APIs or hardcoded demonstration records
- External data must come from real sources or user-configured APIs
- Every conclusion must trace to evidence

### 2.2 Deterministic Where Possible, Intelligent Where Necessary
- Currency conversion, unit conversion, landed cost → deterministic
- Product resolution, authenticity analysis, demand intelligence → AI-assisted
- NEVER present inference as confirmed fact

### 2.3 Evidence Chain
- Every observation preserves: raw source data, URL, retrieval timestamp, content hash, parser version
- Historical observations are NEVER overwritten
- Every important conclusion links back to its evidence

### 2.4 Resilience by Default
- External sources WILL fail (timeout, 429, 403, 5xx, schema changes)
- One failed source must NEVER collapse the system
- All workers require: retries, exponential backoff, jitter, rate limiting, circuit breakers, timeouts, heartbeats, leases, checkpointing, idempotency, dead-letter queues, graceful shutdown

---

## 3. REPOSITORY STRUCTURE

```
exosquad/
├── apps/
│   ├── api/                    # Fastify HTTP API server
│   │   ├── src/
│   │   │   ├── plugins/        # Fastify plugins (auth, rate-limit, security, tracking)
│   │   │   ├── routes/         # HTTP route handlers
│   │   │   ├── services/       # Business logic
│   │   │   ├── app.ts          # Fastify app class
│   │   │   └── index.ts        # Entry point
│   │   └── test/
│   │       ├── unit/
│   │       └── integration/
│   └── worker/                 # BullMQ job processor
│       ├── src/
│       │   ├── processors/     # Job processor functions
│       │   ├── queues/         # Queue management
│       │   ├── app.ts          # Worker app class
│       │   └── index.ts        # Entry point
│       └── test/
├── packages/
│   ├── database/               # Prisma schema, client, migrations
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       └── index.ts
│   ├── common/                 # Shared types, errors, validation schemas
│   │   └── src/
│   │       └── index.ts
│   ├── config/                 # Environment validation (Zod)
│   │   └── src/
│   │       └── index.ts
│   └── logger/                 # Pino structured logger
│       └── src/
│           └── index.ts
├── docker-compose.yml          # Local dev infrastructure
├── turbo.json                  # Build orchestration
├── tsconfig.base.json          # Shared TypeScript config
├── .env                        # Development environment (gitignored)
└── AGENTS.md                   # THIS FILE
```

---

## 4. TECHNOLOGY STACK

| Concern | Technology | Version |
|---------|-----------|---------|
| Language | TypeScript (strict) | ^5.6 |
| Runtime | Node.js | >=20 |
| Package Manager | pnpm | ^9.0 |
| Monorepo | Turborepo | ^2.3 |
| API Server | Fastify | ^5.1 |
| Database | PostgreSQL | 16 |
| ORM | Prisma | ^5.22 |
| Queue | BullMQ + Redis | ^5.25 / 7 |
| Auth | jose (JWT) | ^5.9 |
| Password | bcryptjs | ^2.4 |
| Logger | Pino | ^9.5 |
| Validation | Zod | ^3.23 |
| Testing | Vitest | ^2.1 |
| Dev Runner | tsx | ^4.19 |
| Linting | ESLint 9 flat config | ^9.15 |

---

## 5. CODING RULES

### 5.1 TypeScript
- Strict mode is non-negotiable
- No `any` types (warn level)
- Use `consistent-type-imports`
- All imports must use `.js` extension for ESM compatibility
- No unused variables or parameters (prefix with `_` if intentionally unused)

### 5.2 Error Handling
- All errors extend `AppError` from `@exosquad/common`
- Errors include: statusCode, code, message, optional context
- Never expose internal error details to clients
- Log errors with structured context (requestId, tenantId, etc.)

### 5.3 Database
- All tables are tenant-scoped (multi-tenancy)
- Use Prisma for all database access
- Migrations are forward-only in production
- Never drop columns with data without explicit approval
- All tables have `createdAt` and `updatedAt` timestamps
- Use `cuid()` for primary keys

### 5.4 API Design
- RESTful routes under `/api/v1/`
- All responses follow consistent error format: `{ error: { code, message, context? } }`
- Pagination: `{ data: [], pagination: { page, limit, total, totalPages } }`
- Authentication via Bearer token (JWT)
- Rate limiting on all endpoints
- Security headers on all responses

### 5.5 Testing
- Unit tests for all business logic
- Integration tests for API routes
- Test failure conditions, not only happy paths
- Test files: `*.test.ts` in `test/` directory
- Mock external dependencies, never call real services in tests

### 5.6 Security
- Never hardcode secrets — use environment variables
- Never expose provider credentials to clients
- Validate all input with Zod schemas
- Tenant isolation in every query
- Audit log for significant actions
- Password hashing: bcrypt with 12 rounds minimum

---

## 6. DATA PRINCIPLES

### 6.1 Immutability of Observations
- Raw observations are NEVER modified after creation
- If data changes, create a new observation
- Preserve: raw payload, URL, retrieval timestamp, content hash, parser version

### 6.2 Product Identity
- Distinguish: brand, product, SKU, variant, pack size, volume, weight, country, barcode/GTIN
- NEVER merge products merely because names look similar
- Confidence scoring for all entity resolutions

### 6.3 Authenticity Separation
- Authentic products remain separated from: unknown, generic alternatives, lookalikes, potential counterfeit, counterfeit evidence
- Visual similarity alone is NOT sufficient evidence

---

## 7. MULTI-TENANCY

- Every query MUST filter by `tenantId`
- Users can only access their tenant's data
- Foreign keys enforce tenant isolation at the database level
- API authentication extracts `tenantId` from JWT

---

## 8. UNIVERSAL CONNECTOR ARCHITECTURE

The system supports arbitrary data sources through a universal connector abstraction:
- Each source has a `connectorType` and `config` (JSON)
- Config includes: base URL, auth, headers, pagination, rate limits, retry policy, field mapping
- The core platform never depends on a specific provider
- External schemas map into EXOSQUAD's canonical data model

---

## 9. JOB PROCESSING

### Queue Names
- `ingestion` — fetching data from external sources
- `normalization` — transforming raw observations to canonical model
- (Phase 2+ will add: `analysis`, `outreach`, `alerting`)

### Job Requirements
- All jobs have: priority, attempts, backoff strategy, idempotency key
- Failed jobs go to dead-letter queue after max attempts
- Workers emit structured logs with jobId, queue, duration
- Graceful shutdown: finish current job, don't accept new ones

---

## 10. OBSERVABILITY

- Structured JSON logging via Pino
- Every request gets a unique `requestId`
- Child loggers carry context (requestId, tenantId, jobId)
- Health endpoints: `/health` (liveness) and `/health/ready` (readiness)
- Track: application health, worker health, queue depth, ingestion latency, source failures, retry counts

---

## 11. DEPLOYMENT

- Docker Compose for local development
- Production deployment: TBD (Phase 2)
- Environment variables validated at startup via Zod
- Application refuses to start with missing/invalid configuration

---

## 12. PHASE TRACKING

### Phase 1 — Foundation (CURRENT)
- [x] Repository structure
- [x] Technology stack
- [x] Package/workspace configuration
- [x] Database schema and migrations
- [x] API server with health, auth, security
- [x] Worker foundation with queue management
- [x] Testing foundation
- [x] Docker Compose for local development
- [x] Architecture documentation

### Phase 2 — Intelligence Pipeline
- [ ] Universal connector framework
- [ ] Ingestion pipeline (real HTTP fetching)
- [ ] Normalization pipeline (schema mapping)
- [ ] Product entity resolution
- [ ] Evidence chain persistence
- [ ] Source scheduling (cron-based)
- [ ] Source health monitoring

### Phase 3 — Product Intelligence
- [ ] Demand intelligence engine
- [ ] Supply graph analysis
- [ ] Authenticity classification
- [ ] Logistics research
- [ ] Landed cost calculations
- [ ] Market economics
- [ ] AI research orchestration

### Phase 4 — User Experience
- [ ] Landing page
- [ ] Dashboard
- [ ] Source management UI
- [ ] Product explorer
- [ ] Alert configuration
- [ ] Supplier outreach

---

## 13. AGENT OWNERSHIP RULES

1. **Never claim functionality is complete when it is mocked, stubbed, hardcoded, or only visually implemented**
2. **After each change: build, lint, type-check, run tests, verify**
3. **Do not build the entire product in one generation — work in verified phases**
4. **When a phase is genuinely working and verified, STOP and report**
5. **External data must NEVER be fabricated**
6. **AI is an interface and reasoning layer over infrastructure — not the product itself**
7. **Deterministic calculations must remain deterministic**
