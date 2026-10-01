import { describe, it, expect } from "vitest";
import { processIngestionJob } from "../../src/processors/ingestion.js";
import type { Job } from "bullmq";

function createMockJob(data: Record<string, unknown>): Job {
  return {
    id: "test-job-1",
    name: "test-ingestion",
    data,
    opts: {},
    progress: 0,
    attemptsMade: 0,
    attemptsStarted: 0,
  } as unknown as Job;
}

describe("Ingestion Processor", () => {
  it("should reject job without sourceId", async () => {
    const job = createMockJob({ tenantId: "tenant-1" });
    await expect(processIngestionJob(job)).rejects.toThrow(
      "Missing required fields"
    );
  });

  it("should reject job without tenantId", async () => {
    const job = createMockJob({ sourceId: "source-1" });
    await expect(processIngestionJob(job)).rejects.toThrow(
      "Missing required fields"
    );
  });

  it("should reject job with empty data", async () => {
    const job = createMockJob({});
    await expect(processIngestionJob(job)).rejects.toThrow(
      "Missing required fields"
    );
  });

  it("should throw when source not found in database", async () => {
    const job = createMockJob({
      sourceId: "source-1",
      tenantId: "tenant-1",
    });
    // Phase 2: processor loads source from DB; non-existent source throws
    await expect(processIngestionJob(job)).rejects.toThrow(
      "Source not found"
    );
  });
});
