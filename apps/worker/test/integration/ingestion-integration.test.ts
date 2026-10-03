// =============================================================================
// Integration Tests — Checkpoint, Concurrency, Idempotency
// =============================================================================
// Tests against real PostgreSQL (requires running Docker services).
// Proves behavioral correctness, not just code structure.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@exosquad/database";
import { processIngestionJob } from "../../src/processors/ingestion.js";
import type { Job } from "bullmq";
import http from "node:http";

// ─── Shared Test Infrastructure ──────────────────────────────────────────────

let testServer: http.Server;
let testBaseUrl: string;
let tenantId: string;

function createMockJob(data: Record<string, unknown>, id?: string): Job {
  return {
    id: id ?? `test-job-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: "test-ingestion",
    data,
    opts: {},
    progress: 0,
    attemptsMade: 0,
    attemptsStarted: 0,
  } as unknown as Job;
}

async function expireLock(sourceId: string) {
  await prisma.source.update({
    where: { id: sourceId },
    data: { lastRunAt: new Date(Date.now() - 20 * 60 * 1000) },
  });
}

// ─── V2: Database Idempotency ────────────────────────────────────────────────

describe("V2: Database Idempotency (unique constraint)", () => {
  let sourceId: string;

  beforeAll(async () => {
    // Start shared test server
    testServer = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://localhost`);
      const cursor = url.searchParams.get("cursor");
      if (!cursor) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          data: [
            { id: "item-1", name: "Alpha", price: 10.0 },
            { id: "item-2", name: "Beta", price: 20.0 },
            { id: "item-3", name: "Gamma", price: 30.0 },
          ],
          next_cursor: "page2cursor",
        }));
      } else if (cursor === "page2cursor") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          data: [
            { id: "item-4", name: "Delta", price: 40.0 },
            { id: "item-5", name: "Epsilon", price: 50.0 },
          ],
          next_cursor: null,
        }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [], next_cursor: null }));
      }
    });
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (addr && typeof addr === "object") testBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Create shared tenant
    const tenant = await prisma.tenant.create({
      data: { name: `Integ ${Date.now()}`, slug: `integ-${Date.now()}` },
    });
    tenantId = tenant.id;

    // Create source for V2
    const source = await prisma.source.create({
      data: {
        tenantId,
        name: "V2 Source",
        type: "api_connector",
        connectorType: "http",
        config: {
          url: `${testBaseUrl}/items`,
          pagination: { type: "cursor", cursorParam: "cursor", cursorPath: "next_cursor", limit: 10 },
        },
        status: "active",
      },
    });
    sourceId = source.id;
  });

  it("first insert creates 5 observations", async () => {
    const job = createMockJob({ sourceId, tenantId });
    await processIngestionJob(job);
    const obs = await prisma.observation.findMany({ where: { sourceId } });
    expect(obs.length).toBe(5);
  });

  it("identical re-run skips all duplicates", async () => {
    await expireLock(sourceId);
    const job = createMockJob({ sourceId, tenantId });
    await processIngestionJob(job);
    const obs = await prisma.observation.findMany({ where: { sourceId } });
    expect(obs.length).toBe(5); // Still 5
  });

  it("different source + same content = separate observations", async () => {
    const source2 = await prisma.source.create({
      data: {
        tenantId, name: "V2 Source 2", type: "api_connector", connectorType: "http",
        config: { url: `${testBaseUrl}/items`, pagination: { type: "cursor", cursorParam: "cursor", cursorPath: "next_cursor", limit: 10 } },
        status: "active",
      },
    });
    const job = createMockJob({ sourceId: source2.id, tenantId });
    await processIngestionJob(job);
    const obs2 = await prisma.observation.findMany({ where: { sourceId: source2.id } });
    expect(obs2.length).toBe(5);
    const total = await prisma.observation.count({ where: { tenantId } });
    expect(total).toBe(10);
    // Cleanup source 2
    await prisma.observation.deleteMany({ where: { sourceId: source2.id } });
    await prisma.rawResponse.deleteMany({ where: { sourceId: source2.id } });
    await prisma.ingestionCheckpoint.deleteMany({ where: { sourceId: source2.id } });
    await prisma.source.delete({ where: { id: source2.id } });
  });
});

// ─── V3: Checkpoint Crash Recovery ──────────────────────────────────────────

describe("V3: Checkpoint Crash Recovery", () => {
  let crashSourceId: string;

  beforeAll(async () => {
    const source = await prisma.source.create({
      data: {
        tenantId,
        name: "V3 Source",
        type: "api_connector",
        connectorType: "http",
        config: {
          url: `${testBaseUrl}/items`,
          pagination: { type: "cursor", cursorParam: "cursor", cursorPath: "next_cursor", limit: 10 },
        },
        status: "active",
      },
    });
    crashSourceId = source.id;
  });

  it("checkpoint is persisted after full ingestion", async () => {
    const job = createMockJob({ sourceId: crashSourceId, tenantId });
    await processIngestionJob(job);
    const cp = await prisma.ingestionCheckpoint.findUnique({ where: { sourceId: crashSourceId } });
    expect(cp).not.toBeNull();
    expect(cp!.totalRecordsProcessed).toBe(5);
  });

  it("forced re-run (checkpoint deleted) produces no duplicates", async () => {
    await prisma.ingestionCheckpoint.delete({ where: { sourceId: crashSourceId } });
    await expireLock(crashSourceId);
    const job = createMockJob({ sourceId: crashSourceId, tenantId });
    await processIngestionJob(job);
    const obs = await prisma.observation.findMany({ where: { sourceId: crashSourceId } });
    expect(obs.length).toBe(5);
    const hashes = obs.map((o) => o.contentHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("re-run with end-checkpoint does not re-fetch", async () => {
    await expireLock(crashSourceId);
    const before = await prisma.observation.count({ where: { sourceId: crashSourceId } });
    const job = createMockJob({ sourceId: crashSourceId, tenantId });
    await processIngestionJob(job);
    const after = await prisma.observation.count({ where: { sourceId: crashSourceId } });
    expect(after).toBe(before);
  });
});

// ─── V4: Concurrent Ingestion Lock ──────────────────────────────────────────

describe("V4: Concurrent Ingestion Lock", () => {
  let lockSourceId: string;

  beforeAll(async () => {
    const source = await prisma.source.create({
      data: {
        tenantId,
        name: "V4 Source",
        type: "api_connector",
        connectorType: "http",
        config: {
          url: `${testBaseUrl}/items`,
          pagination: { type: "cursor", cursorParam: "cursor", cursorPath: "next_cursor", limit: 10 },
        },
        status: "active",
        lastRunAt: new Date(), // Lock active
      },
    });
    lockSourceId = source.id;
  });

  it("concurrent job is skipped when lock is held", async () => {
    const job = createMockJob({ sourceId: lockSourceId, tenantId });
    await processIngestionJob(job);
    const obs = await prisma.observation.count({ where: { sourceId: lockSourceId } });
    expect(obs).toBe(0); // Skipped
  });

  it("expired lock allows processing", async () => {
    await expireLock(lockSourceId);
    const job = createMockJob({ sourceId: lockSourceId, tenantId });
    await processIngestionJob(job);
    const obs = await prisma.observation.count({ where: { sourceId: lockSourceId } });
    expect(obs).toBe(5);
  });
});

// ─── Cleanup (runs after all suites) ─────────────────────────────────────────

afterAll(async () => {
  await prisma.ingestionCheckpoint.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.observation.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.rawResponse.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.job.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.source.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
  await new Promise<void>((resolve) => testServer.close(() => resolve()));
  await prisma.$disconnect();
});
