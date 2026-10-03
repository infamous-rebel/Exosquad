---
kind: external_dependency
name: jose — JWT Signing Library (HS256)
slug: jose
category: external_dependency
category_hints:
    - auth_protocol
scope:
    - '**'
source_files:
    - apps/api/package.json
---

### Identity
`jose` is the standard-compliant JWT library used for signing and verifying tokens.

### Role in EXOSQUAD
Issues HS256-signed JWTs containing `sub` (userId), `tenantId`, and `role`, with configurable expiration (default 24h). Tokens are passed as Bearer tokens in the Authorization header.

### Integration points
- `apps/api/package.json` depends on `jose`.
- Auth flow: signup → login returns JWT → protected routes validate via Fastify preHandler.

### Auth protocol details
- Algorithm: HS256.
- Secret is injected via environment (not hardcoded).
- Token payload carries `sub`, `tenantId`, `role`.
- Password hashing uses bcryptjs at 12 rounds before storage.

Verify exact token payload fields and secret injection against the auth implementation.