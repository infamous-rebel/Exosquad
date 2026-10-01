// =============================================================================
// @exosquad/connector — Authentication strategies
// =============================================================================
// Applies authentication to outgoing HTTP requests.
// Supports: none, api_key, bearer, basic, oauth2
// =============================================================================

import { z } from "zod";
import { AuthenticationError } from "./errors.js";

// ─── Auth Config Schemas ───────────────────────────────────────────────────

export const noneAuthConfig = z.object({
  type: z.literal("none"),
});

export const apiKeyAuthConfig = z.object({
  type: z.literal("api_key"),
  key: z.string().min(1),
  headerName: z.string().default("X-API-Key"), // or "Authorization"
  prefix: z.string().default(""), // e.g. "Bearer " if used in Authorization
  location: z.enum(["header", "query"]).default("header"),
  queryParamName: z.string().default("api_key"),
});

export const bearerAuthConfig = z.object({
  type: z.literal("bearer"),
  token: z.string().min(1),
});

export const basicAuthConfig = z.object({
  type: z.literal("basic"),
  username: z.string().min(1),
  password: z.string().default(""),
});

export const oauth2AuthConfig = z.object({
  type: z.literal("oauth2"),
  accessToken: z.string().min(1),
  tokenType: z.string().default("Bearer"),
});

export const authConfigSchema = z.discriminatedUnion("type", [
  noneAuthConfig,
  apiKeyAuthConfig,
  bearerAuthConfig,
  basicAuthConfig,
  oauth2AuthConfig,
]);

export type AuthConfig = z.infer<typeof authConfigSchema>;

// ─── Request Mutation ──────────────────────────────────────────────────────

export interface RequestParts {
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
}

/**
 * Apply authentication to a request's headers and/or query parameters.
 * Mutates the RequestParts in place.
 */
export function applyAuth(config: AuthConfig, request: RequestParts): void {
  switch (config.type) {
    case "none":
      break;

    case "api_key":
      if (config.location === "header") {
        const headerValue = config.prefix ? `${config.prefix}${config.key}` : config.key;
        request.headers[config.headerName] = headerValue;
      } else {
        request.queryParams[config.queryParamName] = config.key;
      }
      break;

    case "bearer":
      request.headers["Authorization"] = `Bearer ${config.token}`;
      break;

    case "basic": {
      const encoded = Buffer.from(`${config.username}:${config.password}`).toString("base64");
      request.headers["Authorization"] = `Basic ${encoded}`;
      break;
    }

    case "oauth2":
      request.headers["Authorization"] = `${config.tokenType} ${config.accessToken}`;
      break;

    default: {
      // Exhaustive check
      const _exhaustive: never = config;
      throw new AuthenticationError(`Unknown auth type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Validate and parse an auth config from raw JSON (e.g., from database).
 */
export function parseAuthConfig(raw: unknown): AuthConfig {
  const result = authConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new AuthenticationError(
      `Invalid auth configuration: ${result.error.message}`
    );
  }
  return result.data;
}
