// =============================================================================
// Unit Tests — Outreach Engine (Phase 15)
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  getValidNextStates,
  calculateQualification,
  detectResponseContradictions,
  generateFollowups,
  calculateResponseConfidence,
  calculateCompleteness,
  getAllQuestionnaireFields,
  getQuestionnaireFields,
  computeMessageContentHash,
  computeResponseContentHash,
  computeExtractedFieldContentHash,
  computeFollowupContentHash,
  computeQualificationContentHash,
} from "../../src/services/outreach-engine.js";

// ─── State Machine Tests ─────────────────────────────────────────────────────

describe("Outreach State Machine", () => {
  it("allows valid DRAFT -> READY transition", () => {
    expect(isValidTransition("DRAFT", "READY")).toBe(true);
  });

  it("allows valid DRAFT -> CLOSED transition", () => {
    expect(isValidTransition("DRAFT", "CLOSED")).toBe(true);
  });

  it("rejects invalid DRAFT -> SENT transition", () => {
    expect(isValidTransition("DRAFT", "SENT")).toBe(false);
  });

  it("allows READY -> APPROVED", () => {
    expect(isValidTransition("READY", "APPROVED")).toBe(true);
  });

  it("allows APPROVED -> SENT", () => {
    expect(isValidTransition("APPROVED", "SENT")).toBe(true);
  });

  it("allows SENT -> DELIVERED", () => {
    expect(isValidTransition("SENT", "DELIVERED")).toBe(true);
  });

  it("allows DELIVERED -> RESPONDED", () => {
    expect(isValidTransition("DELIVERED", "RESPONDED")).toBe(true);
  });

  it("allows RESPONDED -> FOLLOW_UP_REQUIRED", () => {
    expect(isValidTransition("RESPONDED", "FOLLOW_UP_REQUIRED")).toBe(true);
  });

  it("allows RESPONDED -> QUALIFICATION_REQUIRED", () => {
    expect(isValidTransition("RESPONDED", "QUALIFICATION_REQUIRED")).toBe(true);
  });

  it("allows QUALIFICATION_REQUIRED -> QUALIFIED", () => {
    expect(isValidTransition("QUALIFICATION_REQUIRED", "QUALIFIED")).toBe(true);
  });

  it("allows QUALIFICATION_REQUIRED -> REJECTED", () => {
    expect(isValidTransition("QUALIFICATION_REQUIRED", "REJECTED")).toBe(true);
  });

  it("allows QUALIFIED -> CLOSED", () => {
    expect(isValidTransition("QUALIFIED", "CLOSED")).toBe(true);
  });

  it("rejects CLOSED -> anything", () => {
    expect(isValidTransition("CLOSED", "DRAFT")).toBe(false);
    expect(isValidTransition("CLOSED", "READY")).toBe(false);
    expect(isValidTransition("CLOSED", "SENT")).toBe(false);
  });

  it("rejects invalid backward transitions", () => {
    expect(isValidTransition("SENT", "DRAFT")).toBe(false);
    expect(isValidTransition("QUALIFIED", "RESPONDED")).toBe(false);
    expect(isValidTransition("APPROVED", "DRAFT")).toBe(false);
  });

  it("rejects unknown status", () => {
    expect(isValidTransition("UNKNOWN_STATUS", "DRAFT")).toBe(false);
  });

  it("returns correct valid next states", () => {
    const nextStates = getValidNextStates("DRAFT");
    expect(nextStates).toContain("READY");
    expect(nextStates).toContain("CLOSED");
    expect(nextStates).not.toContain("SENT");
  });

  it("returns empty array for CLOSED", () => {
    expect(getValidNextStates("CLOSED")).toEqual([]);
  });

  it("returns empty array for unknown status", () => {
    expect(getValidNextStates("NONEXISTENT")).toEqual([]);
  });
});

// ─── Qualification Tests ─────────────────────────────────────────────────────

