import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils";
import { LandingPage } from "../LandingPage";

// Mock fetch to prevent real API calls during auth check
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "unauthorized" } }),
    }),
  );
});

describe("LandingPage", () => {
  it("renders the hero section", () => {
    renderWithProviders(<LandingPage />, {
      routerProps: { initialEntries: ["/"] },
    });
    expect(screen.getByText(/Product intelligence for Bangladesh resellers/i)).toBeInTheDocument();
  });

  it("renders the primary CTA linking to register", () => {
    renderWithProviders(<LandingPage />, {
      routerProps: { initialEntries: ["/"] },
    });
    const ctaLinks = screen.getAllByText(/Enter Intelligence Terminal/i);
    expect(ctaLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("renders capability sections", () => {
    renderWithProviders(<LandingPage />, {
      routerProps: { initialEntries: ["/"] },
    });
    expect(screen.getByText("Product Discovery")).toBeInTheDocument();
    expect(screen.getByText("Demand Intelligence")).toBeInTheDocument();
    expect(screen.getByText("Supply Intelligence")).toBeInTheDocument();
    // "Logistics" and "Economics" also appear in workflow stages
    expect(screen.getAllByText("Logistics").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Economics").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("AI Research")).toBeInTheDocument();
    expect(screen.getByText("Supplier Outreach")).toBeInTheDocument();
    expect(screen.getByText("Evidence & Provenance")).toBeInTheDocument();
  });

  it("renders evidence status indicators", () => {
    renderWithProviders(<LandingPage />, {
      routerProps: { initialEntries: ["/"] },
    });
    expect(screen.getByText("Observed")).toBeInTheDocument();
    expect(screen.getByText("Calculated")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Contradicted")).toBeInTheDocument();
  });

  it("renders product journey steps", () => {
    renderWithProviders(<LandingPage />, {
      routerProps: { initialEntries: ["/"] },
    });
    // "Discover" and "Research" appear in both workflow and journey sections
    expect(screen.getAllByText("Discover").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Research").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Evaluate")).toBeInTheDocument();
    expect(screen.getAllByText("Source").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Validate")).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    renderWithProviders(<LandingPage />, {
      routerProps: { initialEntries: ["/"] },
    });
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Get Started")).toBeInTheDocument();
  });
});
