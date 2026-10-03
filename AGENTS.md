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

### Phase 1 — Foundation ✅
- [x] Repository structure
- [x] Technology stack
- [x] Package/workspace configuration
- [x] Database schema and migrations
- [x] API server with health, auth, security
- [x] Worker foundation with queue management
- [x] Testing foundation
- [x] Docker Compose for local development
- [x] Architecture documentation

### Phase 2 — Intelligence Pipeline ✅
- [x] Universal connector framework
- [x] Ingestion pipeline (real HTTP fetching)
- [x] Normalization pipeline (schema mapping)
- [x] Product entity resolution
- [x] Evidence chain persistence
- [x] Source scheduling (cron-based)
- [x] Source health monitoring

### Phase 3 — Product Intelligence ✅
- [x] Demand intelligence engine
- [x] Supply graph analysis
- [x] Authenticity classification
- [x] Logistics research
- [x] Landed cost calculations
- [x] Market economics
- [x] AI research orchestration

### Phase 4 — Identity & Organization ✅
- [x] Identity resolution (product merging, conflict resolution)
- [x] Organization entity resolution (supplier/brand merging)
- [x] Evidence & provenance chain (claims, provenance graph)
- [x] Calculation persistence with versioning

### Phase 5 — Demand & Trend Intelligence ✅
- [x] Demand signal time-series architecture
- [x] 8 deterministic calculation engines
- [x] Confidence scoring with data quality
- [x] Full provenance chain
- [x] Bangladesh geographic filtering

### Phase 6 — Evidence & Provenance ✅
- [x] Evidence claims system
- [x] Provenance graph edges
- [x] Conflict detection and preservation
- [x] Calculation versioning

### Phase 7 — Demand & Trend Intelligence Engine ✅
- [x] DemandSignal time-series with deduplication
- [x] DemandCalculation versioned snapshots
- [x] 8 calculation engines (growth, acceleration, velocity, trend, momentum, persistence, volatility, seasonality)
- [x] Confidence model (signal, source, persistence, completeness, agreement)
- [x] Full provenance: calculation → signals → observations → sources

### Phase 8 — Decision Intelligence & Reseller Opportunity Engine ✅
- [x] Opportunity schema (5 models + 1 enum)
- [x] Pure deterministic calculation engine
- [x] SHA-256 content hash deduplication
- [x] Evidence provenance chain
- [x] Risk assessment (8 types)
- [x] Action recommendations (9 types)
- [x] Opportunity classification (7 types)
- [x] Status lifecycle (DETECTED → WATCH → ACTIONABLE → EXPIRED)
- [x] RESTful API (8 endpoints)
- [x] Worker processor (4 job types)
- [x] Opportunity scheduler (6-hour cycle)
- [x] 35 unit tests + 18 integration tests

### Phase 8 (Original Roadmap) — Authenticity Intelligence Engine ✅
- [x] Authenticity schema (5 models + 1 enum: AuthenticityStatus)
- [x] 40+ signal types across 8 categories (product, brand, seller, supplier, listing, document, pricing, cross-source)
- [x] Pure deterministic scoring engine (identity 25%, brand 15%, 6×10% categories)
- [x] Confidence engine (quantity 20%, quality 25%, independence 20%, completeness 15%, consistency 20%)
- [x] Score ≠ Confidence — independent dimensions
- [x] Contradiction detection (explicit conflicts + implicit content hash divergence)
- [x] SHA-256 input hash deduplication
- [x] 8 status classifications (UNASSESSED → CONTRADICTED)
- [x] 5 risk types (IDENTITY_CONTRADICTION, MISSING_EVIDENCE, PRICE_ANOMALY, SOURCE_CONFLICT, CONTENT_REUSE)
- [x] Full provenance: Assessment → Signal → Evidence → Source
- [x] RESTful API (9 endpoints under /api/v1/authenticity)
- [x] Worker processor (4 job types: detect, recalculate, refresh, expire)
- [x] Authenticity scheduler (12-hour cycle)
- [x] 30 unit tests + 24 integration tests
- [x] Backward compatible with existing Phase 8 Opportunity engine

