// =============================================================================
// Phase 15 — Integration Tests: Supplier Outreach Intelligence
// =============================================================================
// 28+ adversarial integration tests verifying cross-tenant isolation,
// full outreach lifecycle, state machine enforcement, content-hash
// idempotency, response extraction, contradiction detection, follow-up
// generation, qualification scoring, evidence integration, template CRUD,
// thread event ordering, audit trail completeness, and expiration.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "@exosquad/database";
import { NotFoundError, OUTREACH_CONFIG, OutreachStateTransitionError } from "@exosquad/common";
import {
  createCampaign,
  listCampaigns,
  getCampaign,
  createOutreach,
  listOutreachs,
  getOutreach,
  createMessage,
  approveMessage,
  transitionOutreach,
  approveOutreach,
  sendOutreach,
  recordResponse,
  extractResponseFields,
  analyzeResponse,
  qualifySupplier,
  getQualification,
  getOutreachThread,
  getOutreachEvidence,
  createFollowup,
  listFollowups,
  createTemplate,
  listTemplates,
  expireStaleOutreach,
} from "../../src/services/outreach-intelligence.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function randomHash(): string {
  return sha256(`seed-${Math.random()}-${Date.now()}`);
}

async function createTenant(name: string) {
  return prisma.tenant.create({
    data: {
      name,
      slug: `test-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
  });
}

async function createProduct(tenantId: string, name: string) {
  return prisma.product.create({
    data: {
      tenantId,
      name,
      normalizedName: name.toLowerCase(),
      searchKey: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
    },
  });
}

async function createSupplier(tenantId: string, name: string, overrides: Record<string, unknown> = {}) {
  return prisma.supplier.create({
    data: {
      tenantId,
      name,
      normalizedName: name.toLowerCase(),
      country: "CN",
      supplierRole: "manufacturer",
      identityStatus: "resolved",
      ...overrides,
    } as never,
  });
}

async function createProductSupplier(
  tenantId: string,
  productId: string,
  supplierId: string,
  overrides: Record<string, unknown> = {},
) {
  return prisma.productSupplier.create({
    data: {
      tenantId,
      productId,
      supplierId,
      observedAt: new Date(),
      ...overrides,
    } as never,
  });
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("Outreach Intelligence — Integration Tests (28+ adversarial cases)", () => {
  let tenant1: { id: string };
  let tenant2: { id: string };
  let product1: { id: string };
  let product2: { id: string };
  let supplier1: { id: string };
  let supplier2: { id: string };
  let crossTenantSupplier: { id: string };

  beforeAll(async () => {
    tenant1 = await createTenant("P15 Test Tenant 1");
    tenant2 = await createTenant("P15 Test Tenant 2");

    product1 = await createProduct(tenant1.id, "P15 Samsung Galaxy A55");
    product2 = await createProduct(tenant1.id, "P15 iPhone 16 Case");

    supplier1 = await createSupplier(tenant1.id, "P15 Shenzhen Electronics Co", {
      country: "CN",
      supplierRole: "manufacturer",
      email: "sales@shenzhen-p15.com",
    });
    supplier2 = await createSupplier(tenant1.id, "P15 HK Trading Ltd", {
      country: "HK",
      supplierRole: "distributor",
    });
    crossTenantSupplier = await createSupplier(tenant2.id, "P15 Cross-Tenant Supplier", {
      country: "KR",
    });

    // Existing product-supplier link with known values for contradiction testing
    await createProductSupplier(tenant1.id, product1.id, supplier1.id, {
      price: 250,
      currency: "USD",
      moq: 100,
      leadTimeDays: 14,
    });
  });

  afterAll(async () => {
    const tenantIds = [tenant1.id, tenant2.id];
    // Cleanup in FK-safe order
    await prisma.outreachAuditEntry.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreachThreadEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreachQualification.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreachFollowup.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreachExtractedField.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreachResponse.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreachMessage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreach.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreachCampaign.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.outreachTemplate.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.evidence.deleteMany({
      where: { tenantId: { in: tenantIds }, evidenceType: "SUPPLIER_RESPONSE_FIELD" },
    });
    await prisma.productSupplier.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.product.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.supplier.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  // ─── 1. Campaign Creation & Tenant Isolation ───────────────────────────────

  it("1. campaign creation: creates campaign with audit trail", async () => {
    const campaign = await createCampaign({
      tenantId: tenant1.id,
      productId: product1.id,
      title: "Source Galaxy A55 from China",
      objective: "Find reliable manufacturer",
      targetMarket: "Bangladesh",
    });

    expect(campaign.id).toBeTruthy();
    expect(campaign.title).toBe("Source Galaxy A55 from China");
    expect(campaign.status).toBe("ACTIVE");

    // Verify audit entry
    const audits = await prisma.outreachAuditEntry.findMany({
      where: { tenantId: tenant1.id, campaignId: campaign.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0]!.action).toBe("CAMPAIGN_CREATED");
  });

  it("2. tenant isolation: tenant2 cannot access tenant1 campaign", async () => {
    const campaign = await createCampaign({
      tenantId: tenant1.id,
      productId: product1.id,
      title: "Tenant1 Private Campaign",
    });

    // tenant2 should not find it
    await expect(
      getCampaign({ tenantId: tenant2.id, campaignId: campaign.id }),
    ).rejects.toThrow(NotFoundError);
  });

  it("3. campaign listing: returns paginated results", async () => {
    const result = await listCampaigns({ tenantId: tenant1.id, page: 1, limit: 10 });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.pagination.page).toBe(1);
  });

  // ─── 2. Outreach Creation & Lifecycle ──────────────────────────────────────

  it("4. outreach creation: creates in DRAFT status with audit + thread event", async () => {
    const campaign = await createCampaign({
      tenantId: tenant1.id,
      productId: product1.id,
      title: "Lifecycle Test Campaign",
    });

    const outreach = await createOutreach({
      tenantId: tenant1.id,
      campaignId: campaign.id,
      supplierId: supplier1.id,
      productId: product1.id,
      channel: "EMAIL",
      templateType: "INITIAL_INQUIRY",
    });

    expect(outreach.id).toBeTruthy();
    expect(outreach.status).toBe("DRAFT");

    // Verify audit trail
    const audits = await prisma.outreachAuditEntry.findMany({
      where: { tenantId: tenant1.id, outreachId: outreach.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits.some((a) => a.action === "OUTREACH_CREATED")).toBe(true);

    // Verify thread event
    const events = await prisma.outreachThreadEvent.findMany({
      where: { tenantId: tenant1.id, outreachId: outreach.id },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e.eventType === "STATUS_CHANGED")).toBe(true);
  });

  it("5. cross-tenant outreach: tenant2 cannot create outreach for tenant1 product", async () => {
    await expect(
      createOutreach({
        tenantId: tenant2.id,
        supplierId: crossTenantSupplier.id,
        productId: product1.id, // tenant1's product
      }),
    ).rejects.toThrow();
  });

  // ─── 3. Full Lifecycle: Draft → Approve → Send → Respond → Extract → Analyze → Qualify ─

  it("6. full lifecycle: complete end-to-end workflow", async () => {
    // Step 1: Create campaign + outreach
    const campaign = await createCampaign({
      tenantId: tenant1.id,
      productId: product1.id,
      title: "Full Lifecycle Campaign",
    });

    const outreach = await createOutreach({
      tenantId: tenant1.id,
      campaignId: campaign.id,
      supplierId: supplier1.id,
      productId: product1.id,
      channel: "EMAIL",
    });

    // Step 2: Create message (draft)
    const message = await createMessage({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      direction: "OUTBOUND",
      channel: "EMAIL",
      subject: "Inquiry about Galaxy A55",
      bodyText: "Dear Supplier, We would like to inquire about...",
      templateType: "INITIAL_INQUIRY",
      aiGenerated: true,
    });
    expect(message.id).toBeTruthy();
    expect(message.contentHash).toMatch(/^[a-f0-9]{64}$/);

    // Step 3: Approve message
    await approveMessage({
      tenantId: tenant1.id,
      messageId: message.id,
      approvedBy: "user-123",
    });

    // Verify approval recorded
    const msgRecord = await prisma.outreachMessage.findFirst({
      where: { id: message.id },
    });
    expect(msgRecord!.approvedBy).toBe("user-123");
    expect(msgRecord!.approvedAt).not.toBeNull();

    // Step 4: Transition DRAFT → READY → APPROVED
    await transitionOutreach({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      toStatus: "READY",
      actorType: "SYSTEM",
    });

    const approved = await approveOutreach({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      approvedBy: "user-123",
    });
    expect(approved.newStatus).toBe("APPROVED");

    // Step 5: Send outreach
    const sent = await sendOutreach({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });
    expect(sent.newStatus).toBe("SENT");
    expect(sent.previousStatus).toBe("APPROVED");

    // Step 6: Record supplier response
    const response = await recordResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      rawBody: "Thank you for your inquiry. Our MOQ is 50 units at $280 per unit with 21-day lead time.",
      rawChannel: "EMAIL",
      contactPerson: "Mr. Zhang",
    });
    expect(response.id).toBeTruthy();
    expect(response.isDuplicate).toBe(false);

    // Step 7: Extract response fields
    const extraction = await extractResponseFields({
      tenantId: tenant1.id,
      responseId: response.id,
      fields: [
        { fieldName: "moq", fieldValue: "50", valueType: "number" },
        { fieldName: "unit_price", fieldValue: "280", valueType: "currency" },
        { fieldName: "lead_time", fieldValue: "21", valueType: "number" },
      ],
    });
    expect(extraction.extractedCount).toBe(3);

    // Step 8: Analyze response (contradiction detection + follow-up generation)
    const analysis = await analyzeResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });
    // MOQ 50 vs existing 100 = 50% diff > 20% tolerance → contradiction
    expect(analysis.contradictions.length).toBeGreaterThanOrEqual(1);
    expect(analysis.confidence).toBeGreaterThan(0);

    // Step 9: Qualify supplier
    const qualification = await qualifySupplier({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });
    expect(qualification.id).toBeTruthy();
    expect(qualification.score).toBeGreaterThan(0);
    expect(["NOT_QUALIFIED", "WEAK", "CONDITIONAL", "QUALIFIED", "STRONG"]).toContain(qualification.level);
  });

  // ─── 4. State Machine Enforcement ──────────────────────────────────────────

  it("7. state machine: invalid transition throws OutreachStateTransitionError", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    // DRAFT → SENT is not valid (must go through READY, APPROVED first)
    await expect(
      transitionOutreach({
        tenantId: tenant1.id,
        outreachId: outreach.id,
        toStatus: "SENT",
        actorType: "USER",
      }),
    ).rejects.toThrow(OutreachStateTransitionError);
  });

  it("8. state machine: CLOSED is terminal (no transitions allowed)", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    // DRAFT → CLOSED is valid
    await transitionOutreach({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      toStatus: "CLOSED",
      actorType: "USER",
    });

    // CLOSED → anything should fail
    await expect(
      transitionOutreach({
        tenantId: tenant1.id,
        outreachId: outreach.id,
        toStatus: "DRAFT",
        actorType: "USER",
      }),
    ).rejects.toThrow(OutreachStateTransitionError);
  });

  // ─── 5. Response Idempotency ───────────────────────────────────────────────

  it("9. response idempotency: duplicate response returns existing id", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    const body = "Identical response body for idempotency test";

    const r1 = await recordResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      rawBody: body,
      rawChannel: "EMAIL",
      receivedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(r1.isDuplicate).toBe(false);

    const r2 = await recordResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      rawBody: body,
      rawChannel: "EMAIL",
      receivedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(r2.isDuplicate).toBe(true);
    expect(r2.id).toBe(r1.id);
  });

  // ─── 6. Extraction Idempotency ─────────────────────────────────────────────

  it("10. extraction idempotency: duplicate field extraction skipped", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    const response = await recordResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      rawBody: "MOQ is 200 units",
      rawChannel: "EMAIL",
    });

    const e1 = await extractResponseFields({
      tenantId: tenant1.id,
      responseId: response.id,
      fields: [{ fieldName: "moq", fieldValue: "200", valueType: "number" }],
    });
    expect(e1.extractedCount).toBe(1);

    // Same field again — should be skipped
    const e2 = await extractResponseFields({
      tenantId: tenant1.id,
      responseId: response.id,
      fields: [{ fieldName: "moq", fieldValue: "200", valueType: "number" }],
    });
    expect(e2.extractedCount).toBe(0); // duplicate skipped
  });

  // ─── 7. Contradiction Detection ────────────────────────────────────────────

  it("11. contradiction detection: supplier claim contradicts existing intelligence", async () => {
    // product1/supplier1 has moq=100 in product_supplier
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    const response = await recordResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      rawBody: "Our MOQ is 300 units at $500 per unit",
      rawChannel: "EMAIL",
    });

    await extractResponseFields({
      tenantId: tenant1.id,
      responseId: response.id,
      fields: [
        { fieldName: "moq", fieldValue: "300", valueType: "number" },
        { fieldName: "unit_price", fieldValue: "500", valueType: "currency" },
      ],
    });

    const analysis = await analyzeResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });

    // MOQ: 300 vs 100 = 200% diff → contradicted
    expect(analysis.contradictions.length).toBeGreaterThanOrEqual(1);
    const moqContradiction = analysis.contradictions.find(
      (c: unknown) => (c as { fieldName: string }).fieldName === "moq",
    );
    expect(moqContradiction).toBeTruthy();
  });

  it("12. no contradiction: values within tolerance pass", async () => {
    // product1/supplier1 has moq=100, price=250, leadTime=14
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    const response = await recordResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      rawBody: "MOQ 110, price $260, lead time 15 days",
      rawChannel: "EMAIL",
    });

    await extractResponseFields({
      tenantId: tenant1.id,
      responseId: response.id,
      fields: [
        { fieldName: "moq", fieldValue: "110", valueType: "number" },
        { fieldName: "unit_price", fieldValue: "260", valueType: "currency" },
        { fieldName: "lead_time", fieldValue: "15", valueType: "number" },
      ],
    });

    const analysis = await analyzeResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });

    // All within 20% tolerance → no contradictions
    expect(analysis.contradictions).toHaveLength(0);
  });

  // ─── 8. Evidence Creation from Extracted Fields ────────────────────────────

  it("13. evidence integration: extracted fields create evidence records", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier2.id,
      productId: product1.id,
    });

    const response = await recordResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      rawBody: "We offer certifications and export capability",
      rawChannel: "EMAIL",
    });

    await extractResponseFields({
      tenantId: tenant1.id,
      responseId: response.id,
      fields: [
        { fieldName: "certifications", fieldValue: "ISO9001", valueType: "string" },
        { fieldName: "export_eligibility", fieldValue: "yes", valueType: "string" },
      ],
    });

    const evidence = await getOutreachEvidence({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });
    expect(evidence.length).toBeGreaterThanOrEqual(2);

    // Verify evidence is linked to supplier
    for (const e of evidence as Array<{ entityType: string; entityId: string; evidenceType: string }>) {
      expect(e.entityType).toBe("supplier");
      expect(e.entityId).toBe(supplier2.id);
      expect(e.evidenceType).toBe("SUPPLIER_RESPONSE_FIELD");
    }
  });

  // ─── 9. Follow-up Generation ──────────────────────────────────────────────

  it("14. follow-up generation: missing fields generate follow-ups", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    const response = await recordResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      rawBody: "Our price is $300 per unit",
      rawChannel: "EMAIL",
    });

    // Only extract price — leave many other fields missing
    await extractResponseFields({
      tenantId: tenant1.id,
      responseId: response.id,
      fields: [{ fieldName: "unit_price", fieldValue: "300", valueType: "currency" }],
    });

    const analysis = await analyzeResponse({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });

    // Should generate follow-ups for missing required fields
    expect(analysis.followups.length).toBeGreaterThan(0);
    const missingInfoFollowups = analysis.followups.filter(
      (f: unknown) => (f as { followupType: string }).followupType === "MISSING_INFO",
    );
    expect(missingInfoFollowups.length).toBeGreaterThan(0);
  });

  it("15. follow-up idempotency: duplicate follow-up not created", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    const fu1 = await createFollowup({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      followupType: "MISSING_INFO",
      subject: "Need MOQ info",
      description: "MOQ was not provided in the response",
    });

    const fu2 = await createFollowup({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      followupType: "MISSING_INFO",
      subject: "Need MOQ info",
      description: "MOQ was not provided in the response",
    });

    expect(fu2.id).toBe(fu1.id); // Same contentHash → same record
  });

  // ─── 10. Qualification Scoring ─────────────────────────────────────────────

  it("16. qualification: scoring works with partial data (Unknown ≠ Zero)", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    // Qualify without any response data
    const q = await qualifySupplier({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });

    expect(q.score).toBeGreaterThan(0); // identity + productFit always set
    expect(q.confidence).toBeLessThan(1); // Not all dimensions known
    expect(q.level).toBeTruthy();
  });

  it("17. qualification: version increments on re-qualification", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    await qualifySupplier({ tenantId: tenant1.id, outreachId: outreach.id });
    const q2 = await qualifySupplier({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      dimensionOverrides: { identity: 90 },
    });

    const quals = await prisma.outreachQualification.findMany({
      where: { tenantId: tenant1.id, outreachId: outreach.id },
      orderBy: { version: "asc" },
    });
    expect(quals.length).toBeGreaterThanOrEqual(2);
    expect(quals[0]!.version).toBeLessThan(quals[1]!.version);
  });

  it("18. getQualification: returns latest version", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    await qualifySupplier({ tenantId: tenant1.id, outreachId: outreach.id });
    const q2 = await qualifySupplier({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      dimensionOverrides: { identity: 95, price: 85 },
    });

    const latest = await getQualification({ tenantId: tenant1.id, outreachId: outreach.id }) as {
      id: string;
      score: number;
    };
    expect(latest.id).toBe(q2.id);
  });

  // ─── 11. Thread Event Ordering ────────────────────────────────────────────

  it("19. thread events: unified timeline is chronologically ordered", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    // Create several events
    await createMessage({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      direction: "OUTBOUND",
      channel: "EMAIL",
      bodyText: "Initial inquiry message",
    });

    await transitionOutreach({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      toStatus: "READY",
      actorType: "SYSTEM",
    });

    const thread = await getOutreachThread({
      tenantId: tenant1.id,
      outreachId: outreach.id,
    });

    expect(thread.length).toBeGreaterThanOrEqual(2);

    // Verify chronological ordering
    const items = thread as Array<{ timestamp: Date }>;
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i]!.timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(items[i - 1]!.timestamp).getTime(),
      );
    }
  });

  // ─── 12. Template CRUD ────────────────────────────────────────────────────

  it("20. template CRUD: create and list templates", async () => {
    const t1 = await createTemplate({
      tenantId: tenant1.id,
      templateType: "INITIAL_INQUIRY",
      name: "Standard Initial Inquiry",
      subjectTemplate: "Inquiry about {{productName}}",
      bodyTemplate: "Dear {{supplierName}}, We are interested in...",
    });
    expect(t1.id).toBeTruthy();

    const t2 = await createTemplate({
      tenantId: tenant1.id,
      templateType: "FOLLOW_UP",
      name: "Follow-up Reminder",
      bodyTemplate: "Dear {{supplierName}}, Following up on our previous inquiry...",
    });

    const templates = await listTemplates({ tenantId: tenant1.id });
    expect(templates.length).toBeGreaterThanOrEqual(2);

    // Filter by type
    const initialInquiries = await listTemplates({ tenantId: tenant1.id, templateType: "INITIAL_INQUIRY" });
    expect(initialInquiries.length).toBeGreaterThanOrEqual(1);
  });

  it("21. template isolation: tenant2 cannot see tenant1 templates", async () => {
    await createTemplate({
      tenantId: tenant1.id,
      templateType: "CUSTOM",
      name: "Tenant1 Custom Template",
      bodyTemplate: "Private template body",
    });

    const tenant2Templates = await listTemplates({ tenantId: tenant2.id });
    const tenant1Templates = await listTemplates({ tenantId: tenant1.id });

    const t2Names = tenant2Templates.map((t: unknown) => (t as { name: string }).name);
    expect(t2Names).not.toContain("Tenant1 Custom Template");
    expect(tenant1Templates.length).toBeGreaterThan(tenant2Templates.length);
  });

  // ─── 13. Campaign with Multiple Outreachs ──────────────────────────────────

  it("22. campaign with multiple outreachs: getCampaign includes all", async () => {
    const campaign = await createCampaign({
      tenantId: tenant1.id,
      productId: product1.id,
      title: "Multi-Outreach Campaign",
    });

    await createOutreach({
      tenantId: tenant1.id,
      campaignId: campaign.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    await createOutreach({
      tenantId: tenant1.id,
      campaignId: campaign.id,
      supplierId: supplier2.id,
      productId: product1.id,
    });

    const full = await getCampaign({ tenantId: tenant1.id, campaignId: campaign.id }) as {
      outreachs: unknown[];
    };
    expect(full.outreachs.length).toBeGreaterThanOrEqual(2);
  });

  // ─── 14. Audit Trail Completeness ──────────────────────────────────────────

  it("23. audit trail: all major actions produce audit entries", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    await createMessage({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      direction: "OUTBOUND",
      channel: "EMAIL",
      bodyText: "Test audit message",
    });

    await transitionOutreach({
      tenantId: tenant1.id,
      outreachId: outreach.id,
      toStatus: "READY",
      actorType: "SYSTEM",
    });

    const audits = await prisma.outreachAuditEntry.findMany({
      where: { tenantId: tenant1.id, outreachId: outreach.id },
      orderBy: { createdAt: "asc" },
    });

    // Should have: OUTREACH_CREATED, MESSAGE_CREATED, STATUS_CHANGED
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("OUTREACH_CREATED");
    expect(actions).toContain("MESSAGE_CREATED");
    expect(actions).toContain("STATUS_CHANGED");
  });

  // ─── 15. Send Without Approval Rejected ────────────────────────────────────

  it("24. send without approval: throws ValidationError", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    // outreach is DRAFT — cannot send
    await expect(
      sendOutreach({ tenantId: tenant1.id, outreachId: outreach.id }),
    ).rejects.toThrow();
  });

  // ─── 16. Expiration ────────────────────────────────────────────────────────

  it("25. expiration: fresh outreach not expired", async () => {
    await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    const result = await expireStaleOutreach({ tenantId: tenant1.id });
    // Fresh outreach should NOT be expired
    expect(result.expiredCount).toBe(0);
  });

  it("26. expiration: stale outreach gets closed", async () => {
    const outreach = await createOutreach({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      productId: product1.id,
    });

    // Manually backdate the outreach
    const oldDate = new Date(
      Date.now() - (OUTREACH_CONFIG.stalenessThresholds.outreachExpireDays + 10) * 86400000,
    );
    await prisma.outreach.update({
      where: { id: outreach.id },
      data: { updatedAt: oldDate },
    });

    const result = await expireStaleOutreach({ tenantId: tenant1.id });
    expect(result.expiredCount).toBeGreaterThanOrEqual(1);

    // Verify the outreach is now CLOSED
    const updated = await prisma.outreach.findFirst({
      where: { id: outreach.id },
    });
    expect(updated!.status).toBe("CLOSED");
  });

  // ─── 17. Content Hash Format ──────────────────────────────────────────────

  it("27. content hashes: all hashes are valid SHA-256 hex", async () => {
    const messages = await prisma.outreachMessage.findMany({
      where: { tenantId: tenant1.id },
    });
    for (const m of messages) {
      expect(m.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }

    const responses = await prisma.outreachResponse.findMany({
      where: { tenantId: tenant1.id },
    });
    for (const r of responses) {
      expect(r.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }

    const fields = await prisma.outreachExtractedField.findMany({
      where: { tenantId: tenant1.id },
    });
    for (const f of fields) {
      expect(f.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  // ─── 18. List Outreachs Filtering ─────────────────────────────────────────

  it("28. list outreachs: filters by supplier and status", async () => {
    const result = await listOutreachs({
      tenantId: tenant1.id,
      supplierId: supplier1.id,
      page: 1,
      limit: 100,
    });
    expect(result.data.length).toBeGreaterThanOrEqual(1);

    // All returned outreachs should belong to supplier1
    for (const o of result.data as Array<{ supplier: { id: string } }>) {
      expect(o.supplier.id).toBe(supplier1.id);
    }
  });

  // ─── 19. Nonexistent Entity Access ─────────────────────────────────────────

  it("29. nonexistent outreach: getOutreach throws NotFoundError", async () => {
    await expect(
      getOutreach({ tenantId: tenant1.id, outreachId: "nonexistent-id" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("30. nonexistent campaign: getCampaign throws NotFoundError", async () => {
    await expect(
      getCampaign({ tenantId: tenant1.id, campaignId: "nonexistent-id" }),
    ).rejects.toThrow(NotFoundError);
  });
});
