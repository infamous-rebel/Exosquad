import { describe, it, expect } from "vitest";
import { processNormalizationJob } from "../../src/processors/normalization.js";
import type { Job } from "bullmq";

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
  it("should reject job without observationId", async () => {
    const job = createMockJob({
      sourceId: "source-1",
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

  it("should process valid job data", async () => {
    const job = createMockJob({
      observationId: "obs-1",
      sourceId: "source-1",
      tenantId: "tenant-1",
    });
    await expect(processNormalizationJob(job)).resolves.toBeUndefined();
  });
});
