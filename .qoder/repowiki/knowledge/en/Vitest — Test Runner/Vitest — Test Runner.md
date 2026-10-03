---
kind: external_dependency
name: Vitest — Test Runner
slug: vitest
category: external_dependency
category_hints:
    - framework_behavior
scope:
    - '**'
source_files:
    - package.json
    - vitest.workspace.ts
---

### Identity
Vitest is the TypeScript-native test runner for unit and integration tests across the monorepo.

### Role in EXOSQUAD
Runs unit tests (`test/unit/`) and integration tests (`test/integration/`) for both the API and worker packages. Workspace-aware via `vitest.workspace.ts`.

### Integration points
- Root `package.json` exposes `test`, `test:unit`, `test:integration` scripts that delegate through Turborepo.
- Per-package configs: `apps/api/vitest.config.ts`, `apps/api/vitest.config.integration.ts`, `apps/worker/vitest.config.ts`.

### Durable usage pattern
- Unit tests live under each package's `test/unit/` directory.
- Integration tests live under `test/integration/` and use real Fastify instances.

Verify exact test file locations and config flags against the workspace setup.