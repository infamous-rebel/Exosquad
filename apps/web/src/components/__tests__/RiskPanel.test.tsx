import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, fireEvent } from "../../test/test-utils";
import { RiskPanel, type RiskItem } from "../risk/RiskPanel";

const mockRisks: RiskItem[] = [
  {
    id: "r1",
    riskType: "price_volatility",
    severity: "high",
    description: "Price fluctuation exceeds 15% threshold",
    impact: "Could increase landed cost by ৳200",
    requiredAction: "Review supplier contracts",
    confidence: 0.85,
    evidenceCount: 5,
  },
  {
    id: "r2",
    riskType: "supply_disruption",
    severity: "medium",
    description: "Single-source dependency detected",
    confidence: 0.6,
  },
];

describe("RiskPanel", () => {
  it("renders empty state when no risks", () => {
    renderWithProviders(<RiskPanel risks={[]} />);
    expect(screen.getByText("No risks identified")).toBeInTheDocument();
  });

  it("renders risk count in title", () => {
    renderWithProviders(<RiskPanel risks={mockRisks} />);
    expect(screen.getByText("RISKS (2)")).toBeInTheDocument();
  });

  it("renders risk severity and type", () => {
    renderWithProviders(<RiskPanel risks={mockRisks} />);
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("price_volatility")).toBeInTheDocument();
  });

  it("renders risk description", () => {
    renderWithProviders(<RiskPanel risks={mockRisks} />);
    expect(screen.getByText("Price fluctuation exceeds 15% threshold")).toBeInTheDocument();
  });

  it("renders impact when present", () => {
    renderWithProviders(<RiskPanel risks={mockRisks} />);
    expect(screen.getByText(/Could increase landed cost/)).toBeInTheDocument();
  });

  it("renders required action when present", () => {
    renderWithProviders(<RiskPanel risks={mockRisks} />);
    expect(screen.getByText(/Review supplier contracts/)).toBeInTheDocument();
  });

  it("renders confidence percentage", () => {
    renderWithProviders(<RiskPanel risks={mockRisks} />);
    expect(screen.getByText("85% conf.")).toBeInTheDocument();
  });

  it("renders evidence button when callback provided", () => {
    const onEvidenceClick = vi.fn();
    renderWithProviders(<RiskPanel risks={mockRisks} onEvidenceClick={onEvidenceClick} />);
    const btn = screen.getByText("5 evidence items →");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onEvidenceClick).toHaveBeenCalledWith("r1");
  });

  it("uses custom title", () => {
    renderWithProviders(<RiskPanel risks={[]} title="PRICE RISKS" />);
    expect(screen.getByText("PRICE RISKS")).toBeInTheDocument();
  });
});
