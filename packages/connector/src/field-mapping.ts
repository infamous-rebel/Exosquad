// =============================================================================
// @exosquad/connector — Field mapping from external to canonical schema
// =============================================================================
// Maps arbitrary external API response fields to EXOSQUAD's canonical model.
// Supports dot-notation paths, defaults, and type coercion.
// =============================================================================

import { z } from "zod";

// ─── Field Mapping Config ──────────────────────────────────────────────────

export const fieldMappingSchema = z.object({
  // Map of canonical field name → source path or config
  fields: z.record(z.union([
    z.string(), // Simple path: "data.items" → extracts data.items from response
    z.object({
      path: z.string(),              // Dot-notation path to source field
      default: z.unknown().optional(), // Default value if path not found
      transform: z.enum(["string", "number", "boolean", "json"]).optional(),
      required: z.boolean().default(false),
    }),
  ])),
  // Path to the data array in the response (if response wraps data)
  dataPath: z.string().optional(), // e.g. "data.items" or "results"
});

export type FieldMapping = z.infer<typeof fieldMappingSchema>;

// ─── Mapping Execution ─────────────────────────────────────────────────────

/**
 * Extract a value from an object using dot-notation path.
 */
export function extractPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    // Handle array indexing: "items[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch && arrayMatch[1] !== undefined && arrayMatch[2] !== undefined) {
      const arr = (current as Record<string, unknown>)[arrayMatch[1]];
      if (!Array.isArray(arr)) return undefined;
      current = arr[parseInt(arrayMatch[2], 10)];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  return current;
}

/**
 * Apply a field mapping to transform an external record into canonical form.
 */
export function applyFieldMapping(
  record: Record<string, unknown>,
  mapping: FieldMapping
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [canonicalName, sourceConfig] of Object.entries(mapping.fields)) {
    let value: unknown;

    if (typeof sourceConfig === "string") {
      // Simple path mapping
      value = extractPath(record, sourceConfig);
    } else {
      // Config object with path, default, transform
      value = extractPath(record, sourceConfig.path);

      if (value === undefined && sourceConfig.default !== undefined) {
        value = sourceConfig.default;
      }

      if (value !== undefined && sourceConfig.transform) {
        value = coerceType(value, sourceConfig.transform);
      }

      if (value === undefined && sourceConfig.required) {
        throw new Error(`Required field '${canonicalName}' not found at path '${sourceConfig.path}'`);
      }
    }

    if (value !== undefined) {
      result[canonicalName] = value;
    }
  }

  return result;
}

/**
 * Extract the data array from a response using the mapping's dataPath.
 */
export function extractDataArray(
  response: unknown,
  mapping: FieldMapping
): Record<string, unknown>[] {
  if (!mapping.dataPath) {
    // No dataPath: assume response is the array or a single record
    if (Array.isArray(response)) return response as Record<string, unknown>[];
    if (response && typeof response === "object") return [response as Record<string, unknown>];
    return [];
  }

  const data = extractPath(response, mapping.dataPath);
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") return [data as Record<string, unknown>];
  return [];
}

/**
 * Apply field mapping to all records in a response.
 */
export function mapResponseRecords(
  response: unknown,
  mapping: FieldMapping
): Record<string, unknown>[] {
  const records = extractDataArray(response, mapping);
  return records.map((record) => applyFieldMapping(record, mapping));
}

// ─── Type Coercion ─────────────────────────────────────────────────────────

function coerceType(value: unknown, type: string): unknown {
  switch (type) {
    case "string":
      return String(value);
    case "number": {
      const num = Number(value);
      return isNaN(num) ? undefined : num;
    }
    case "boolean":
      if (typeof value === "string") return value.toLowerCase() === "true" || value === "1";
      return Boolean(value);
    case "json":
      return typeof value === "string" ? safeJsonParse(value) : value;
    default:
      return value;
  }
}

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Parse a field mapping from raw JSON config.
 */
export function parseFieldMapping(raw: unknown): FieldMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const result = fieldMappingSchema.safeParse(raw);
  return result.success ? result.data : null;
}
