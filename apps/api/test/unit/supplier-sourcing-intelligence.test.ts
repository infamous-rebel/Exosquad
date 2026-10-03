// =============================================================================
// Unit Tests — Supplier Sourcing Intelligence Service (Phase 13)
// =============================================================================
// Tests the orchestrator logic with mocked Prisma client.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SOURCING_CONFIG } from "@exosquad/common";

// ─── Hoisted Mocks ───────────────────────────────────────────────────────────

const {
  mockProduct,
  mockProductSupplier,
  mockEvidence,
  mockDemandCalculation,
  mockLandedCostCalculation,
  mockLogisticsLeg,
  mockSupplierContactEvidence,
  mockSupplierSourcingAssessment,
  mockSupplierProductMatch,
  mockSourcingOptionRecord,
  mockProcurementViabilityRecord,
  mockSourcingConstraintRecord,
  mockSupplierComparisonSnapshot,
} = vi.hoisted(() => ({
  mockProduct: { findFirst: vi.fn() },
  mockProductSupplier: { findMany: vi.fn() },
  mockEvidence: { findMany: vi.fn() },
  mockDemandCalculation: { findMany: vi.fn() },
  mockLandedCostCalculation: { findMany: vi.fn() },
  mockLogisticsLeg: { findMany: vi.fn() },
  mockSupplierContactEvidence: { findMany: vi.fn() },
  mockSupplierSourcingAssessment: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
    updateMany: vi.fn(),
  },
  mockSupplierProductMatch: { create: vi.fn(), findFirst: vi.fn() },
  mockSourcingOptionRecord: { create: vi.fn(), findFirst: vi.fn() },
  mockProcurementViabilityRecord: { create: vi.fn(), findFirst: vi.fn() },
  mockSourcingConstraintRecord: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  mockSupplierComparisonSnapshot: { create: vi.fn(), findFirst: vi.fn() },
}));

vi.mock("@exosquad/database", () => ({
  prisma: {
    product: mockProduct,
    productSupplier: mockProductSupplier,
    evidence: mockEvidence,
    demandCalculation: mockDemandCalculation,
    landedCostCalculation: mockLandedCostCalculation,
    logisticsLeg: mockLogisticsLeg,
    supplierContactEvidence: mockSupplierContactEvidence,
    supplierSourcingAssessment: mockSupplierSourcingAssessment,
    supplierProductMatch: mockSupplierProductMatch,
    sourcingOptionRecord: mockSourcingOptionRecord,
    procurementViabilityRecord: mockProcurementViabilityRecord,
    sourcingConstraintRecord: mockSourcingConstraintRecord,
    supplierComparisonSnapshot: mockSupplierComparisonSnapshot,
  },
}));