### Phase 9 — Supply-Chain Tracing & Provenance Graph Engine ✅
- [x] Supply-chain schema (10 models + 4 Prisma enums: SupplyChainNodeType, SupplyChainEdgeType, SupplyChainRelationshipStatus, SupplyChainConflictResolutionState)
- [x] 29 node types, 30 edge types, 7 relationship statuses
- [x] Pure deterministic confidence engine (6 dimensions: evidence 25%, independence 20%, identity 20%, directness 15%, corroboration 10%, freshness 10%)
- [x] 5-dimensional completeness model (node, edge, evidence, identity, temporal)
- [x] SHA-256 content hash deduplication (edges, observations, assessments)
- [x] Deterministic inputHash — pure SHA-256 fingerprint, no timestamp contamination
- [x] Assessment version history (monotonically increasing version per subject)
- [x] 7 anomaly types (SELF_LOOP, CYCLE_DETECTED, CONTRADICTORY_MANUFACTURER, CONTRADICTORY_ORIGIN, TEMPORAL_OVERLAP, SUSPICIOUS_SHORTCUT, INVALID_RELATIONSHIP)
- [x] 7 conflict types with resolution states (OPEN, RESOLVED, SUPERSEDED, UNRESOLVED)
- [x] BFS path discovery with bounded depth, cycle detection, and traversal filters (nodeTypes, edgeTypes, statuses, minimumConfidence)
- [x] Canonical entity references with partial unique index (tenantId + nodeType + canonicalEntityType + canonicalEntityId WHERE NOT NULL)
- [x] Concurrency-safe upsert patterns for edges, observations, evidence links
- [x] asOf temporal reconstruction for historical graph queries
- [x] Full relationship filters (sourceId, country, productId, sellerId, supplierId, manufacturerId, hasEvidence, asOf)
- [x] Full provenance: Assessment → Decision → Edge → Observation → Evidence → Source
- [x] RESTful API (20+ endpoints under /api/v1/supply-chain)
- [x] Worker processor (6 job types: build, recalculate, refresh, detect-conflicts, detect-anomalies, expire)
- [x] Supply-chain scheduler (12-hour cycle)
- [x] 42 unit tests + 36 integration tests (including 10 adversarial tests)
- [x] Backward compatible with all Phase 2–8 implementations

### Phase 10 — Logistics & Routing Intelligence ✅
- [x] Logistics schema (10 models + 5 Prisma enums: LogisticsNodeType, LogisticsLegType, LogisticsRouteStatus, LogisticsAvailabilityStatus, LogisticsConflictResolutionState)
- [x] Common package (logistics enums, types, LOGISTICS_CONFIG with confidence weights, temporal decay, risk thresholds, traversal defaults)
- [x] Pure deterministic logistics engine (logistics-engine.ts — content hashing, leg confidence, route confidence, transit duration aggregation, BFS route discovery, risk detection (16 types), anomaly detection (12 types), contradiction detection, completeness metrics)
- [x] Logistics intelligence service (logistics-intelligence.ts — orchestrator: assess, recalculate, CRUD, graph queries, route discovery, relationship queries, graph builder from Phase 9)
- [x] RESTful API (17+ endpoints under /api/v1/logistics)
- [x] Worker processor (7 job types: build, calculate-routes, recalculate, detect-conflicts, detect-anomalies, refresh, expire)
- [x] Logistics scheduler (12-hour cycle)
- [x] Queue registration in queue-manager.ts
- [x] Unit tests (45 tests covering all engine functions)
- [x] Integration tests (33 tests including 12 adversarial scenarios)
- [x] Phase 9 integration: LogisticsNode references SupplyChainNode via canonical references — no duplication
- [x] Unknown transit times preserved as UNKNOWN (never substituted as zero)
- [x] Confidence, risk, and completeness as independent dimensions
- [x] Deterministic content hashing (SHA-256, no timestamp contamination)
- [x] Monotonic version column for assessment history
- [x] Tenant isolation enforced at application layer

### Phase 11 — Landed Cost, Pricing & Margin Intelligence ✅
- [x] Pricing schema (12 Prisma enums + 7 models: PriceObservation, CostComponent, LandedCostCalculation, PricingScenario, MarketPriceSnapshot, PricingRisk, PricingAssessment)
- [x] Common package (pricing enums, PRICING_CONFIG with confidence weights, completeness weights, staleness thresholds, comparability rules, scenario rules)
- [x] Pure deterministic pricing engine (pricing-engine.ts — content hashing (6 functions), currency normalization, unit normalization, price comparability, market aggregation (min/max/mean/median/P25/P75/spread/volatility), landed cost calculation (11 categories), margin calculations (gross profit/margin/markup/break-even/target), scenario building (CONSERVATIVE/BASE/UPSIDE), price position, risk detection (19 types), completeness, confidence)
- [x] Pricing intelligence service (pricing-intelligence.ts — orchestrator: assess, recalculate, CRUD for observations/costs/scenarios/landed-costs/market-snapshots, provenance, history)
- [x] RESTful API (20+ endpoints under /api/v1/pricing: assess, list, get, recalculate, landed-costs, scenarios, market-snapshots, observations, cost-components, risks, provenance, history)
- [x] Worker processor (4 job types: assess, recalculate, refresh, expire)
- [x] Pricing scheduler (12-hour cycle)
- [x] Queue registration in queue-manager.ts
- [x] Unit tests (64 tests covering all engine functions)
- [x] Phase 9/10 integration: Uses canonical Supplier IDs, LogisticsRoute IDs — no second identity system
- [x] Unknown ≠ Zero: missing inputs propagate as null/UNKNOWN throughout all calculations
- [x] Negative margin is valid: it is not an error state
- [x] Risk detection explains trigger and affected evidence/input
- [x] No investment-style verdicts: exposes commercial facts, calculations, uncertainty, and risks
- [x] Deterministic content hashing (SHA-256, stable JSON ordering, no timestamp contamination)
- [x] Monotonic version column for assessment history
- [x] Tenant isolation enforced at database/service layer

