-- AlterTable
ALTER TABLE "sources" ADD COLUMN     "avgLatencyMs" DOUBLE PRECISION,
ADD COLUMN     "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "lastFetchedAt" TIMESTAMP(3),
ADD COLUMN     "lastHealthyAt" TIMESTAMP(3),
ADD COLUMN     "totalFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalFetched" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "raw_responses" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "connectionId" TEXT,
    "tenantId" TEXT NOT NULL,
    "requestUrl" TEXT NOT NULL,
    "requestMethod" TEXT NOT NULL DEFAULT 'GET',
    "requestHeaders" JSONB NOT NULL DEFAULT '{}',
    "httpStatus" INTEGER NOT NULL,
    "responseHeaders" JSONB NOT NULL DEFAULT '{}',
    "payloadRef" TEXT,
    "payloadInline" JSONB,
    "contentHash" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "jobId" TEXT,
    "errorMessage" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_checkpoints" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lastCursor" TEXT,
    "lastPage" INTEGER,
    "lastOffset" INTEGER,
    "lastSyncTimestamp" TIMESTAMP(3),
    "totalRecordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "lastBatchId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raw_responses_sourceId_idx" ON "raw_responses"("sourceId");

-- CreateIndex
CREATE INDEX "raw_responses_tenantId_idx" ON "raw_responses"("tenantId");

-- CreateIndex
CREATE INDEX "raw_responses_contentHash_idx" ON "raw_responses"("contentHash");

-- CreateIndex
CREATE INDEX "raw_responses_retrievedAt_idx" ON "raw_responses"("retrievedAt");

-- CreateIndex
CREATE INDEX "raw_responses_jobId_idx" ON "raw_responses"("jobId");

-- CreateIndex
CREATE INDEX "ingestion_checkpoints_tenantId_idx" ON "ingestion_checkpoints"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_checkpoints_sourceId_key" ON "ingestion_checkpoints"("sourceId");

-- CreateIndex
CREATE INDEX "sources_healthStatus_idx" ON "sources"("healthStatus");

-- AddForeignKey
ALTER TABLE "raw_responses" ADD CONSTRAINT "raw_responses_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_checkpoints" ADD CONSTRAINT "ingestion_checkpoints_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
