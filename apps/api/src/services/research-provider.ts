// =============================================================================
// API — AI Research Provider (Phase 14)
// =============================================================================
// Provider abstraction for AI/LLM calls used in the research engine.
// Follows the established pattern from packages/entity/src/ai-provider.ts.
//
// Design principles:
// - Provider-neutral (works with any OpenAI-compatible API)
// - No SDK dependency — uses raw fetch()
// - Zod-validated structured responses
// - Graceful degradation (AI failure ≠ system failure)
// - Schema-validated output — no raw model output persisted as intelligence
// =============================================================================

import { z } from "zod";
import { logger } from "@exosquad/logger";

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface ResearchAIProvider {
  readonly name: string;
  readonly available: boolean;
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>>;
}

export interface StructuredGenerationRequest<T> {
  systemPrompt: string;
  userPrompt: string;
  responseSchema: z.ZodType<T>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface StructuredGenerationResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  providerName: string;
  modelId: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  latencyMs: number;
}

// ─── No-Op Provider ──────────────────────────────────────────────────────────

/**
 * No-op provider that always returns failure.
 * Used when no AI endpoint is configured.
 */
export class NoOpResearchProvider implements ResearchAIProvider {
  readonly name = "noop";
  readonly available = false;

  async generateStructured<T>(_request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    return {
      success: false,
      data: null,
      error: "No AI provider configured",
      providerName: this.name,
      modelId: null,
      tokenUsage: null,
      latencyMs: 0,
    };
  }
}

// ─── HTTP Provider ───────────────────────────────────────────────────────────

/**
 * HTTP-based provider that calls any OpenAI-compatible API endpoint.
 * Uses native fetch() — no SDK dependency.
 */
export class HttpResearchProvider implements ResearchAIProvider {
  readonly name = "http";
  readonly available = true;

  private readonly endpoint: string;
  private readonly apiKey: string | null;
  private readonly modelId: string;
  private readonly defaultTimeoutMs: number;

  constructor(config: {
    endpoint: string;
    apiKey?: string;
    model: string;
    defaultTimeoutMs?: number;
  }) {
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey ?? null;
    this.modelId = config.model;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000;
  }

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const startTime = Date.now();
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const body = {
        model: this.modelId,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        temperature: request.temperature ?? 0.1,
        max_tokens: request.maxTokens ?? 2000,
        response_format: { type: "json_object" },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const content = result.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("No content in AI response");
      }

      // Parse and validate against schema
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Failed to parse AI response as JSON");
      }

      const validated = request.responseSchema.safeParse(parsed);
      if (!validated.success) {
        throw new Error(`AI response failed schema validation: ${validated.error.message}`);
      }

      const latencyMs = Date.now() - startTime;
      const tokenUsage = result.usage
        ? {
            promptTokens: result.usage.prompt_tokens ?? 0,
            completionTokens: result.usage.completion_tokens ?? 0,
            totalTokens: result.usage.total_tokens ?? 0,
          }
        : null;

      logger.info(
        { provider: this.name, model: this.modelId, latencyMs, tokenUsage },
        "research_ai_call_completed",
      );

      return {
        success: true,
        data: validated.data,
        error: null,
        providerName: this.name,
        modelId: this.modelId,
        tokenUsage,
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      logger.warn(
        { provider: this.name, model: this.modelId, latencyMs, error: errorMessage },
        "research_ai_call_failed",
      );

      return {
        success: false,
        data: null,
        error: errorMessage,
        providerName: this.name,
        modelId: this.modelId,
        tokenUsage: null,
        latencyMs,
      };
    }
  }
}

// ─── Provider Factory ────────────────────────────────────────────────────────

export function createResearchProvider(config?: {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}): ResearchAIProvider {
  if (!config?.endpoint) {
    return new NoOpResearchProvider();
  }

  return new HttpResearchProvider({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    model: config.model ?? "gpt-4o-mini",
  });
}

// ─── Shared Response Schemas ─────────────────────────────────────────────────

/** Schema for question classification response. */
export const questionClassificationSchema = z.object({
  questionType: z.enum([
    "IDENTITY", "SUPPLIER", "PRICING", "DEMAND", "LOGISTICS",
    "COMPETITION", "REGULATORY", "FEASIBILITY", "COMPARISON", "GENERAL",
  ]),
  entities: z.array(z.object({
    type: z.string(),
    value: z.string(),
    confidence: z.number().min(0).max(1),
  })),
  requiresProductId: z.boolean(),
  requiresMarketContext: z.boolean(),
});

export type QuestionClassification = z.infer<typeof questionClassificationSchema>;

/** Schema for question decomposition response. */
export const questionDecompositionSchema = z.object({
  subquestions: z.array(z.object({
    question: z.string(),
    questionType: z.enum([
      "IDENTITY", "SUPPLIER", "PRICING", "DEMAND", "LOGISTICS",
      "COMPETITION", "REGULATORY", "FEASIBILITY", "COMPARISON", "GENERAL",
    ]),
    priority: z.number().min(1).max(10),
    dependsOn: z.array(z.number()),
    rationale: z.string(),
  })),
  researchStrategy: z.string(),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
});

export type QuestionDecomposition = z.infer<typeof questionDecompositionSchema>;

/** Schema for hypothesis evaluation response. */
export const hypothesisEvaluationSchema = z.object({
  hypotheses: z.array(z.object({
    statement: z.string(),
    hypothesisType: z.string(),
    status: z.enum(["SUPPORTED", "PARTIALLY_SUPPORTED", "UNCERTAIN", "CONTRADICTED", "INSUFFICIENT_EVIDENCE"]),
    supportingEvidence: z.array(z.string()),
    contradictingEvidence: z.array(z.string()),
    unknowns: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  })),
});

export type HypothesisEvaluation = z.infer<typeof hypothesisEvaluationSchema>;

/** Schema for research synthesis response. */
export const researchSynthesisSchema = z.object({
  summary: z.string(),
  conclusions: z.array(z.object({
    statement: z.string(),
    confidence: z.number().min(0).max(1),
    evidenceBasis: z.array(z.string()),
    limitations: z.array(z.string()),
  })),
  keyInsights: z.array(z.string()),
  limitations: z.array(z.string()),
  furtherResearchNeeded: z.array(z.string()),
  priorityActions: z.array(z.string()),
});

export type ResearchSynthesis = z.infer<typeof researchSynthesisSchema>;
