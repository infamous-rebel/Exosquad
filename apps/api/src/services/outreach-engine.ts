// =============================================================================
// API — Supplier Outreach Engine (Phase 15)
// =============================================================================
// Pure deterministic functions for supplier outreach intelligence.
// No database access — all inputs are passed as parameters.
//
// Responsibilities:
// - Content hashing (SHA-256) for deduplication
// - State machine validation
// - Qualification scoring (12 dimensions)
// - Response contradiction detection
// - Follow-up generation
// - Response confidence calculation
// - Completeness calculation
// =============================================================================

import { createHash } from "node:crypto";
import { OUTREACH_CONFIG } from "@exosquad/common";

// ─── Content Hash Helpers ────────────────────────────────────────────────────

export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]),
  );
  return "{" + pairs.join(",") + "}";
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ─── Content Hash Functions ──────────────────────────────────────────────────

export function computeMessageContentHash(input: {
  outreachId: string;
  direction: string;
  channel: string;
  subject?: string | null;
  bodyText: string;
  templateType?: string | null;
}): string {
  return sha256(stableStringify({
    outreachId: input.outreachId,
    direction: input.direction,
    channel: input.channel,
    subject: input.subject ?? null,
    bodyText: input.bodyText,
    templateType: input.templateType ?? null,
  }));
}

export function computeResponseContentHash(input: {
  outreachId: string;
  rawBody: string;
  rawChannel: string;
  receivedAt: string;
}): string {
  return sha256(stableStringify({
    outreachId: input.outreachId,
    rawBody: input.rawBody,
    rawChannel: input.rawChannel,
    receivedAt: input.receivedAt,
  }));
}

export function computeExtractedFieldContentHash(input: {
  responseId: string;
  fieldName: string;
  fieldValue: string;
  valueType: string;
}): string {
  return sha256(stableStringify({
    responseId: input.responseId,
    fieldName: input.fieldName,
    fieldValue: input.fieldValue,
    valueType: input.valueType,
  }));
}

export function computeFollowupContentHash(input: {
  outreachId: string;
  followupType: string;
  subject: string;
  description: string;
}): string {
  return sha256(stableStringify({
    outreachId: input.outreachId,
    followupType: input.followupType,
    subject: input.subject,
    description: input.description,
  }));
}

export function computeQualificationContentHash(input: {
  outreachId: string;
  dimensionScores: Record<string, number>;
  score: number;
  confidence: number;
}): string {
  return sha256(stableStringify({
    outreachId: input.outreachId,
    dimensionScores: input.dimensionScores,
    score: input.score,
    confidence: input.confidence,
  }));
}

// ─── State Machine ───────────────────────────────────────────────────────────

/**
 * Check whether a state transition is valid according to the deterministic
 * state machine defined in OUTREACH_CONFIG.
 */