### Phase 12 — Product Opportunity, Competition & Reseller Viability ✅
- [x] Opportunity schema (6 models: CompetitorObservation, CompetitorSnapshot, DemandOpportunitySnapshot, ProductOppSignal, ProductOppRisk, ResellerViabilityAssessment)
- [x] Common package (PRODUCT_OPP_SIGNAL_TYPES 22-type vocabulary, PRODUCT_OPP_CONFIG with competition/saturation/price-compression/risk thresholds, confidence + completeness weights, opportunity + viability level thresholds)
- [x] Pure deterministic engine (product-opportunity-engine.ts — 5 dimension analyzers, Unknown ≠ Zero score renormalization over known dimensions only, derived margin range as fractions of price, viability score with margin multipliers, 13 threshold-driven signals from the 22-type vocabulary, 12 risk types, 5 market-gap types, viability constraints, 7 SHA-256 hash functions, completeness + confidence models)
- [x] Opportunity ≠ Viability: independent scores, levels, and persistence
- [x] Intelligence service (product-opportunity-intelligence.ts — 11 methods: assess, recalculate, list/get/history, signals, risks, snapshots, observations, create observation, expire)
- [x] RESTful API (13 endpoints under /api/v1/opportunity)
- [x] Worker processor (4 job types: assess, recalculate, refresh, expire) — self-contained, imports only database/logger/common/bullmq
- [x] Queue registration ("product_opportunity") and scheduler (12-hour cycle, 48-hour competitor observation window, 20 jobs/tenant cap, deterministic jobIds)
- [x] Cross-phase canonical references: Phase 7 demand signals/calculations, Phase 9 supply-chain nodes, Phase 10 logistics legs, Phase 11 price observations/landed costs — no second identity system
- [x] Unknown ≠ Zero: unknown dimensions excluded from weighted aggregates and renormalized; no fabricated neutral scores
- [x] Strict signal-type validation: unknown signal values throw, never substituted with a fallback type
- [x] SHA-256 content-hash deduplication for snapshots/signals/risks; monotonic versioned assessments; 14-day staleness expiry
- [x] Unit tests (77 engine tests) + integration tests (24, including adversarial tenant-isolation, renormalization, version monotonicity, hash divergence, dedup, provenance)
- [x] Full regression green: 391/391 unit, 204/204 integration, lint + build 10/10 packages

### Phase 14 — AI Research & Reasoning Engine ✅
- [x] Research schema (7 models + 5 Prisma enums: ResearchRequestStatus, ResearchQuestionType, ResearchEvidenceQuality, ResearchHypothesisStatus, ResearchTemporalClassification)
- [x] 10 question types, 8 request statuses, 4 quality levels, 5 hypothesis statuses, 5 temporal classifications
- [x] Common package (RESEARCH_CONFIG with confidence weights, evidence quality weights, temporal thresholds, contradiction thresholds, depth presets, staleness/cache TTL)
- [x] AI provider abstraction (research-provider.ts — NoOp + HTTP implementations, Zod-validated responses, graceful degradation when AI unavailable)
- [x] Pure deterministic engine (research-engine.ts — 9 SHA-256 content hash functions, evidence quality assessment (5-dimension weighted scoring), contradiction detection (numeric tolerance + categorical), confidence calculation (5-dimension), research gap detection (10 dimensions), hypothesis evaluation, completeness calculation (4 sub-scores), depth presets (brief/standard/deep), execution limit checking)
- [x] Intelligence service (research-intelligence.ts — orchestrator: create request, execute research (10-step workflow), evidence retrieval from Phases 6/7/9/11, cancel, expire, list/get/history queries)
- [x] RESTful API (10 endpoints under /api/v1/research)
- [x] Worker processor (3 job types: research:execute, research:refresh, research:expire) — self-contained, no API imports
- [x] Queue registration ("research") and scheduler (30-second cycle, deterministic jobIds)
- [x] AI ≠ truth: deterministic engine always runs; AI augments but never overrides evidence
- [x] Unknown ≠ Zero: missing evidence propagates as INSUFFICIENT_EVIDENCE, no fabricated confidence
- [x] SHA-256 content-hash deduplication for requests/results/evidence/contradictions/hypotheses/gaps; monotonic versioned assessments
- [x] Cache TTL: identical requests within TTL return cached results
- [x] Bounded research loops: depth presets limit sub-questions, evidence, iterations, model calls, tokens
- [x] Unit tests (55 engine tests) + integration tests (26, including adversarial tenant-isolation, full workflow, cancel/expire, pagination, determinism)
- [x] Full regression green: 623/623 unit, 254/254 integration, build 11/11 packages

---

## 13. AGENT OWNERSHIP RULES

1. **Never claim functionality is complete when it is mocked, stubbed, hardcoded, or only visually implemented**
2. **After each change: build, lint, type-check, run tests, verify**
3. **Do not build the entire product in one generation — work in verified phases**
4. **When a phase is genuinely working and verified, STOP and report**
5. **External data must NEVER be fabricated**
6. **AI is an interface and reasoning layer over infrastructure — not the product itself**
7. **Deterministic calculations must remain deterministic**