describe("Qualification Engine", () => {
  it("returns NOT_QUALIFIED when no dimensions provided", () => {
    const result = calculateQualification({});
    expect(result.level).toBe("NOT_QUALIFIED");
    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.knownDimensions).toBe(0);
  });

  it("calculates STRONG qualification with high scores", () => {
    const result = calculateQualification({
      identity: 90,
      productFit: 90,
      price: 85,
      moq: 80,
      leadTime: 85,
      capacity: 80,
      documentation: 90,
      exportCapability: 85,
      responsiveness: 90,
      evidenceQuality: 85,
      commercialTerms: 85,
      logisticsCompatibility: 80,
    });
    expect(result.level).toBe("STRONG");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.confidence).toBe(1);
    expect(result.knownDimensions).toBe(12);
  });

  it("calculates QUALIFIED with moderate scores", () => {
    const result = calculateQualification({
      identity: 70,
      productFit: 65,
      price: 60,
      moq: 65,
      leadTime: 70,
      capacity: 60,
      documentation: 65,
      exportCapability: 70,
      responsiveness: 65,
      evidenceQuality: 60,
      commercialTerms: 65,
      logisticsCompatibility: 70,
    });
    expect(result.level).toBe("QUALIFIED");
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(80);
  });

  it("renormalizes when some dimensions are unknown", () => {
    const result = calculateQualification({
      identity: 80,
      productFit: 70,
      price: 75,
      // 9 dimensions unknown
    });
    expect(result.knownDimensions).toBe(3);
    expect(result.totalDimensions).toBe(12);
    expect(result.confidence).toBeLessThan(1);
    expect(result.score).toBeGreaterThan(0);
  });

  it("excludes negative scores (unknown marker)", () => {
    const result = calculateQualification({
      identity: 80,
      productFit: -1, // unknown
      price: 70,
    });
    expect(result.knownDimensions).toBe(2);
  });

  it("clamps scores to 0-100 range", () => {
    const result = calculateQualification({
      identity: 150, // over 100
      productFit: -5, // negative — excluded
      price: 80,
    });
    expect(result.dimensionScores.identity).toBe(100);
    expect(result.knownDimensions).toBe(2);
  });
});

// ─── Contradiction Detection Tests ───────────────────────────────────────────

describe("Response Contradiction Detection", () => {
  it("detects numeric contradiction above tolerance", () => {
    const contradictions = detectResponseContradictions(
      [{ fieldName: "moq", fieldValue: "300", valueType: "number" }],
      [{ fieldName: "moq", value: 1000, source: "phase13" }],
    );
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].fieldName).toBe("moq");
    expect(contradictions[0].severity).toBe("high");
  });

  it("does not flag numeric values within tolerance", () => {
    const contradictions = detectResponseContradictions(
      [{ fieldName: "moq", fieldValue: "1050", valueType: "number" }],
      [{ fieldName: "moq", value: 1000, source: "phase13" }],
    );
    expect(contradictions).toHaveLength(0);
  });

  it("detects categorical contradiction", () => {
    const contradictions = detectResponseContradictions(
      [{ fieldName: "incoterms", fieldValue: "CIF", valueType: "string" }],
      [{ fieldName: "incoterms", value: "FOB", source: "phase13" }],
    );
    expect(contradictions).toHaveLength(1);
  });

  it("does not flag matching categorical values", () => {
    const contradictions = detectResponseContradictions(
      [{ fieldName: "incoterms", fieldValue: "FOB", valueType: "string" }],
      [{ fieldName: "incoterms", value: "FOB", source: "phase13" }],
    );
    expect(contradictions).toHaveLength(0);
  });

  it("handles empty inputs", () => {
    expect(detectResponseContradictions([], [])).toEqual([]);
  });

  it("classifies price contradiction as high severity", () => {
    const contradictions = detectResponseContradictions(
      [{ fieldName: "unit_price", fieldValue: "2.00", valueType: "currency" }],
      [{ fieldName: "unit_price", value: 5.00, source: "phase11" }],
    );
    expect(contradictions[0].severity).toBe("high");
  });
});

// ─── Follow-up Generation Tests ──────────────────────────────────────────────

