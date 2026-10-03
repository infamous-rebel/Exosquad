// =============================================================================
// Phase 5 — Integration tests: Organization identity with real PostgreSQL
// =============================================================================
// Tests tenant isolation, uniqueness constraints, merge/split persistence,
// and concurrent identity resolution behavior.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma, Prisma } from "@exosquad/database";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTenant(name: string) {
  return prisma.tenant.create({
    data: { name, slug: `test-${name.toLowerCase()}-${Date.now()}` },
  });
}

async function createOrg(tenantId: string, name: string, overrides?: Record<string, unknown>) {
  return prisma.organization.create({
    data: {
      tenantId,
      canonicalName: name,
      normalizedName: name.toLowerCase(),
      searchKey: name.toLowerCase().replace(/[^\w]/g, ""),
      ...overrides,
    },
  });
}

async function cleanupTenant(slug: string) {
  // Cascade deletes are handled by FK constraints in most cases,
  // but we need to delete in the right order
  const tenant = await prisma.tenant.findFirst({ where: { slug } });
  if (!tenant) return;

  await prisma.$transaction(async (tx) => {
    await tx.orgMergeHistory.deleteMany({ where: { tenantId: tenant.id } });
    await tx.orgIdentityCandidate.deleteMany({ where: { tenantId: tenant.id } });
    await tx.orgIdentityDecision.deleteMany({ where: { tenantId: tenant.id } });
    await tx.orgIdentityConflict.deleteMany({ where: { tenantId: tenant.id } });
    await tx.commercialRelationship.deleteMany({ where: { tenantId: tenant.id } });
    await tx.productSupplier.deleteMany({ where: { tenantId: tenant.id } });
    await tx.productSeller.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organizationContact.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organizationLocation.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organizationPhone.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organizationEmail.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organizationDomain.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organizationIdentifier.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organizationRole.deleteMany({ where: { tenantId: tenant.id } });
    await tx.organization.deleteMany({ where: { tenantId: tenant.id } });
    await tx.manufacturer.deleteMany({ where: { tenantId: tenant.id } });
    await tx.supplier.deleteMany({ where: { tenantId: tenant.id } });
    await tx.seller.deleteMany({ where: { tenantId: tenant.id } });
    // Phase 4 identity tables
    await tx.identityMergeHistory.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityCandidate.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityDecision.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityConflict.deleteMany({ where: { tenantId: tenant.id } });
    await tx.identityRelationship.deleteMany({ where: { tenantId: tenant.id } });
    await tx.productAttribute.deleteMany({ where: { tenantId: tenant.id } });
    // ProductVariant has no tenantId — delete via product relation
    const tenantProducts = await tx.product.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    const productIds = tenantProducts.map((p) => p.id);
    if (productIds.length > 0) {
      await tx.productVariant.deleteMany({ where: { productId: { in: productIds } } });
    }
    await tx.productIdentifier.deleteMany({ where: { tenantId: tenant.id } });
    await tx.product.deleteMany({ where: { tenantId: tenant.id } });
    await tx.brand.deleteMany({ where: { tenantId: tenant.id } });
    await tx.category.deleteMany({ where: { tenantId: tenant.id } });
    await tx.observation.deleteMany({ where: { tenantId: tenant.id } });
    await tx.source.deleteMany({ where: { tenantId: tenant.id } });
    await tx.job.deleteMany({ where: { tenantId: tenant.id } });
    await tx.auditLog.deleteMany({ where: { tenantId: tenant.id } });
    await tx.user.deleteMany({ where: { tenantId: tenant.id } });
    await tx.tenant.delete({ where: { id: tenant.id } });
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Phase 5 — Organization Identity Integration", () => {
  let tenantA: { id: string };
  let tenantB: { id: string };

  beforeAll(async () => {
    tenantA = await createTenant("OrgTestA");
    tenantB = await createTenant("OrgTestB");
  });

  afterAll(async () => {
    await cleanupTenant(tenantA.slug);
    await cleanupTenant(tenantB.slug);
    await prisma.$disconnect();
  });

  describe("Organization CRUD", () => {
    it("creates an organization with all fields", async () => {
      const org = await prisma.organization.create({
        data: {
          tenantId: tenantA.id,
          canonicalName: "Acme Trading Ltd",
          normalizedName: "acme trading ltd",
          searchKey: "acme trading ltd",
          legalName: "Acme Trading Limited",
          domain: "acme.com",
          country: "BD",
          website: "https://acme.com",
        },
      });

      expect(org.id).toBeTruthy();
      expect(org.canonicalName).toBe("Acme Trading Ltd");
      expect(org.identityStatus).toBe("unresolved");
      expect(org.status).toBe("active");
    });

    it("enforces unique normalizedName per tenant", async () => {
      await createOrg(tenantA.id, "Unique Org");

      await expect(
        createOrg(tenantA.id, "Unique Org")
      ).rejects.toThrow();
    });

    it("allows same name in different tenants", async () => {
      const orgA = await createOrg(tenantA.id, "Shared Name");
      const orgB = await createOrg(tenantB.id, "Shared Name");

      expect(orgA.id).not.toBe(orgB.id);
    });
  });

  describe("Organization Identifiers", () => {
    it("enforces unique identifier per tenant", async () => {
      const org = await createOrg(tenantA.id, "Identifier Org");

      await prisma.organizationIdentifier.create({
        data: {
          tenantId: tenantA.id,
          organizationId: org.id,
          type: "registration_id",
          value: "REG-001",
          normalized: "REG001",
        },
      });

      // Same identifier type+normalized for different org should fail
      const org2 = await createOrg(tenantA.id, "Another Org");
      await expect(
        prisma.organizationIdentifier.create({
          data: {
            tenantId: tenantA.id,
            organizationId: org2.id,
            type: "registration_id",
            value: "REG-001",
            normalized: "REG001",
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("Organization Domains", () => {
    it("enforces unique domain per tenant", async () => {
      const org = await createOrg(tenantA.id, "Domain Org A");

      await prisma.organizationDomain.create({
        data: {
          tenantId: tenantA.id,
          organizationId: org.id,
          domain: "unique-domain.com",
          isPrimary: true,
        },
      });

      const org2 = await createOrg(tenantA.id, "Domain Org B");
      await expect(
        prisma.organizationDomain.create({
          data: {
            tenantId: tenantA.id,
            organizationId: org2.id,
            domain: "unique-domain.com",
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("Tenant Isolation", () => {
    it("orgs from different tenants are isolated by query", async () => {
      const orgA = await createOrg(tenantA.id, "Tenant A Isolated");
      const orgB = await createOrg(tenantB.id, "Tenant B Isolated");

      // Tenant A can only see its own orgs
      const visibleToA = await prisma.organization.findMany({
        where: { tenantId: tenantA.id, canonicalName: { contains: "Isolated" } },
      });
      const visibleToB = await prisma.organization.findMany({
        where: { tenantId: tenantB.id, canonicalName: { contains: "Isolated" } },
      });

      expect(visibleToA.length).toBe(1);
      expect(visibleToA[0]!.id).toBe(orgA.id);
      expect(visibleToB.length).toBe(1);
      expect(visibleToB[0]!.id).toBe(orgB.id);
    });
  });

  describe("Merge / Split Persistence", () => {
    it("merge marks org as merged and creates history", async () => {
      const fromOrg = await createOrg(tenantA.id, "Merge From");
      const toOrg = await createOrg(tenantA.id, "Merge To");

      const result = await prisma.$transaction(async (tx) => {
        // 1. Mark from as merged
        await tx.organization.update({
          where: { id: fromOrg.id },
          data: { status: "merged", mergedIntoId: toOrg.id, identityStatus: "resolved" },
        });

        // 2. Create merge history
        const history = await tx.orgMergeHistory.create({
          data: {
            tenantId: tenantA.id,
            entityId: fromOrg.id,
            action: "merged",
            fromOrgId: fromOrg.id,
            toOrgId: toOrg.id,
            reason: "Same company",
            actorType: "manual",
          },
        });

        return history;
      });

      expect(result.action).toBe("merged");

      // Verify merged org
      const merged = await prisma.organization.findFirst({ where: { id: fromOrg.id } });
      expect(merged!.status).toBe("merged");
      expect(merged!.mergedIntoId).toBe(toOrg.id);
    });

    it("split restores org status and creates history", async () => {
      const fromOrg = await createOrg(tenantA.id, "Split From 2");
      const toOrg = await createOrg(tenantA.id, "Split To 2");

      // Merge with history
      await prisma.$transaction(async (tx) => {
        await tx.organization.update({
          where: { id: fromOrg.id },
          data: { status: "merged", mergedIntoId: toOrg.id },
        });
        await tx.orgMergeHistory.create({
          data: {
            tenantId: tenantA.id,
            entityId: fromOrg.id,
            action: "merged",
            fromOrgId: fromOrg.id,
            toOrgId: toOrg.id,
            reason: "Test merge before split",
            actorType: "manual",
          },
        });
      });

      // Then split
      await prisma.$transaction(async (tx) => {
        await tx.organization.update({
          where: { id: fromOrg.id },
          data: { status: "active", mergedIntoId: null },
        });

        await tx.orgMergeHistory.create({
          data: {
            tenantId: tenantA.id,
            entityId: fromOrg.id,
            action: "split",
            fromOrgId: fromOrg.id,
            toOrgId: toOrg.id,
            reason: "Actually different companies",
            actorType: "manual",
          },
        });
      });

      const restored = await prisma.organization.findFirst({ where: { id: fromOrg.id } });
      expect(restored!.status).toBe("active");
      expect(restored!.mergedIntoId).toBeNull();

      const history = await prisma.orgMergeHistory.findMany({
        where: { entityId: fromOrg.id },
        orderBy: { createdAt: "asc" },
      });
      expect(history.length).toBe(2);
      expect(history[0]!.action).toBe("merged");
      expect(history[1]!.action).toBe("split");
    });
  });

  describe("Seller/Supplier Organization Links", () => {
    it("links seller to organization", async () => {
      const org = await createOrg(tenantA.id, "Linked Org");

      const seller = await prisma.seller.create({
        data: {
          tenantId: tenantA.id,
          name: "Test Seller",
          normalizedName: "test seller",
          organizationId: org.id,
        },
      });

      expect(seller.organizationId).toBe(org.id);

      // Verify org sees the seller
      const orgWithSellers = await prisma.organization.findFirst({
        where: { id: org.id },
        include: { sellers: true },
      });
      expect(orgWithSellers!.sellers.length).toBe(1);
    });

    it("re-links sellers on org merge", async () => {
      const fromOrg = await createOrg(tenantA.id, "ReLink From");
      const toOrg = await createOrg(tenantA.id, "ReLink To");

      await prisma.seller.create({
        data: {
          tenantId: tenantA.id,
          name: "Relinkable Seller",
          normalizedName: "relinkable seller",
          organizationId: fromOrg.id,
        },
      });

      // Merge fromOrg → toOrg
      await prisma.seller.updateMany({
        where: { tenantId: tenantA.id, organizationId: fromOrg.id },
        data: { organizationId: toOrg.id },
      });

      const sellers = await prisma.seller.findMany({
        where: { tenantId: tenantA.id, organizationId: toOrg.id },
      });
      expect(sellers.length).toBe(1);
    });
  });

  describe("Product ↔ Seller/Supplier Links", () => {
    it("creates product-seller link", async () => {
      const org = await createOrg(tenantA.id, "Product Link Org");

      const seller = await prisma.seller.create({
        data: {
          tenantId: tenantA.id,
          name: "Product Seller",
          normalizedName: "product seller",
          organizationId: org.id,
        },
      });

      // Create a product first
      const product = await prisma.product.create({
        data: {
          tenantId: tenantA.id,
          name: "Test Product",
          normalizedName: "test product",
        },
      });

      const link = await prisma.productSeller.create({
        data: {
          tenantId: tenantA.id,
          productId: product.id,
          sellerId: seller.id,
          price: 99.99,
          currency: "BDT",
        },
      });

      expect(link.productId).toBe(product.id);
      expect(link.sellerId).toBe(seller.id);
    });
  });

  describe("Commercial Relationships", () => {
    it("creates and queries commercial relationship", async () => {
      const orgA = await createOrg(tenantA.id, "Commercial A");
      const orgB = await createOrg(tenantA.id, "Commercial B");

      const rel = await prisma.commercialRelationship.create({
        data: {
          tenantId: tenantA.id,
          fromOrgId: orgA.id,
          toOrgId: orgB.id,
          relationshipType: "SUPPLIES",
          confidence: 0.9,
          observationType: "observed",
        },
      });

      expect(rel.id).toBeTruthy();
      expect(rel.relationshipType).toBe("SUPPLIES");

      // Query relationships
      const rels = await prisma.commercialRelationship.findMany({
        where: { tenantId: tenantA.id, fromOrgId: orgA.id },
        include: { toOrg: true },
      });
      expect(rels.length).toBe(1);
      expect(rels[0]!.toOrg.canonicalName).toBe("Commercial B");
    });
  });

  describe("Concurrent Identity Resolution", () => {
    it("handles concurrent org creation without data loss", async () => {
      const names = Array.from({ length: 10 }, (_, i) => `Concurrent Org ${i}`);

      const results = await Promise.all(
        names.map((name) =>
          createOrg(tenantA.id, name)
        )
      );

      expect(results.length).toBe(10);
      const ids = new Set(results.map((r) => r.id));
      expect(ids.size).toBe(10); // All unique
    });

    it("handles concurrent decision creation for same org pair", async () => {
      const orgA = await createOrg(tenantA.id, "Concurrent Decision A");
      const orgB = await createOrg(tenantA.id, "Concurrent Decision B");

      // Create multiple decisions concurrently — all should succeed (no unique constraint)
      const decisions = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          prisma.orgIdentityDecision.create({
            data: {
              tenantId: tenantA.id,
              fromOrgId: orgA.id,
              toOrgId: orgB.id,
              decision: i === 0 ? "EXACT_MATCH" : "POSSIBLE_MATCH",
              confidence: 0.5 + i * 0.1,
              method: i === 0 ? "manual" : "deterministic",
            },
          })
        )
      );

      expect(decisions.length).toBe(5);

      const count = await prisma.orgIdentityDecision.count({
        where: { tenantId: tenantA.id, fromOrgId: orgA.id, toOrgId: orgB.id },
      });
      expect(count).toBe(5);
    });

    it("prevents duplicate candidate pairs (unique constraint)", async () => {
      const orgA = await createOrg(tenantA.id, "Unique Candidate A");
      const orgB = await createOrg(tenantA.id, "Unique Candidate B");

      await prisma.orgIdentityCandidate.create({
        data: {
          tenantId: tenantA.id,
          fromOrgId: orgA.id,
          toOrgId: orgB.id,
        },
      });

      await expect(
        prisma.orgIdentityCandidate.create({
          data: {
            tenantId: tenantA.id,
            fromOrgId: orgA.id,
            toOrgId: orgB.id,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe("Organization Roles", () => {
    it("assigns multiple roles to an organization", async () => {
      const org = await createOrg(tenantA.id, "Multi Role Org");

      await prisma.organizationRole.createMany({
        data: [
          { tenantId: tenantA.id, organizationId: org.id, role: "SELLER", confidence: 0.9 },
          { tenantId: tenantA.id, organizationId: org.id, role: "SUPPLIER", confidence: 0.8 },
        ],
      });

      const roles = await prisma.organizationRole.findMany({
        where: { organizationId: org.id },
      });
      expect(roles.length).toBe(2);
    });

    it("enforces unique role per org per tenant", async () => {
      const org = await createOrg(tenantA.id, "Unique Role Org");

      await prisma.organizationRole.create({
        data: {
          tenantId: tenantA.id,
          organizationId: org.id,
          role: "IMPORTER",
        },
      });

      await expect(
        prisma.organizationRole.create({
          data: {
            tenantId: tenantA.id,
            organizationId: org.id,
            role: "IMPORTER",
          },
        })
      ).rejects.toThrow();
    });
  });
});
