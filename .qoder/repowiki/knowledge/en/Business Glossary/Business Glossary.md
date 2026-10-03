---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### EXOSQUAD
- Definition：The project's commercial product name: a multi-tenant SaaS platform for foreign-product intelligence, supply discovery, demand intelligence, authenticity analysis, logistics, landed-cost analysis, and reseller decision intelligence targeting Bangladesh.

### Observation
- Definition：An immutable record of raw data fetched from an external source. It preserves the original payload, source URL, retrieval timestamp, observed-at timestamp, content hash (SHA-256), connector/parser version, provenance, and confidence. Observations are append-only and never overwritten; they form the evidence base for all downstream normalization and entity resolution.

### Evidence
- Definition：A provenance record linking a conclusion (price, availability, specification, authenticity, demand signal) to its source and observation. Carries claim type/value, confidence score, derivation method (manual / automated / ai_inference), verification status, and method version. Every important conclusion must be traceable to evidence.

### Source
- Definition：A user-configurable data ingestion endpoint representing an external provider (web scraper, API connector, marketplace, social signal, or product database). Defined by type, connector type, JSON config (URL, auth, headers, mapping rules), optional cron schedule, and operational status.

### ApiConnection
- Definition：A provider-agnostic connector configuration stored in the database. Holds the provider label, base URL, auth type (none / api_key / bearer / basic / oauth2), encrypted auth config, headers, per-source rate limit, timeout, retry policy, and health status. Connectors map external schemas into EXOSQUAD's canonical model without coupling the core platform to any specific provider.

### Product identity
- Definition：The canonical product entity distinguished by brand, product name, SKU, variant, pack size, volume, weight, country of origin, and barcode/GTIN where available. Products must NOT be merged merely because names look similar; identity resolution requires explicit matching and confidence scoring.

### Authenticity classification
- Definition：A classification dimension separating genuine authentic products from unknown, generic alternatives, lookalikes, potential counterfeit, and confirmed counterfeit evidence. Visual similarity alone is insufficient evidence for counterfeit status; conclusions require traceable evidence.

### Universal connector
- Definition：The provider-agnostic abstraction for ingesting data from arbitrary external APIs and websites. A connector handles base URL, endpoint, HTTP method, authentication, headers, query parameters, pagination (offset/cursor), rate limits, retry policy, timeout, response format parsing, field mapping, incremental sync, scheduling, health checks, and provenance. External schemas map into EXOSQUAD's canonical model; the core platform never depends on one provider.

### Ingestion pipeline
- Definition：The async workflow that fetches data from configured external sources, persists it as an immutable Observation, and enqueues it for normalization. Must support retries, exponential backoff, jitter, rate limiting, circuit breakers, timeouts, heartbeats, leases, checkpointing, idempotency, dead-letter queues, graceful shutdown, and recovery.

### Normalization pipeline
- Definition：The async workflow that transforms raw Observation payloads into EXOSQUAD's canonical data model. Runs after ingestion and feeds entity resolution, product graph construction, and downstream analysis.

### Phase 1 / Phase 2
- Definition：The project's staged delivery plan. Phase 1 establishes the production engineering foundation (monorepo, stack, services, DB schema, queues, auth, observability, testing, Docker Compose, architecture docs, AGENTS.md). Phase 2 adds the universal connector framework, real ingestion/normalization pipelines, entity resolution, scheduling, monitoring, CI/CD, and production deployment.
