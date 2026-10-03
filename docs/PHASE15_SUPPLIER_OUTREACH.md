# Phase 15 — Supplier Outreach / Sourcing Intelligence Engine

## Overview

Phase 15 answers: **"How do we engage suppliers, capture their responses, verify claims against existing intelligence, and qualify them for sourcing?"**

It converts Phase 13 (supplier sourcing intelligence) and Phase 14 (AI research & reasoning) outputs into an evidence-backed outreach, response capture, verification, qualification, and sourcing follow-up workflow.

Phase 15 does NOT:
- Autonomously send messages without human approval
- Rebuild Phase 13 or Phase 14 calculations
- Treat AI extraction as verification (AI extraction ≠ verification)

---

## Architecture

### Three-Layer Design

```
┌──────────────────────────────────────────────────────────┐
│  API Routes (Fastify)                                    │
│  /api/v1/outreach/*                                      │
├──────────────────────────────────────────────────────────┤
│  Intelligence Service (Orchestrator)                     │
│  outreach-intelligence.ts                                │
│  - Loads data from DB                                    │
│  - Enforces state machine                                │
│  - Creates evidence records                              │
│  - Persists audit trail + thread events                  │
├──────────────────────────────────────────────────────────┤
│  Pure Engine (no DB, no HTTP, no filesystem)             │
│  outreach-engine.ts                                      │
│  - Content hashing (SHA-256)                             │
│  - State machine validation                              │
│  - 12-dimension qualification scoring                    │
│  - Contradiction detection                               │
│  - Follow-up generation                                  │
│  - Response confidence calculation                       │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

```
Campaign + Outreach Creation
    │
    ▼
┌─────────────────────────┐
│ AI Message Generation    │ → Structured draft based on template type
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Human Approval Gate      │ → User reviews and approves draft
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Send Outreach            │ → Record send event (no external sending)
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Response Capture         │ → Preserve original supplier response
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ AI Field Extraction      │ → Extract structured fields from response
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Contradiction Detection  │ → Compare against Phase 13 intelligence
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Follow-up Generation     │ → Missing fields, contradictions, unverified claims
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Supplier Qualification   │ → 12-dimension weighted scoring
└──────────┬──────────────┘
           ▼
    Persist to 10 Prisma models + Evidence records
```

---

## State Machine

```
DRAFT → READY → APPROVED → SENT → DELIVERED → RESPONDED
                                                         ├→ FOLLOW_UP_REQUIRED → RESPONDED (cycle)
                                                         ├→ QUALIFICATION_REQUIRED → QUALIFIED → CLOSED
                                                         └→ REJECTED → CLOSED
