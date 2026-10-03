---
kind: external_dependency
name: Fastify v5 — HTTP Server Framework
slug: fastify
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
source_files:
    - apps/api/package.json
---

### Identity
Fastify v5 is the HTTP framework powering the API server and the worker's health endpoint.

### Role in EXOSQUAD
Provides the request pipeline for routes (`/health`, `/health/ready`, auth, sources), plugin-based middleware (CORS, helmet security headers, rate limiting, sensible error formatting), and decorator/plugin encapsulation boundaries.

### Integration points
- `apps/api/package.json` lists Fastify plus plugins: `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/sensible`, and `fastify-plugin` for breaking encapsulation when decorators need to be shared across plugins.
- Health endpoints expose liveness (`/health`) and readiness (`/health/ready`) probes for container orchestration.

### Durable integration pattern
- Plugins use `fastify-plugin` to cross Fastify's encapsulation boundary so decorators (e.g., authentication) are visible to route handlers.
- Security headers, rate limiting, and request tracking are applied as Fastify plugins rather than per-route logic.

Verify exact plugin registration order against the API bootstrap code.