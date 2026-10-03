---
kind: external_dependency
name: Zod — Runtime Type Validation
slug: zod
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
source_files:
    - apps/api/package.json
---

### Identity
Zod is the runtime type validation library used for input schemas and environment configuration.

### Role in EXOSQUAD
- Validates all API request bodies/params/query strings.
- Validates environment variables at startup (refuses to boot with invalid config).
- Shared via `@exosquad/common` and `@exosquad/config`.

### Durable usage pattern
- Define Zod schemas once and reuse them for both route validation and programmatic checks.
- Environment validation runs before the server starts; missing/invalid vars cause immediate failure.

Verify exact schema definitions against the common/config packages.