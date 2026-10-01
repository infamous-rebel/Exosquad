// =============================================================================
// @exosquad/connector — Content hashing for deduplication and provenance
// =============================================================================

import { createHash } from "node:crypto";

/**
 * Compute SHA-256 hash of a string or buffer.
 * Used for content deduplication and provenance tracking.
 */
export function computeContentHash(content: string | Buffer): string {
  return createHash("sha256")
    .update(typeof content === "string" ? content : content)
    .digest("hex");
}

/**
 * Compute hash of a JSON-serializable value.
 * Serializes with sorted keys for deterministic output.
 */
export function computeJsonHash(value: unknown): string {
  const serialized = JSON.stringify(value, Object.keys(value as object).sort());
  return computeContentHash(serialized);
}
