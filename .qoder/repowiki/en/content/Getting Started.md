# Getting Started

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json)
- [docker-compose.yml](file://docker-compose.yml)
- [pnpm-workspace.yaml](file://pnpm-workspace.yaml)
- [turbo.json](file://turbo.json)
- [apps/api/package.json](file://apps/api/package.json)
- [apps/worker/package.json](file://apps/worker/package.json)
- [packages/database/package.json](file://packages/database/package.json)
- [packages/config/src/index.ts](file://packages/config/src/index.ts)
- [apps/api/src/app.ts](file://apps/api/src/app.ts)
- [apps/worker/src/app.ts](file://apps/worker/src/app.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Prerequisites](#prerequisites)
3. [Project Structure](#project-structure)
4. [Installation with Docker Compose](#installation-with-docker-compose)
5. [Environment Setup with pnpm Workspace](#environment-setup-with-pnpm-workspace)
6. [Initial Configuration](#initial-configuration)
7. [Starting Development Servers](#starting-development-servers)
8. [Running Migrations](#running-migrations)
9. [Verifying Service Health](#verifying-service-health)
10. [Troubleshooting Common Issues](#troubleshooting-common-issues)
11. [Conclusion](#conclusion)

## Introduction
Exosquad is a monorepo containing an API service, a background worker, shared packages, and local infrastructure (PostgreSQL and Redis). This guide helps you install dependencies, configure environment variables, start services, run database migrations, and verify that everything is healthy.

## Prerequisites
- Node.js >= 20.0.0
- pnpm (the repository uses pnpm 9.x)
- Docker and Docker Compose
- A PostgreSQL-compatible database (a local instance or the provided container)
- A Redis server (provided by the container)

The root package defines the required Node.js engine and sets pnpm as the package manager. The workspace configuration includes apps and packages directories.

**Section sources**
- [package.json:1-33](file://package.json#L1-L33)
- [pnpm-workspace.yaml:1-4](file://pnpm-workspace.yaml#L1-L4)

## Project Structure
At a high level:
- apps/api: Fastify-based HTTP API
- apps/worker: Background worker using BullMQ and Redis
- packages/database: Database client and migration tooling (Prisma)
- packages/config: Environment validation and configuration loader
- docker-compose.yml: Local Postgres and Redis containers

```mermaid
graph TB
subgraph "Local Infrastructure"
PG["PostgreSQL"]
RDS["Redis"]
end
subgraph "Applications"
API["API (@exosquad/api)"]
WRK["Worker (@exosquad/worker)"]
end
subgraph "Shared Packages"
CFG["@exosquad/config"]
DBPKG["@exosquad/database"]
end
API --> CFG
API --> DBPKG
WRK --> CFG
WRK --> DBPKG
API --> PG
WRK --> RDS
```

**Diagram sources**
- [docker-compose.yml:8-39](file://docker-compose.yml#L8-L39)
- [apps/api/package.json:15-29](file://apps/api/package.json#L15-L29)
- [apps/worker/package.json:15-22](file://apps/worker/package.json#L15-L22)
- [packages/config/src/index.ts:10-34](file://packages/config/src/index.ts#L10-L34)
- [packages/database/package.json:7-15](file://packages/database/package.json#L7-L15)

**Section sources**
- [docker-compose.yml:1-44](file://docker-compose.yml#L1-L44)
- [apps/api/package.json:1-37](file://apps/api/package.json#L1-L37)
- [apps/worker/package.json:1-30](file://apps/worker/package.json#L1-L30)
- [packages/database/package.json:1-25](file://packages/database/package.json#L1-L25)
- [packages/config/src/index.ts:1-56](file://packages/config/src/index.ts#L1-L56)

## Installation with Docker Compose
This project ships a Docker Compose file to run PostgreSQL and Redis locally.

- Start infrastructure:
  - docker compose up -d
- Stop infrastructure:
  - docker compose down
- Reset data (removes volumes):
  - docker compose down -v

The compose file exposes:
- PostgreSQL on port 5432
- Redis on port 6379

Health checks are configured for both services.

**Section sources**
- [docker-compose.yml:1-44](file://docker-compose.yml#L1-L44)

## Environment Setup with pnpm Workspace
Install dependencies across all workspaces:
- pnpm install

Workspace roots include apps/* and packages/*.

Run tasks across the monorepo via Turbo:
- Build: pnpm build
- Dev: pnpm dev
- Test: pnpm test
- Lint: pnpm lint
- Typecheck: pnpm typecheck

The root scripts delegate to Turbo, which orchestrates tasks per app and package.

**Section sources**
- [pnpm-workspace.yaml:1-4](file://pnpm-workspace.yaml#L1-L4)
- [package.json:10-21](file://package.json#L10-L21)
- [turbo.json:1-32](file://turbo.json#L1-L32)

## Initial Configuration
The application validates environment variables at startup. Ensure these variables are set before starting services:

Required:
- DATABASE_URL: Valid database URL (e.g., postgresql://user:password@host:port/dbname)
- JWT_SECRET: At least 32 characters

Optional (with defaults):
- REDIS_HOST: localhost
- REDIS_PORT: 6379
- REDIS_PASSWORD: optional
- NODE_ENV: development | production | test (default: development)
- PORT: 3000
- LOG_LEVEL: fatal | error | warn | info | debug | trace (default: info)
- JWT_EXPIRES_IN: 24h
- WORKER_CONCURRENCY: 5

The config module throws if required variables are missing or invalid.

**Section sources**
- [packages/config/src/index.ts:10-34](file://packages/config/src/index.ts#L10-L34)
- [packages/config/src/index.ts:42-53](file://packages/config/src/index.ts#L42-L53)

## Starting Development Servers
Start the API and Worker in development mode:
- pnpm dev

What happens:
- The API starts on PORT (default 3000) and registers routes under /health and /api/v1/auth.
- The Worker starts a minimal health server on PORT + 1 (default 3001) and connects to Redis.

Individual services can be started from their own package.json scripts:
- API: pnpm --filter @exosquad/api dev
- Worker: pnpm --filter @exosquad/worker dev

**Section sources**
- [package.json:10-21](file://package.json#L10-L21)
- [apps/api/package.json:5-14](file://apps/api/package.json#L5-L14)
- [apps/worker/package.json:5-14](file://apps/worker/package.json#L5-L14)
- [apps/api/src/app.ts:34-37](file://apps/api/src/app.ts#L34-L37)
- [apps/api/src/app.ts:73-84](file://apps/api/src/app.ts#L73-L84)
- [apps/worker/src/app.ts:41-53](file://apps/worker/src/app.ts#L41-L53)

## Running Migrations
Use the database package scripts to generate and deploy Prisma migrations:

- Generate types:
  - pnpm db:generate
- Run migrations against your database:
  - pnpm db:migrate
- Development-only migrations (non-destructive):
  - pnpm db:migrate:dev

These commands are defined at the root and delegate to the database package.

**Section sources**
- [package.json:18-20](file://package.json#L18-L20)
- [packages/database/package.json:7-15](file://packages/database/package.json#L7-L15)

## Verifying Service Health
After starting services:

- API health:
  - curl http://localhost:3000/health
- Worker health:
  - curl http://localhost:3001/health
- Worker readiness (queue status):
  - curl http://localhost:3001/health/ready

The API listens on PORT (default 3000), while the Worker’s health endpoint runs on PORT + 1 (default 3001).

```mermaid
sequenceDiagram
participant Dev as "Developer"
participant API as "API Server"
participant WRK as "Worker Health Server"
Dev->>API : GET /health
API-->>Dev : 200 OK (service status)
Dev->>WRK : GET /health
WRK-->>Dev : 200 OK (service status)
Dev->>WRK : GET /health/ready
WRK-->>Dev : 200 OK or 503 (queues status)
```

**Diagram sources**
- [apps/api/src/app.ts:34-37](file://apps/api/src/app.ts#L34-L37)
- [apps/worker/src/app.ts:20-38](file://apps/worker/src/app.ts#L20-L38)
- [apps/worker/src/app.ts:41-53](file://apps/worker/src/app.ts#L41-L53)

**Section sources**
- [apps/api/src/app.ts:34-37](file://apps/api/src/app.ts#L34-L37)
- [apps/worker/src/app.ts:20-38](file://apps/worker/src/app.ts#L20-L38)

## Troubleshooting Common Issues
- Missing or invalid environment variables
  - Symptom: Application fails to start with environment validation errors.
  - Fix: Set DATABASE_URL and JWT_SECRET; review other optional variables as needed.
  - Reference: Config validation schema and error handling.

- Database connection failures
  - Symptom: Migration or runtime errors connecting to PostgreSQL.
  - Fix: Ensure DATABASE_URL points to a running PostgreSQL instance and credentials match. Verify ports and network access.

- Redis connection failures
  - Symptom: Worker cannot connect to Redis.
  - Fix: Confirm Redis is running and accessible at REDIS_HOST:REDIS_PORT; set REDIS_PASSWORD if required.

- Port conflicts
  - Symptom: Services fail to bind to PORT or PORT + 1.
  - Fix: Change PORT or stop conflicting processes.

- Turborepo task issues
  - Symptom: pnpm dev/build/test does not run expected tasks.
  - Fix: Ensure pnpm is installed and workspace is correctly configured; check turbo.json task definitions.

**Section sources**
- [packages/config/src/index.ts:10-34](file://packages/config/src/index.ts#L10-L34)
- [packages/config/src/index.ts:42-53](file://packages/config/src/index.ts#L42-L53)
- [docker-compose.yml:8-39](file://docker-compose.yml#L8-L39)
- [turbo.json:1-32](file://turbo.json#L1-L32)

## Conclusion
You now have the prerequisites, installation steps, environment setup, initial configuration, and verification procedures to get Exosquad running locally. Use the provided Docker Compose services for PostgreSQL and Redis, configure environment variables, start the API and Worker, run migrations, and validate health endpoints. If you encounter issues, consult the troubleshooting section for common fixes.