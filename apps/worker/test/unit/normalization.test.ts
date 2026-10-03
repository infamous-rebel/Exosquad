import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Mock @exosquad/database with a mock prisma instance
const mockJobUpsert = vi.fn().mockResolvedValue({});
const mockObservationFindFirst = vi.fn().mockResolvedValue(null);

vi.mock("@exosquad/database", () => ({
  prisma: {
    job: { upsert: mockJobUpsert },
    observation: { findFirst: mockObservationFindFirst },
  },
  Prisma: { Decimal: class Decimal { constructor(v: number) { this.v = v; } v: number; } },
}));

// Mock the normalization pipeline
const mockNormalizeBatch = vi.fn().mockResolvedValue({
  total: 0, normalized: 0, failed: 0, skipped: 0, partial: 0,
});

vi.mock("../../src/pipeline/normalize.js", () => ({
  normalizeBatch: mockNormalizeBatch,
}));

// Mock logger to keep test output clean
vi.mock("@exosquad/logger", () => ({
  createChildLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

// Import after mocks are set up
const { processNormalizationJob } = await import("../../src/processors/normalization.js");

function createMockJob(data: Record<string, unknown>): Job {
  return {
    id: "test-job-1",
    name: "test-normalization",
    data,
    opts: {},
    progress: 0,
    attemptsMade: 0,
    attemptsStarted: 0,
  } as unknown as Job;
}

describe("Normalization Processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobUpsert.mockResolvedValue({});
    mockNormalizeBatch.mockResolvedValue({
      total: 0, normalized: 0, failed: 0, skipped: 0, partial: 0,
    });
  });

  it("should reject job without observationId when observationId is required but missing sourceId", async () => {
    // observationId is optional, but sourceId is required
    const job = createMockJob({
      observationId: "obs-1",
      tenantId: "tenant-1",
    });
    await expect(processNormalizationJob(job)).rejects.toThrow(
      "Missing required fields"
    );
  });

  it("should reject job without sourceId", async () => {
    const job = createMockJob({
      observationId: "obs-1",
      tenantId: "tenant-1",
    });
    await expect(processNormalizationJob(job)).rejects.toThrow(
      "Missing required fields"
    );
  });

  it("should reject job without tenantId", async () => {
    const job = createMockJob({
      observationId: "obs-1",
      sourceId: "source-1",
    });
    await expect(processNormalizationJob(job)).rejects.toThrow(
      "Missing required fields"
    );
  });

  it("should process valid job data with observationId (not found → skip)", async () => {
    const job = createMockJob({
      observationId: "obs-1",
      sourceId: "source-1",
      tenantId: "tenant-1",
    });

    // observation not found → completes gracefully with skipped=1
    mockObservationFindFirst.mockResolvedValue(null);

    await expect(processNormalizationJob(job)).resolves.toBeUndefined();
    // job upsert called (running + completed)
    expect(mockJobUpsert).toHaveBeenCalled();
    // normalizeBatch NOT called because observation was not found → early return
    expect(mockNormalizeBatch).not.toHaveBeenCalled();
  });

  it("should run pipeline even without observationId (batch mode)", async () => {
    const job = createMockJob({
      sourceId: "source-1",
      tenantId: "tenant-1",
    });

    await expect(processNormalizationJob(job)).resolves.toBeUndefined();
    expect(mockNormalizeBatch).toHaveBeenCalledWith("source-1", "tenant-1");
  });
});
