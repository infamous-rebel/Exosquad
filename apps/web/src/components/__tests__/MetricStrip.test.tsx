import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../../test/test-utils";
import { MetricStrip } from "../ui/MetricStrip";

describe("MetricStrip", () => {
  it("renders label and value", () => {
    renderWithProviders(<MetricStrip label="Demand" value="1,234" />);
    expect(screen.getByText("Demand")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("renders dash for null value", () => {
    renderWithProviders(<MetricStrip label="Demand" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders unit when provided", () => {
    renderWithProviders(<MetricStrip label="Price" value={100} unit="BDT" />);
    expect(screen.getByText("BDT")).toBeInTheDocument();
  });

  it("renders positive change with + prefix", () => {
    renderWithProviders(<MetricStrip label="Growth" value={10} change={5.2} />);
    expect(screen.getByText("+5.2")).toBeInTheDocument();
  });

  it("renders negative change", () => {
    renderWithProviders(<MetricStrip label="Growth" value={10} change={-3.1} />);
    expect(screen.getByText("-3.1")).toBeInTheDocument();
  });

  it("renders change label", () => {
    renderWithProviders(<MetricStrip label="Growth" value={10} change={5.2} changeLabel="vs last" />);
    expect(screen.getByText("vs last")).toBeInTheDocument();
  });

  it("renders status dot when status provided", () => {
    const { container } = renderWithProviders(
      <MetricStrip label="Demand" value={10} status="live" />,
    );
    expect(container.querySelector(".status-dot-live")).toBeTruthy();
  });
});
