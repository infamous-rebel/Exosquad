import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "../../test/test-utils";
import { ProductDetailPage } from "../ProductDetailPage";
import { Route, Routes } from "react-router-dom";

// Mock all API calls used by ProductDetailPage
vi.mock("../../lib/api", () => ({
  api: {
    products: {
      get: vi.fn().mockResolvedValue({
        id: "prod1",
        name: "Test Product",
        normalizedName: "test-product",
        brandId: "brand1",
        categoryId: "cat1",
        status: "active",
        brand: { id: "brand1", name: "Test Brand" },
        category: { id: "cat1", name: "Test Category" },
        identifiers: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      }),
      demand: vi.fn().mockResolvedValue({
        productId: "prod1",
        demandScore: 0.75,
        confidence: 0.8,
        sampleSize: 100,
        window: "30d",
        calculatedAt: "2024-01-01T00:00:00Z",
      }),
      demandHistory: vi.fn().mockResolvedValue([]),
      signals: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
      signalsSummary: vi.fn().mockResolvedValue({ productId: "prod1", signals: [] }),
      trends: vi.fn().mockResolvedValue({
        productId: "prod1",
        trend: "up",
        growth: 0.15,
        acceleration: 0.02,
        momentum: 0.1,
        window: "30d",
        calculatedAt: "2024-01-01T00:00:00Z",
      }),
      demandProvenance: vi.fn().mockResolvedValue({ productId: "prod1", calculationType: "weighted_avg", chain: [] }),
    },
    opportunity: {
      assessments: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
      competitors: vi.fn().mockResolvedValue([]),
      competitorSnapshots: vi.fn().mockResolvedValue([]),
      signals: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
      risks: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    },
    supplyChain: {
      relationships: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    },
    sourcing: {
      productSuppliers: vi.fn().mockResolvedValue([]),
      comparison: vi.fn().mockResolvedValue({ productId: "prod1", suppliers: [] }),
      constraints: vi.fn().mockResolvedValue({ productId: "prod1", constraints: [] }),
    },
    logistics: {
      routes: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
      legs: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
      list: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    },
    pricing: {
      landedCosts: vi.fn().mockResolvedValue([]),
      scenarios: vi.fn().mockResolvedValue([]),
      marketSnapshots: vi.fn().mockResolvedValue([]),
      observations: vi.fn().mockResolvedValue([]),
    },
    research: {
      list: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
      history: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    },
    outreach: {
      campaigns: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
      outreachs: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    },
    evidence: {
      list: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    },
    claims: {
      list: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    },
    provenance: {
      get: vi.fn().mockResolvedValue({ entityType: "PRODUCT", entityId: "prod1", chain: [] }),
    },
  },
  getToken: vi.fn().mockReturnValue(null),
}));

function renderProductDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/products/:id" element={<ProductDetailPage />} />
    </Routes>,
    { routerProps: { initialEntries: ["/products/prod1"] } },
  );
}

describe("ProductDetailPage", () => {
  it("renders without crashing", () => {
    const { container } = renderProductDetail();
    // Should render without crashing - the component loads data asynchronously
    expect(container).toBeTruthy();
  });
});
