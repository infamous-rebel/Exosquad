import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, fireEvent } from "../../test/test-utils";
import { EvidencePanel } from "../evidence/EvidencePanel";
import type { EvidenceDetail } from "../../lib/api";

const mockEvidence: EvidenceDetail = {
  id: "ev1",
  sourceId: "src1",
  observationId: "obs1",
  productId: "prod1",
  evidenceType: "PRICE_OBSERVATION",
  entityType: "PRODUCT",
  entityId: "prod1",
  status: "VERIFIED",
  freshness: "FRESH",
  confidence: 0.92,
  observedValue: "BDT 1,850",
  observedAt: "2024-12-01T10:00:00Z",
  region: "Bangladesh",
  createdAt: "2024-12-01T10:05:00Z",
  quality: { sourceReliability: 0.95 },
  metadata: { scraped: true },
};

describe("EvidencePanel", () => {
  it("renders nothing when not open", () => {
    const { container } = renderWithProviders(
      <EvidencePanel evidence={null} isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders loading state", () => {
    renderWithProviders(
      <EvidencePanel evidence={null} isOpen={true} onClose={vi.fn()} isLoading />,
    );
    expect(screen.getByText("Loading evidence...")).toBeInTheDocument();
  });

  it("renders no evidence selected state", () => {
    renderWithProviders(
      <EvidencePanel evidence={null} isOpen={true} onClose={vi.fn()} />,
    );
    expect(screen.getByText("No evidence selected")).toBeInTheDocument();
  });

  it("renders evidence detail when evidence provided", () => {
    renderWithProviders(
      <EvidencePanel evidence={mockEvidence} isOpen={true} onClose={vi.fn()} />,
    );
    expect(screen.getByText("VERIFIED")).toBeInTheDocument();
    expect(screen.getByText("PRICE_OBSERVATION")).toBeInTheDocument();
    expect(screen.getByText("BDT 1,850")).toBeInTheDocument();
    expect(screen.getByText("Bangladesh")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <EvidencePanel evidence={mockEvidence} isOpen={true} onClose={onClose} />,
    );
    fireEvent.click(screen.getByLabelText("Close evidence panel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    const { container } = renderWithProviders(
      <EvidencePanel evidence={mockEvidence} isOpen={true} onClose={onClose} />,
    );
    // The backdrop is the first fixed div
    const backdrop = container.querySelector(".fixed.inset-0");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders quality section when present", () => {
    renderWithProviders(
      <EvidencePanel evidence={mockEvidence} isOpen={true} onClose={vi.fn()} />,
    );
    expect(screen.getByText("QUALITY")).toBeInTheDocument();
    expect(screen.getByText(/sourceReliability/)).toBeInTheDocument();
  });

  it("renders metadata section when present", () => {
    renderWithProviders(
      <EvidencePanel evidence={mockEvidence} isOpen={true} onClose={vi.fn()} />,
    );
    expect(screen.getByText("METADATA")).toBeInTheDocument();
    expect(screen.getByText(/scraped/)).toBeInTheDocument();
  });
});
