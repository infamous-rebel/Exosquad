import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../../test/test-utils";
import { EvidenceBadge } from "../evidence/EvidenceBadge";

describe("EvidenceBadge", () => {
  it("renders VERIFIED status", () => {
    renderWithProviders(<EvidenceBadge status="VERIFIED" />);
    expect(screen.getByText("VERIFIED")).toBeInTheDocument();
  });

  it("renders OBSERVED status", () => {
    renderWithProviders(<EvidenceBadge status="OBSERVED" />);
    expect(screen.getByText("OBSERVED")).toBeInTheDocument();
  });

  it("renders AI_EXTRACTED as 'AI EXTRACTED'", () => {
    renderWithProviders(<EvidenceBadge status="AI_EXTRACTED" />);
    expect(screen.getByText("AI EXTRACTED")).toBeInTheDocument();
  });

  it("renders CONTRADICTED status", () => {
    renderWithProviders(<EvidenceBadge status="CONTRADICTED" />);
    expect(screen.getByText("CONTRADICTED")).toBeInTheDocument();
  });

  it("renders STALE status", () => {
    renderWithProviders(<EvidenceBadge status="STALE" />);
    expect(screen.getByText("STALE")).toBeInTheDocument();
  });

  it("renders CALCULATED status", () => {
    renderWithProviders(<EvidenceBadge status="CALCULATED" />);
    expect(screen.getByText("CALCULATED")).toBeInTheDocument();
  });

  it("renders UNKNOWN for unrecognized status", () => {
    renderWithProviders(<EvidenceBadge status="SOMETHING_ELSE" />);
    expect(screen.getByText("UNKNOWN")).toBeInTheDocument();
  });

  it("renders ASSUMED status", () => {
    renderWithProviders(<EvidenceBadge status="ASSUMED" />);
    expect(screen.getByText("ASSUMED")).toBeInTheDocument();
  });
});