Any non-terminal state → CLOSED (manual close)
```

| From \ To | READY | APPROVED | SENT | DELIVERED | RESPONDED | FOLLOW_UP | QUALIFICATION | QUALIFIED | REJECTED | CLOSED |
|-----------|-------|----------|------|-----------|-----------|-----------|---------------|-----------|----------|--------|
| DRAFT     | ✓     |          |      |           |           |           |               |           |          | ✓      |
| READY     |       | ✓        |      |           |           |           |               |           |          | ✓      |
| APPROVED  |       |          | ✓    |           |           |           |               |           |          | ✓      |
| SENT      |       |          |      | ✓         |           |           |               |           |          |        |
| DELIVERED |       |          |      |           | ✓         |           |               |           |          |        |
| RESPONDED |       |          |      |           |           | ✓         | ✓             |           |          |        |
| FOLLOW_UP |       |          |      |           | ✓         |           | ✓             |           |          |        |
| QUAL_REQ  |       |          |      |           |           |           |               | ✓         | ✓        |        |
| QUALIFIED |       |          |      |           |           |           |               |           |          | ✓      |

---

## Pure Engine

**File**: `apps/api/src/services/outreach-engine.ts`

### Content Hashing

7 SHA-256 hash functions for deduplication:
- `computeMessageContentHash` — Messages
- `computeResponseContentHash` — Responses
- `computeExtractedFieldContentHash` — Extracted fields
- `computeFollowupContentHash` — Follow-ups
- `computeQualificationContentHash` — Qualifications

All use stable JSON serialization (sorted keys) to ensure determinism.

### State Machine

- `isValidTransition(from, to)` — Validates state transitions
- `getValidNextStates(status)` — Returns valid next states

### Qualification Engine

`calculateQualification(dimensions)` — 12-dimension weighted scoring:

| # | Dimension | Weight |
|---|-----------|--------|
| 1 | identity | 0.12 |
| 2 | productFit | 0.10 |
| 3 | price | 0.10 |
| 4 | moq | 0.08 |
| 5 | leadTime | 0.08 |
| 6 | capacity | 0.07 |
| 7 | documentation | 0.08 |
| 8 | exportCapability | 0.08 |
| 9 | responsiveness | 0.07 |
| 10 | evidenceQuality | 0.07 |
| 11 | commercialTerms | 0.07 |
| 12 | logisticsCompatibility | 0.06 |

**Qualification Levels**: `NOT_QUALIFIED` (< 30) | `WEAK` (30–50) | `CONDITIONAL` (50–60) | `QUALIFIED` (60–80) | `STRONG` (≥ 80)

**Unknown ≠ Zero**: Missing dimensions excluded from scoring; weights renormalized over known dimensions only.

### Contradiction Detection

`detectResponseContradictions(extractedFields, existingEvidence)`:
- **Numeric**: Percent difference > 20% tolerance → contradiction
- **Categorical**: Exact string mismatch → contradiction
- **High-severity fields**: unit_price, moq always flagged as high severity

### Follow-up Generation

`generateFollowups(input)` produces three types:
- `MISSING_INFO` — Required fields not answered
- `CONTRADICTION` — Conflicting values need clarification
- `UNVERIFIED_CLAIM` — Supplier claims needing research verification

Priority: unit_price (1) < moq (2) < lead_time (3) < certifications (4) < others (5)

### Response Confidence

`calculateResponseConfidence(input)` — 5-dimension weighted scoring:
- Quantity (15%), Quality (25%), Independence (20%), Completeness (25%), Consistency (15%)

---

## Intelligence Service

**File**: `apps/api/src/services/outreach-intelligence.ts`

### Functions

| Function | Description |
|----------|-------------|
| `createCampaign(input)` | Create sourcing campaign |
| `listCampaigns(params)` | Paginated campaign list |
| `getCampaign(params)` | Get campaign with outreachs |
| `createOutreach(input)` | Create outreach for supplier/product |
| `listOutreachs(params)` | Paginated outreach list with filters |
| `getOutreach(params)` | Get outreach with relations |
| `createMessage(params)` | Create message with content hash |
| `approveMessage(params)` | Human approval gate for messages |
| `transitionOutreach(params)` | State machine transition with audit |
| `approveOutreach(params)` | DRAFT/READY → APPROVED |
| `sendOutreach(params)` | APPROVED → SENT |
| `recordResponse(input)` | Record supplier response (idempotent) |
| `extractResponseFields(params)` | Extract fields + create Evidence |
| `analyzeResponse(params)` | Contradiction detection + follow-ups |
| `qualifySupplier(params)` | 12-dimension qualification |
| `getQualification(params)` | Get latest qualification |
| `getOutreachThread(params)` | Unified chronological timeline |
| `getOutreachEvidence(params)` | Evidence from extracted fields |
| `createFollowup(params)` | Create follow-up (idempotent) |
| `listFollowups(params)` | List follow-ups by priority |
| `createTemplate(params)` | Create message template |
| `listTemplates(params)` | List active templates |
| `expireStaleOutreach(params)` | Expire old outreachs → CLOSED |

---

## API Reference

**Base URL**: `/api/v1/outreach`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/campaigns` | Create campaign |
| GET | `/campaigns` | List campaigns |
| GET | `/campaigns/:id` | Get campaign |
| GET | `/campaigns/:id/outreachs` | List campaign outreachs |
| POST | `/outreachs` | Create outreach |
| GET | `/outreachs` | List outreachs |
| GET | `/outreachs/:id` | Get outreach |
| POST | `/outreachs/:id/generate-draft` | AI-generate message |
| POST | `/outreachs/:id/approve` | Human approval |
| POST | `/outreachs/:id/send` | Record send |
| POST | `/outreachs/:id/respond` | Record supplier response |
| POST | `/outreachs/:id/extract-response` | AI-extract response fields |
| POST | `/outreachs/:id/analyze-response` | Analyze response |
| POST | `/outreachs/:id/qualify` | Run qualification |
| GET | `/outreachs/:id/thread` | Get interaction thread |
| GET | `/outreachs/:id/qualification` | Get qualification |
| GET | `/outreachs/:id/evidence` | Get outreach evidence |
| GET | `/outreachs/:id/followups` | List follow-ups |
| POST | `/outreachs/:id/followups` | Create follow-up |
| POST | `/outreachs/:id/recalculate` | Trigger Phase 13 recalculation |
| POST | `/templates` | Create template |
| GET | `/templates` | List templates |
| POST | `/expire` | Expire stale outreachs |

