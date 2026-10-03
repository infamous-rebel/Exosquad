import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils";
import { OnboardingPage } from "../OnboardingPage";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "unauthorized" } }),
    }),
  );
});

describe("OnboardingPage", () => {
  it("renders the header and first step", () => {
    renderWithProviders(<OnboardingPage />, {
      routerProps: { initialEntries: ["/onboarding"] },
    });
    expect(screen.getByText("EXOSQUAD")).toBeInTheDocument();
    expect(screen.getByText("WORKSPACE SETUP")).toBeInTheDocument();
    expect(screen.getByText(/STEP 1 OF 4/i)).toBeInTheDocument();
    expect(screen.getByText(/Tell us about your business/i)).toBeInTheDocument();
  });

  it("shows business name input and role buttons on step 1", () => {
    renderWithProviders(<OnboardingPage />, {
      routerProps: { initialEntries: ["/onboarding"] },
    });
    expect(screen.getByLabelText(/business name/i)).toBeInTheDocument();
    expect(screen.getByText("Reseller")).toBeInTheDocument();
    expect(screen.getByText("Importer")).toBeInTheDocument();
    expect(screen.getByText("Both")).toBeInTheDocument();
  });

  it("has navigation buttons", () => {
    renderWithProviders(<OnboardingPage />, {
      routerProps: { initialEntries: ["/onboarding"] },
    });
    expect(screen.getByText(/← Back/i)).toBeInTheDocument();
    expect(screen.getByText(/Next →/i)).toBeInTheDocument();
  });

  it("has back button disabled on first step", () => {
    renderWithProviders(<OnboardingPage />, {
      routerProps: { initialEntries: ["/onboarding"] },
    });
    const backBtn = screen.getByText(/← Back/i).closest("button");
    expect(backBtn).toBeDisabled();
  });

  it("shows step indicators for all 4 steps", () => {
    renderWithProviders(<OnboardingPage />, {
      routerProps: { initialEntries: ["/onboarding"] },
    });
    expect(screen.getByText("Business Profile")).toBeInTheDocument();
    expect(screen.getByText("Market Focus")).toBeInTheDocument();
    expect(screen.getByText("Sourcing")).toBeInTheDocument();
    expect(screen.getByText("Objective")).toBeInTheDocument();
  });
});
