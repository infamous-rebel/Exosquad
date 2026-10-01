// =============================================================================
// @exosquad/connector — Pagination strategies
// =============================================================================
// Supports: page-based, offset-based, cursor-based, link-header-based
// =============================================================================

import { z } from "zod";

// ─── Pagination Config ─────────────────────────────────────────────────────

export const pagePaginationConfig = z.object({
  type: z.literal("page"),
  paramName: z.string().default("page"),
  pageSizeParam: z.string().default("pageSize"),
  pageSize: z.number().int().positive().default(20),
  startPage: z.number().int().default(1),
});

export const offsetPaginationConfig = z.object({
  type: z.literal("offset"),
  offsetParam: z.string().default("offset"),
  limitParam: z.string().default("limit"),
  limit: z.number().int().positive().default(20),
});

export const cursorPaginationConfig = z.object({
  type: z.literal("cursor"),
  cursorParam: z.string().default("cursor"),
  limitParam: z.string().default("limit"),
  limit: z.number().int().positive().default(20),
  cursorPath: z.string().optional(), // JSON path in response to extract next cursor
});

export const linkPaginationConfig = z.object({
  type: z.literal("link"),
  rel: z.string().default("next"), // Link relation to follow
  headerName: z.string().default("link"), // Header containing pagination links
});

export const paginationConfigSchema = z.discriminatedUnion("type", [
  pagePaginationConfig,
  offsetPaginationConfig,
  cursorPaginationConfig,
  linkPaginationConfig,
]);

export type PaginationConfig = z.infer<typeof paginationConfigSchema>;

// ─── Pagination State ──────────────────────────────────────────────────────

export interface PaginationState {
  page?: number;
  offset?: number;
  cursor?: string;
  nextUrl?: string;
  hasMore: boolean;
}

// ─── Pagination Handler ────────────────────────────────────────────────────

export interface PaginationContext {
  baseUrl: string;
  queryParams: Record<string, string>;
  state: PaginationState;
  response: {
    status: number;
    headers: Record<string, string>;
    body: unknown;
  };
}

/**
 * Determine the next page state after receiving a response.
 * Returns updated state with hasMore=false when pagination is exhausted.
 */
export function advancePagination(
  config: PaginationConfig,
  context: PaginationContext
): PaginationState {
  switch (config.type) {
    case "page": {
      const currentPage = context.state.page ?? config.startPage;
      const body = context.response.body as Record<string, unknown> | unknown[];
      const records = Array.isArray(body) ? body : extractDataArray(body);
      const hasMore = records.length >= config.pageSize;
      return {
        page: currentPage + 1,
        hasMore,
      };
    }

    case "offset": {
      const currentOffset = context.state.offset ?? 0;
      const body = context.response.body as Record<string, unknown> | unknown[];
      const records = Array.isArray(body) ? body : extractDataArray(body);
      const hasMore = records.length >= config.limit;
      return {
        offset: currentOffset + records.length,
        hasMore,
      };
    }

    case "cursor": {
      const body = context.response.body as Record<string, unknown>;
      let nextCursor: string | undefined;

      if (config.cursorPath) {
        nextCursor = extractNestedValue(body, config.cursorPath) as string | undefined;
      } else {
        // Default: look for common cursor field names
        nextCursor =
          (body.next_cursor as string | undefined) ??
          (body.cursor as string | undefined) ??
          (body.after as string | undefined);
      }

      return {
        cursor: nextCursor,
        hasMore: !!nextCursor,
      };
    }

    case "link": {
      const linkHeader = context.response.headers[config.headerName.toLowerCase()];
      if (!linkHeader) {
        return { hasMore: false };
      }

      const nextUrl = parseLinkHeader(linkHeader, config.rel);
      return {
        nextUrl: nextUrl ?? undefined,
        hasMore: !!nextUrl,
      };
    }
  }
}

/**
 * Apply pagination parameters to query params for the next request.
 */
export function applyPaginationParams(
  config: PaginationConfig,
  state: PaginationState,
  queryParams: Record<string, string>
): void {
  switch (config.type) {
    case "page":
      if (state.page !== undefined) {
        queryParams[config.paramName] = String(state.page);
        queryParams[config.pageSizeParam] = String(config.pageSize);
      }
      break;

    case "offset":
      if (state.offset !== undefined) {
        queryParams[config.offsetParam] = String(state.offset);
        queryParams[config.limitParam] = String(config.limit);
      }
      break;

    case "cursor":
      if (state.cursor) {
        queryParams[config.cursorParam] = state.cursor;
        queryParams[config.limitParam] = String(config.limit);
      }
      break;

    case "link":
      // Link-based pagination uses the full URL, not query params
      break;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractDataArray(body: Record<string, unknown>): unknown[] {
  // Try common data array field names
  for (const key of ["data", "results", "items", "records", "entries"]) {
    const value = body[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function extractNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Parse an RFC 5988 Link header and extract the URL for a given relation.
 * Example: `<https://api.example.com/items?page=2>; rel="next", <...>; rel="prev"`
 */
export function parseLinkHeader(header: string, rel: string): string | null {
  const links = header.split(",");
  for (const link of links) {
    const match = link.trim().match(/^<([^>]+)>;\s*rel="?([^";]+)"?/);
    if (match && match[2] !== undefined && match[2].trim() === rel) {
      return match[1] ?? null;
    }
  }
  return null;
}

/**
 * Validate pagination config from raw JSON.
 */
export function parsePaginationConfig(raw: unknown): PaginationConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const result = paginationConfigSchema.safeParse(raw);
  return result.success ? result.data : null;
}