All routes: auth hook, tenantId from `request.user!.tenantId`, Zod validation.

---

## Database Models

10 new Prisma models:

| Model | Purpose |
|-------|---------|
| `OutreachCampaign` | Groups outreach activities for a product/sourcing objective |
| `Outreach` | Individual supplier outreach with lifecycle |
| `OutreachMessage` | Versioned message with human approval gate |
| `OutreachResponse` | Preserved original supplier response |
| `OutreachExtractedField` | Structured field extracted from response |
| `OutreachFollowup` | Follow-up items with scheduling |
| `OutreachQualification` | Dimension-based qualification record |
| `OutreachThreadEvent` | Persistent interaction timeline |
| `OutreachAuditEntry` | Audit trail for all significant actions |
| `OutreachTemplate` | Reusable message templates |

6 new enums: `OutreachStatus`, `OutreachChannel`, `OutreachTemplateType`, `ResponseVerificationState`, `AuditActorType`, `QualificationLevel`

---

## Worker

### Processor

**File**: `apps/worker/src/processors/outreach.ts`

Job types:
- `outreach:generate-draft` — AI message generation
- `outreach:extract-response` — AI response field extraction
- `outreach:analyze-response` — Contradiction detection, follow-up generation
- `outreach:verify-claim` — Create Phase 14 research request for claim verification
- `outreach:qualify` — Deterministic qualification calculation
- `outreach:recalculate` — Trigger Phase 13 recalculation
- `outreach:expire` — Expire stale outreachs

### Scheduler

**File**: `apps/worker/src/scheduler/outreach-scheduler.ts`

- 60-second poll interval
- 12-hour detection cycle
- Max 20 jobs per tenant per cycle
- Deterministic job IDs: `outreach-expire-${tenantId}-${dayKey}`
- Enqueues expire and follow-up reminder jobs

---

## Key Design Decisions

1. **No external message sending**: Records messages and transitions but does not autonomously send emails/WhatsApp. Channel abstraction permits future providers.
2. **Human approval gate**: `approveOutreach` required before `sendOutreach`. AI generates drafts; humans approve.
3. **Evidence integration**: Extracted response fields create `Evidence` records linking to existing evidence architecture.
4. **No Phase 13 rebuild**: Calls `recalculateSupplierSourcing` from Phase 13 service when new evidence warrants re-evaluation.
5. **AI safety**: Supplier messages treated as untrusted input. AI extraction tagged UNVERIFIED until manually verified or research-confirmed.
6. **Unknown ≠ Zero**: Missing questionnaire dimensions excluded from qualification scoring and renormalized.
7. **Content-hash deduplication**: Responses, extracted fields, follow-ups, qualifications all deduplicated by SHA-256 content hash.
8. **Monotonic versioning**: Qualifications version per (tenantId, outreachId) tuple.
9. **Self-contained worker**: Inlines engine logic; does not import API-layer code.
10. **Tenant isolation**: Every query, mutation, and audit entry scoped to tenantId.
