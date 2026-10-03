import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../../test/test-utils";
import { DashboardPage } from "../DashboardPage";

// Mock all API calls used by DashboardPage
vi.mock("../../lib/api", () => ({
  api: {
    opportunity: {
      assessments: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } }),
    },
    evidence: {
      list: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 0 } }),
    },
    demand: {
      list: vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 5, total: 0, totalPages: 0 } }),
    },
  },
  getToken: vi.fn().mockReturnValue(null),
}));

describe("DashboardPage", () => {
  it("renders the dashboard page", () => {
    renderWithProviders(<DashboardPage />);
    // Should render without crashing and show some dashboard content
    expect(screen.getByText(/Market Overview/i)).toBeInTheDocument();
  });
});