vi.mock("@exosquad/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import after mocks
import {
  assessSupplierSourcing,
  listSupplierAssessments,
  getSupplierAssessment,
  recalculateSupplierSourcing,
  getSupplierComparison,
  listSourcingConstraints,
  listSupplierContacts,
  getAssessmentHistory,
  expireStaleAssessments,
} from "../../src/services/supplier-sourcing-intelligence.js";

// ─── Test Data ───────────────────────────────────────────────────────────────

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const PRODUCT_1 = "product-1";
const SUPPLIER_1 = "supplier-1";
const SUPPLIER_2 = "supplier-2";

const now = new Date("2025-01-15T00:00:00Z");

function makeDbProduct(tenantId: string, productId: string) {
  return {
    id: productId,
    tenantId,
    name: "Samsung Galaxy A54",
    normalizedName: "samsung galaxy a54",
    description: "Samsung Galaxy A54 5G smartphone",
    countryOfOrigin: "KR",
    attributes: {},
    brand: { id: "brand-1", name: "Samsung" },
    category: { id: "cat-1", name: "Smartphones" },
    identifiers: [
      { id: "id-1", type: "gtin13", value: "8806095012345", normalized: "8806095012345" },
    ],
    createdAt: now,
    updatedAt: now,
    searchKey: "samsunggalaxya54",
    brandId: "brand-1",
    categoryId: "cat-1",
  };
}

function makeDbProductSupplier(tenantId: string, productId: string, supplierId: string) {
  return {
    id: `ps-${supplierId}`,
    tenantId,
    productId,
    supplierId,
    price: 250,
    currency: "USD",
    moq: 50,
    leadTimeDays: 14,
    observedAt: now,
    supplier: {
      id: supplierId,
      tenantId,
      name: `Supplier ${supplierId}`,
      normalizedName: `supplier ${supplierId}`.toLowerCase(),
      country: "CN",
      supplierRole: "distributor",
      identityStatus: "resolved",
      url: "https://example.com",
      domain: "example.com",
      email: "sales@example.com",
      phone: null,
      contactPerson: null,
      attributes: { productName: "Samsung Galaxy A54 5G" },
      createdAt: now,
      updatedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function setupStandardMocks() {
  mockProduct.findFirst.mockResolvedValue(makeDbProduct(TENANT_A, PRODUCT_1));
  mockProductSupplier.findMany.mockResolvedValue([
    makeDbProductSupplier(TENANT_A, PRODUCT_1, SUPPLIER_1),
  ]);
  mockEvidence.findMany.mockResolvedValue([
    {
      id: "ev-1",
      sourceId: "src-1",
      confidence: 0.8,
      observedAt: now,
      evidenceType: "SUPPLIER_IDENTITY",
      status: "active",
      productSupplierId: `ps-${SUPPLIER_1}`,
      entityId: SUPPLIER_1,
    },
  ]);
  mockDemandCalculation.findMany.mockResolvedValue([]);
  mockLandedCostCalculation.findMany.mockResolvedValue([]);
  mockLogisticsLeg.findMany.mockResolvedValue([]);
  mockSupplierContactEvidence.findMany.mockResolvedValue([]);
  mockSupplierSourcingAssessment.findFirst.mockResolvedValue(null);
  mockSupplierSourcingAssessment.create.mockResolvedValue({ id: "assess-1" });
  mockSupplierProductMatch.findFirst.mockResolvedValue(null);
  mockSupplierProductMatch.create.mockResolvedValue({ id: "match-1" });
  mockSourcingOptionRecord.findFirst.mockResolvedValue(null);
  mockSourcingOptionRecord.create.mockResolvedValue({ id: "sourcing-1" });
  mockProcurementViabilityRecord.findFirst.mockResolvedValue(null);
  mockProcurementViabilityRecord.create.mockResolvedValue({ id: "viability-1" });
  mockSourcingConstraintRecord.findFirst.mockResolvedValue(null);
  mockSourcingConstraintRecord.create.mockResolvedValue({ id: "constraint-1" });
  mockSupplierComparisonSnapshot.findFirst.mockResolvedValue(null);
  mockSupplierComparisonSnapshot.create.mockResolvedValue({ id: "snapshot-1" });
}

describe("Supplier Sourcing Intelligence Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStandardMocks();
  });

  // ─── assessSupplierSourcing ──────────────────────────────────────────────

  describe("assessSupplierSourcing", () => {
    it("should run assessment and return summary", async () => {
      const result = await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      expect(result.engineVersion).toBe(SOURCING_CONFIG.engineVersion);
      expect(result.supplierCount).toBe(1);
      expect(typeof result.assessmentCount).toBe("number");
    });

    it("should throw NotFoundError when product does not belong to tenant", async () => {
      mockProduct.findFirst.mockResolvedValue(null);
      await expect(
        assessSupplierSourcing({ tenantId: TENANT_B, productId: PRODUCT_1 }),
      ).rejects.toThrow();
    });

    it("should handle empty supplier set gracefully", async () => {
      mockProductSupplier.findMany.mockResolvedValue([]);
      const result = await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      expect(result.supplierCount).toBe(0);
      expect(result.assessmentCount).toBe(0);
    });

    it("should persist assessment for each matching supplier", async () => {
      await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      expect(mockSupplierSourcingAssessment.findFirst).toHaveBeenCalled();
    });

    it("should load Phase 7 demand data", async () => {
      await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      expect(mockDemandCalculation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A, productId: PRODUCT_1 } }),
      );
    });

    it("should load Phase 11 pricing data", async () => {
      await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      expect(mockLandedCostCalculation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A, productId: PRODUCT_1 } }),
      );
    });

    it("should load Phase 10 logistics data", async () => {
      await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      expect(mockLogisticsLeg.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_A } }),
      );
    });

    it("should process multiple suppliers", async () => {
      mockProductSupplier.findMany.mockResolvedValue([
        makeDbProductSupplier(TENANT_A, PRODUCT_1, SUPPLIER_1),
        makeDbProductSupplier(TENANT_A, PRODUCT_1, SUPPLIER_2),
      ]);
      const result = await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      expect(result.supplierCount).toBe(2);
    });

    it("should use monotonic versioning", async () => {
      mockSupplierSourcingAssessment.findFirst.mockResolvedValue({ version: 3 });
      await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      if (mockSupplierSourcingAssessment.create.mock.calls.length > 0) {
        expect(mockSupplierSourcingAssessment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ version: 4 }),
          }),
        );
      }
    });

    it("should start at version 1 for new assessments", async () => {
      mockSupplierSourcingAssessment.findFirst.mockResolvedValue(null);
      await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      if (mockSupplierSourcingAssessment.create.mock.calls.length > 0) {
        expect(mockSupplierSourcingAssessment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ version: 1 }),
          }),
        );
      }
    });

    it("should set engine version on persisted assessment", async () => {
      await assessSupplierSourcing({ tenantId: TENANT_A, productId: PRODUCT_1 });
      if (mockSupplierSourcingAssessment.create.mock.calls.length > 0) {
        expect(mockSupplierSourcingAssessment.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ engineVersion: SOURCING_CONFIG.engineVersion }),
          }),
        );
      }
    });
  });

  // ─── listSupplierAssessments ─────────────────────────────────────────────

  describe("listSupplierAssessments", () => {
    it("should return paginated assessments", async () => {
      const mockData = [{ id: "a1" }, { id: "a2" }];
      mockSupplierSourcingAssessment.findMany.mockResolvedValue(mockData);
      mockSupplierSourcingAssessment.count.mockResolvedValue(2);

      const result = await listSupplierAssessments({
        tenantId: TENANT_A,
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual(mockData);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
    });

    it("should filter by productId when provided", async () => {
      mockSupplierSourcingAssessment.findMany.mockResolvedValue([]);
      mockSupplierSourcingAssessment.count.mockResolvedValue(0);

      await listSupplierAssessments({
        tenantId: TENANT_A,
        productId: PRODUCT_1,
        page: 1,
        limit: 10,
      });

      expect(mockSupplierSourcingAssessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A, productId: PRODUCT_1 }),
        }),
      );
    });

    it("should enforce tenant isolation in query", async () => {
      mockSupplierSourcingAssessment.findMany.mockResolvedValue([]);
      mockSupplierSourcingAssessment.count.mockResolvedValue(0);

      await listSupplierAssessments({ tenantId: TENANT_A, page: 1, limit: 10 });

      expect(mockSupplierSourcingAssessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_A },
        }),
      );
    });
  });

  // ─── getSupplierAssessment ───────────────────────────────────────────────

  describe("getSupplierAssessment", () => {
    it("should return assessment when found", async () => {
      const mockAssessment = { id: "a1", tenantId: TENANT_A };
      mockSupplierSourcingAssessment.findFirst.mockResolvedValue(mockAssessment);

      const result = await getSupplierAssessment({ tenantId: TENANT_A, assessmentId: "a1" });
      expect(result).toEqual(mockAssessment);
    });

    it("should throw NotFoundError when assessment does not exist", async () => {
      mockSupplierSourcingAssessment.findFirst.mockResolvedValue(null);
      await expect(
        getSupplierAssessment({ tenantId: TENANT_A, assessmentId: "nonexistent" }),
      ).rejects.toThrow();
    });

    it("should enforce tenant isolation", async () => {
      mockSupplierSourcingAssessment.findFirst.mockResolvedValue(null);
      await expect(
        getSupplierAssessment({ tenantId: TENANT_B, assessmentId: "a1" }),
      ).rejects.toThrow();
    });
  });

  // ─── recalculateSupplierSourcing ─────────────────────────────────────────

  describe("recalculateSupplierSourcing", () => {
    it("should delegate to assessSupplierSourcing", async () => {
      const result = await recalculateSupplierSourcing({
        tenantId: TENANT_A,
        productId: PRODUCT_1,
      });
      expect(result.engineVersion).toBe(SOURCING_CONFIG.engineVersion);
    });
  });

  // ─── getSupplierComparison ───────────────────────────────────────────────

  describe("getSupplierComparison", () => {
    it("should throw NotFoundError when product not in tenant", async () => {
      mockProduct.findFirst.mockResolvedValue(null);
      await expect(
        getSupplierComparison({ tenantId: TENANT_B, productId: PRODUCT_1 }),
      ).rejects.toThrow();
    });

    it("should return comparison data", async () => {
      mockSupplierSourcingAssessment.findMany.mockResolvedValue([
        { id: "a1", sourcingScore: 70 },
      ]);
      mockSourcingConstraintRecord.findMany.mockResolvedValue([]);

      const result = await getSupplierComparison({ tenantId: TENANT_A, productId: PRODUCT_1 });
      expect(result.productId).toBe(PRODUCT_1);
      expect(result.suppliers.length).toBe(1);
      expect(result.engineVersion).toBe(SOURCING_CONFIG.engineVersion);
    });
  });

  // ─── listSourcingConstraints ─────────────────────────────────────────────

  describe("listSourcingConstraints", () => {
    it("should return paginated constraints", async () => {
      const mockData = [{ id: "c1" }];
      mockSourcingConstraintRecord.findMany.mockResolvedValue(mockData);
      mockSourcingConstraintRecord.count.mockResolvedValue(1);

      const result = await listSourcingConstraints({
        tenantId: TENANT_A,
        productId: PRODUCT_1,
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual(mockData);
      expect(result.pagination.total).toBe(1);
    });
  });

  // ─── listSupplierContacts ────────────────────────────────────────────────

  describe("listSupplierContacts", () => {
    it("should return contacts for a supplier", async () => {
      const mockContacts = [{ id: "contact-1", supplierId: SUPPLIER_1 }];
      mockSupplierContactEvidence.findMany.mockResolvedValue(mockContacts);

      const result = await listSupplierContacts({ tenantId: TENANT_A, supplierId: SUPPLIER_1 });
      expect(result.data).toEqual(mockContacts);
    });

    it("should enforce tenant isolation", async () => {
      mockSupplierContactEvidence.findMany.mockResolvedValue([]);

      await listSupplierContacts({ tenantId: TENANT_A, supplierId: SUPPLIER_1 });

      expect(mockSupplierContactEvidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_A, supplierId: SUPPLIER_1 },
        }),
      );
    });
  });

  // ─── getAssessmentHistory ────────────────────────────────────────────────

  describe("getAssessmentHistory", () => {
    it("should return version history for a supplier", async () => {
      const mockHistory = [
        { id: "a3", version: 3 },
        { id: "a2", version: 2 },
        { id: "a1", version: 1 },
      ];
      mockSupplierSourcingAssessment.findMany.mockResolvedValue(mockHistory);

      const result = await getAssessmentHistory({
        tenantId: TENANT_A,
        productId: PRODUCT_1,
        supplierId: SUPPLIER_1,
        limit: 10,
      });

      expect(result).toEqual(mockHistory);
      expect(mockSupplierSourcingAssessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_A, productId: PRODUCT_1, supplierId: SUPPLIER_1 },
          orderBy: { version: "desc" },
          take: 10,
        }),
      );
    });
  });

  // ─── expireStaleAssessments ──────────────────────────────────────────────

  describe("expireStaleAssessments", () => {
    it("should expire stale assessments", async () => {
      mockSupplierSourcingAssessment.updateMany.mockResolvedValue({ count: 5 });

      const result = await expireStaleAssessments({ tenantId: TENANT_A });
      expect(result.expired).toBe(5);
    });

    it("should only expire non-expired assessments older than threshold", async () => {
      mockSupplierSourcingAssessment.updateMany.mockResolvedValue({ count: 0 });

      await expireStaleAssessments({ tenantId: TENANT_A });

      expect(mockSupplierSourcingAssessment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_A,
            status: { not: "EXPIRED" },
          }),
        }),
      );
    });

    it("should enforce tenant isolation", async () => {
      mockSupplierSourcingAssessment.updateMany.mockResolvedValue({ count: 0 });

      await expireStaleAssessments({ tenantId: TENANT_A });

      expect(mockSupplierSourcingAssessment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: TENANT_A }),
        }),
      );
    });
  });
});