describe("Follow-up Generation", () => {
  it("generates MISSING_INFO for unanswered fields", () => {
    const followups = generateFollowups({
      requiredFields: ["moq", "unit_price", "lead_time"],
      providedFields: ["moq"],
      contradictions: [],
      unverifiedFields: [],
    });
    const missingFollowups = followups.filter((f) => f.followupType === "MISSING_INFO");
    expect(missingFollowups).toHaveLength(2);
  });

  it("generates CONTRADICTION follow-ups", () => {
    const followups = generateFollowups({
      requiredFields: ["moq"],
      providedFields: ["moq"],
      contradictions: [{
        fieldName: "moq",
        extractedValue: "300",
        existingValue: 1000,
        existingSource: "phase13",
        severity: "high",
        description: "MOQ contradicts",
      }],
      unverifiedFields: [],
    });
    const contradictionFollowups = followups.filter((f) => f.followupType === "CONTRADICTION");
    expect(contradictionFollowups).toHaveLength(1);
  });

  it("generates UNVERIFIED_CLAIM follow-ups", () => {
    const followups = generateFollowups({
      requiredFields: [],
      providedFields: [],
      contradictions: [],
      unverifiedFields: ["certifications"],
    });
    expect(followups).toHaveLength(1);
    expect(followups[0].followupType).toBe("UNVERIFIED_CLAIM");
  });

  it("returns empty for fully answered response with no issues", () => {
    const followups = generateFollowups({
      requiredFields: ["moq", "unit_price"],
      providedFields: ["moq", "unit_price"],
      contradictions: [],
      unverifiedFields: [],
    });
    expect(followups).toHaveLength(0);
  });

  it("prioritizes high-priority fields", () => {
    const followups = generateFollowups({
      requiredFields: ["unit_price", "certifications"],
      providedFields: [],
      contradictions: [],
      unverifiedFields: [],
    });
    const priceFollowup = followups.find((f) => f.fieldName === "unit_price");
    const certFollowup = followups.find((f) => f.fieldName === "certifications");
    expect(priceFollowup!.priority).toBeLessThan(certFollowup!.priority);
  });
});

// ─── Response Confidence Tests ───────────────────────────────────────────────