export function isValidTransition(from: string, to: string): boolean {
  const allowed = OUTREACH_CONFIG.validTransitions[from as keyof typeof OUTREACH_CONFIG.validTransitions];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Get all valid next states for a given status.
 */
export function getValidNextStates(status: string): string[] {
  return OUTREACH_CONFIG.validTransitions[status as keyof typeof OUTREACH_CONFIG.validTransitions] ?? [];
}

// ─── Qualification Engine ────────────────────────────────────────────────────

export interface QualificationDimensionInput {
  /** 0–100 score for each dimension */
  identity: number;
  productFit: number;
  price: number;
  moq: number;
  leadTime: number;
  capacity: number;
  documentation: number;
  exportCapability: number;
  responsiveness: number;
  evidenceQuality: number;
  commercialTerms: number;
  logisticsCompatibility: number;
}

export interface QualificationResult {
  score: number;
  confidence: number;
  level: string;
  dimensionScores: Record<string, number>;
  explanations: string[];
  knownDimensions: number;
  totalDimensions: number;
}

/**
 * Calculate supplier qualification from 12 dimension scores.
 * Unknown dimensions (score < 0 or null) are excluded and remaining
 * dimensions are renormalized — Unknown != Zero.
 */
export function calculateQualification(
  dimensions: Partial<QualificationDimensionInput>,
): QualificationResult {
  const weights = OUTREACH_CONFIG.qualificationWeights;
  const thresholds = OUTREACH_CONFIG.qualificationLevelThresholds;
  const explanations: string[] = [];

  type DimensionKey = keyof typeof weights;
  const allKeys = Object.keys(weights) as DimensionKey[];
  const totalDimensions = allKeys.length;

  // Filter to known dimensions (score >= 0 and present)
  const knownDimensions: { key: DimensionKey; score: number; weight: number }[] = [];
  for (const key of allKeys) {
    const rawScore = dimensions[key];
    if (rawScore !== undefined && rawScore !== null && rawScore >= 0) {
      const clamped = Math.max(0, Math.min(100, rawScore));
      knownDimensions.push({ key, score: clamped, weight: weights[key] });
    }
  }

  if (knownDimensions.length === 0) {
    return {
      score: 0,
      confidence: 0,
      level: "NOT_QUALIFIED",
      dimensionScores: {},
      explanations: ["No qualification dimensions provided"],
      knownDimensions: 0,
      totalDimensions,
    };
  }

  // Renormalize weights over known dimensions only
  const knownWeightSum = knownDimensions.reduce((sum, d) => sum + d.weight, 0);
  if (knownWeightSum <= 0) {
    return {
      score: 0,
      confidence: 0,
      level: "NOT_QUALIFIED",
      dimensionScores: {},
      explanations: ["All known dimension weights are zero"],
      knownDimensions: knownDimensions.length,
      totalDimensions,
    };
  }

  // Calculate weighted score with renormalized weights
  let weightedScore = 0;
  const dimensionScores: Record<string, number> = {};
  for (const d of knownDimensions) {
    const normalizedWeight = d.weight / knownWeightSum;
    const contribution = d.score * normalizedWeight;
    weightedScore += contribution;
    dimensionScores[d.key] = Math.round(d.score * 100) / 100;
  }

  weightedScore = Math.round(weightedScore * 100) / 100;

  // Confidence based on completeness (how many dimensions are known)
  const completeness = knownDimensions.length / totalDimensions;
  const confidence = Math.round(completeness * 100) / 100;

  // Determine level
  let level: string;
  if (weightedScore >= thresholds.strongMin) {
    level = "STRONG";
    explanations.push(`Score ${weightedScore} >= strong threshold ${thresholds.strongMin}`);
  } else if (weightedScore >= thresholds.qualifiedMin) {
    level = "QUALIFIED";
    explanations.push(`Score ${weightedScore} >= qualified threshold ${thresholds.qualifiedMin}`);
  } else if (weightedScore >= thresholds.conditionalMin) {
    level = "CONDITIONAL";
    explanations.push(`Score ${weightedScore} >= conditional threshold ${thresholds.conditionalMin}`);
  } else if (weightedScore >= thresholds.weakMin) {
    level = "WEAK";
    explanations.push(`Score ${weightedScore} >= weak threshold ${thresholds.weakMin}`);
  } else {
    level = "NOT_QUALIFIED";
    explanations.push(`Score ${weightedScore} below weak threshold ${thresholds.weakMin}`);
  }

  if (completeness < 0.5) {
    explanations.push(`Low completeness: ${knownDimensions.length}/${totalDimensions} dimensions known`);
  }

  return {
    score: weightedScore,
    confidence,
    level,
    dimensionScores,
    explanations,
    knownDimensions: knownDimensions.length,
    totalDimensions,
  };
}

// ─── Response Contradiction Detection ────────────────────────────────────────

export interface ExtractedFieldRef {
  fieldName: string;
  fieldValue: string;
  valueType: string;
}

export interface ExistingEvidenceRef {
  fieldName: string;
  value: number | string;
  source: string;
}

export interface ContradictionResult {
  fieldName: string;
  extractedValue: string;
  existingValue: string | number;
  existingSource: string;
  severity: string; // low | medium | high | critical
  description: string;
}

/**
 * Compare extracted supplier response fields against existing intelligence
 * (Phase 13 assessments, Phase 11 pricing, etc.) to detect contradictions.
 */
export function detectResponseContradictions(
  extractedFields: ExtractedFieldRef[],
  existingEvidence: ExistingEvidenceRef[],
): ContradictionResult[] {
  const contradictions: ContradictionResult[] = [];
  const tolerance = OUTREACH_CONFIG.contradictionThresholds.numericTolerancePercent;

  for (const field of extractedFields) {
    const matchingEvidence = existingEvidence.filter(
      (e) => e.fieldName === field.fieldName,
    );

    for (const evidence of matchingEvidence) {
      const isContradiction = checkContradiction(field, evidence, tolerance);
      if (isContradiction) {
        contradictions.push({
          fieldName: field.fieldName,
          extractedValue: field.fieldValue,
          existingValue: evidence.value,
          existingSource: evidence.source,
          severity: classifyContradictionSeverity(field.fieldName, field.fieldValue, evidence.value),
          description: `Supplier response "${field.fieldValue}" contradicts existing evidence "${evidence.value}" from ${evidence.source}`,
        });
      }
    }
  }

  return contradictions;
}

function checkContradiction(
  field: ExtractedFieldRef,
  evidence: ExistingEvidenceRef,
  tolerance: number,
): boolean {
  if (field.valueType === "number" || field.valueType === "currency") {
    const extractedNum = parseFloat(field.fieldValue);
    const existingNum = typeof evidence.value === "number" ? evidence.value : parseFloat(String(evidence.value));

    if (isNaN(extractedNum) || isNaN(existingNum)) return false;
    if (existingNum === 0) return extractedNum !== 0;

    const percentDiff = Math.abs(extractedNum - existingNum) / Math.abs(existingNum);
    return percentDiff > tolerance;
  }

  // Categorical comparison
  const extractedNorm = field.fieldValue.toLowerCase().trim();
  const existingNorm = String(evidence.value).toLowerCase().trim();
  return extractedNorm !== existingNorm;
}

function classifyContradictionSeverity(
  fieldName: string,
  _extractedValue: string,
  _existingValue: string | number,
): string {
  // Price and MOQ contradictions are high severity
  const highSeverityFields = ["unit_price", "moq", "lead_time"];
  const mediumSeverityFields = ["incoterms", "payment_terms", "production_location"];

  if (highSeverityFields.includes(fieldName)) return "high";
  if (mediumSeverityFields.includes(fieldName)) return "medium";
  return "low";
}

// ─── Follow-up Generation ────────────────────────────────────────────────────

export interface FollowupGenerationInput {
  /** Required fields from questionnaire */
  requiredFields: string[];
  /** Fields that have been extracted from the response */
  providedFields: string[];
  /** Detected contradictions */
  contradictions: ContradictionResult[];
  /** Fields with UNVERIFIED or REQUIRES_CLARIFICATION state */
  unverifiedFields: string[];
}

export interface GeneratedFollowup {
  followupType: string;
  subject: string;
  description: string;
  priority: number;
  fieldName?: string;
}

/**
 * Generate structured follow-up items based on what is missing,
 * contradictory, or unverified in the supplier response.
 */
export function generateFollowups(input: FollowupGenerationInput): GeneratedFollowup[] {
  const followups: GeneratedFollowup[] = [];

  // 1. Missing information
  const missingFields = input.requiredFields.filter(
    (f) => !input.providedFields.includes(f),
  );
  for (const field of missingFields) {
    followups.push({
      followupType: "MISSING_INFO",
      subject: `Missing: ${formatFieldName(field)}`,
      description: `Supplier did not provide ${formatFieldName(field)}. Request this information.`,
      priority: classifyFieldPriority(field),
      fieldName: field,
    });
  }

  // 2. Contradictions
  for (const contradiction of input.contradictions) {
    followups.push({
      followupType: "CONTRADICTION",
      subject: `Contradiction: ${formatFieldName(contradiction.fieldName)}`,
      description: contradiction.description,
      priority: contradiction.severity === "high" ? 2 : contradiction.severity === "medium" ? 5 : 7,
      fieldName: contradiction.fieldName,
    });
  }

  // 3. Unverified claims
  for (const field of input.unverifiedFields) {
    followups.push({
      followupType: "UNVERIFIED_CLAIM",
      subject: `Verify: ${formatFieldName(field)}`,
      description: `Supplier claim for ${formatFieldName(field)} requires verification or supporting documentation.`,
      priority: 5,
      fieldName: field,
    });
  }

  return followups;
}

function formatFieldName(field: string): string {
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function classifyFieldPriority(field: string): number {
  const highPriority = ["unit_price", "moq", "lead_time", "exact_sku"];
  const mediumPriority = ["incoterms", "payment_terms", "certifications"];

  if (highPriority.includes(field)) return 2;
  if (mediumPriority.includes(field)) return 5;
  return 7;
}

// ─── Response Confidence ─────────────────────────────────────────────────────

export interface ResponseConfidenceInput {
  /** Number of data points in the response (0–10 scale) */
  quantity: number;
  /** Quality of sources (0–100) */
  quality: number;
  /** Independence of information (0–100, higher = more independent) */
  independence: number;
  /** Completeness of response (0–100, % of required fields answered) */
  completeness: number;
  /** Consistency with existing evidence (0–100) */
  consistency: number;
}

/**
 * Calculate confidence in a supplier response based on 5 dimensions.
 */
export function calculateResponseConfidence(input: ResponseConfidenceInput): number {
  const weights = OUTREACH_CONFIG.responseConfidenceWeights;

  // Normalize quantity to 0–100 scale
  const quantityNorm = Math.min(100, (input.quantity / 10) * 100);

  const confidence =
    (quantityNorm / 100) * weights.quantity +
    (input.quality / 100) * weights.quality +
    (input.independence / 100) * weights.independence +
    (input.completeness / 100) * weights.completeness +
    (input.consistency / 100) * weights.consistency;

  return Math.round(confidence * 100) / 100;
}

// ─── Completeness Calculation ────────────────────────────────────────────────

/**
 * Calculate what percentage of required questionnaire fields have been answered.
 */
export function calculateCompleteness(
  requiredFields: string[],
  providedFields: string[],
): { score: number; answered: string[]; missing: string[] } {
  if (requiredFields.length === 0) {
    return { score: 1.0, answered: [], missing: [] };
  }

  const answered = requiredFields.filter((f) => providedFields.includes(f));
  const missing = requiredFields.filter((f) => !providedFields.includes(f));
  const score = Math.round((answered.length / requiredFields.length) * 100) / 100;

  return { score, answered, missing };
}

// ─── Questionnaire Generation ────────────────────────────────────────────────

/**
 * Get all required fields from the questionnaire dimensions.
 */
export function getAllQuestionnaireFields(): string[] {
  const dims = OUTREACH_CONFIG.questionnaireDimensions as unknown as Record<string, readonly string[]>;
  const allFields: string[] = [];
  for (const category of Object.keys(dims)) {
    const fields = dims[category];
    if (fields) allFields.push(...fields);
  }
  return allFields;
}

/**
 * Get questionnaire fields for a specific template type.
 */
export function getQuestionnaireFields(templateType: string): string[] {
  const dims = OUTREACH_CONFIG.questionnaireDimensions;

  switch (templateType) {
    case "INITIAL_INQUIRY":
      // All dimensions
      return getAllQuestionnaireFields();

    case "SUPPLIER_VERIFICATION":
      return [...((dims as unknown as Record<string, readonly string[]>).compliance ?? []), "exact_sku", "specifications"];

    case "LOGISTICS_INQUIRY":
      return [...((dims as unknown as Record<string, readonly string[]>).logistics ?? []), "production_location", "packaging"];

    case "FOLLOW_UP":
    case "CUSTOM":
    default:
      // Custom templates have no predefined fields
      return [];
  }
}