describe("Response Confidence", () => {
  it("returns 0 for all-zero inputs", () => {
    const confidence = calculateResponseConfidence({
      quantity: 0, quality: 0, independence: 0, completeness: 0, consistency: 0,
    });
    expect(confidence).toBe(0);
  });

  it("returns high confidence for strong inputs", () => {
    const confidence = calculateResponseConfidence({
      quantity: 8, quality: 90, independence: 85, completeness: 90, consistency: 95,
    });
    expect(confidence).toBeGreaterThan(0.7);
  });

  it("clamps quantity at 10", () => {
    const confidence = calculateResponseConfidence({
      quantity: 15, quality: 80, independence: 80, completeness: 80, consistency: 80,
    });
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});

// ─── Completeness Tests ──────────────────────────────────────────────────────

describe("Completeness Calculation", () => {
  it("returns 1.0 for empty required fields", () => {
    const result = calculateCompleteness([], []);
    expect(result.score).toBe(1.0);
  });

  it("returns 0 for no fields provided", () => {
    const result = calculateCompleteness(["moq", "unit_price"], []);
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(2);
  });

  it("calculates partial completeness", () => {
    const result = calculateCompleteness(
      ["moq", "unit_price", "lead_time"],
      ["moq", "unit_price"],
    );
    expect(result.score).toBeCloseTo(0.67, 1);
    expect(result.answered).toHaveLength(2);
    expect(result.missing).toEqual(["lead_time"]);
  });

  it("returns 1.0 when all fields provided", () => {
    const result = calculateCompleteness(["moq", "unit_price"], ["moq", "unit_price"]);
    expect(result.score).toBe(1.0);
  });
});

// ─── Questionnaire Tests ─────────────────────────────────────────────────────

describe("Questionnaire Generation", () => {
  it("returns all fields for INITIAL_INQUIRY", () => {
    const fields = getQuestionnaireFields("INITIAL_INQUIRY");
    expect(fields.length).toBeGreaterThan(10);
    expect(fields).toContain("moq");
    expect(fields).toContain("unit_price");
    expect(fields).toContain("lead_time");
  });

  it("returns compliance fields for SUPPLIER_VERIFICATION", () => {
    const fields = getQuestionnaireFields("SUPPLIER_VERIFICATION");
    expect(fields).toContain("certifications");
    expect(fields).toContain("documentation");
  });

  it("returns logistics fields for LOGISTICS_INQUIRY", () => {
    const fields = getQuestionnaireFields("LOGISTICS_INQUIRY");
    expect(fields).toContain("origin");
    expect(fields).toContain("incoterms");
  });

  it("returns empty for CUSTOM template", () => {
    expect(getQuestionnaireFields("CUSTOM")).toEqual([]);
  });

  it("getAllQuestionnaireFields returns all dimensions", () => {
    const all = getAllQuestionnaireFields();
    expect(all.length).toBeGreaterThan(15);
  });
});

// ─── Content Hash Tests ──────────────────────────────────────────────────────

describe("Content Hash Functions", () => {
  it("produces deterministic message hashes", () => {
    const hash1 = computeMessageContentHash({
      outreachId: "abc", direction: "OUTBOUND", channel: "EMAIL",
      bodyText: "Hello", templateType: null,
    });
    const hash2 = computeMessageContentHash({
      outreachId: "abc", direction: "OUTBOUND", channel: "EMAIL",
      bodyText: "Hello", templateType: null,
    });
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = computeMessageContentHash({
      outreachId: "abc", direction: "OUTBOUND", channel: "EMAIL",
      bodyText: "Hello", templateType: null,
    });
    const hash2 = computeMessageContentHash({
      outreachId: "abc", direction: "OUTBOUND", channel: "EMAIL",
      bodyText: "World", templateType: null,
    });
    expect(hash1).not.toBe(hash2);
  });

  it("produces deterministic response hashes", () => {
    const hash1 = computeResponseContentHash({
      outreachId: "abc", rawBody: "Response", rawChannel: "EMAIL",
      receivedAt: "2024-01-01T00:00:00Z",
    });
    const hash2 = computeResponseContentHash({
      outreachId: "abc", rawBody: "Response", rawChannel: "EMAIL",
      receivedAt: "2024-01-01T00:00:00Z",
    });
    expect(hash1).toBe(hash2);
  });

  it("produces deterministic extracted field hashes", () => {
    const hash1 = computeExtractedFieldContentHash({
      responseId: "r1", fieldName: "moq", fieldValue: "500", valueType: "number",
    });
    const hash2 = computeExtractedFieldContentHash({
      responseId: "r1", fieldName: "moq", fieldValue: "500", valueType: "number",
    });
    expect(hash1).toBe(hash2);
  });

  it("produces deterministic followup hashes", () => {
    const hash1 = computeFollowupContentHash({
      outreachId: "o1", followupType: "MISSING_INFO",
      subject: "Missing MOQ", description: "Ask for MOQ",
    });
    const hash2 = computeFollowupContentHash({
      outreachId: "o1", followupType: "MISSING_INFO",
      subject: "Missing MOQ", description: "Ask for MOQ",
    });
    expect(hash1).toBe(hash2);
  });

  it("produces deterministic qualification hashes", () => {
    const hash1 = computeQualificationContentHash({
      outreachId: "o1", dimensionScores: { identity: 80 }, score: 75, confidence: 0.8,
    });
    const hash2 = computeQualificationContentHash({
      outreachId: "o1", dimensionScores: { identity: 80 }, score: 75, confidence: 0.8,
    });
    expect(hash1).toBe(hash2);
  });

  it("produces 64-char hex SHA-256 hashes", () => {
    const hash = computeMessageContentHash({
      outreachId: "abc", direction: "OUTBOUND", channel: "EMAIL",
      bodyText: "test", templateType: null,
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
