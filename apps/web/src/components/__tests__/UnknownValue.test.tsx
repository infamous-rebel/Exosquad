import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../../test/test-utils";
import { UnknownValue, formatValue, formatPercent, formatConfidence } from "../ui/UnknownValue";

describe("UnknownValue", () => {
  it("renders fallback for null", () => {
    renderWithProviders(<UnknownValue value={null} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders fallback for undefined", () => {
    renderWithProviders(<UnknownValue value={undefined} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders fallback for empty string", () => {
    renderWithProviders(<UnknownValue value="" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders custom fallback", () => {
    renderWithProviders(<UnknownValue value={null} fallback="N/A" />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders actual value when present", () => {
    renderWithProviders(<UnknownValue value="Hello" />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders number value", () => {
    renderWithProviders(<UnknownValue value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders 0 as a valid value (not fallback)", () => {
    renderWithProviders(<UnknownValue value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("formatValue", () => {
  it("returns fallback for null", () => {
    expect(formatValue(null)).toBe("Unknown");
  });

  it("returns fallback for undefined", () => {
    expect(formatValue(undefined)).toBe("Unknown");
  });

  it("formats number", () => {
    expect(formatValue(1234)).toBe("1,234");
  });

  it("uses custom fallback", () => {
    expect(formatValue(null, "N/A")).toBe("N/A");
  });
});

describe("formatPercent", () => {
  it("returns fallback for null", () => {
    expect(formatPercent(null)).toBe("Unknown");
  });

  it("formats decimal as percentage", () => {
    expect(formatPercent(0.184)).toBe("18.4%");
  });

  it("respects decimal places", () => {
    expect(formatPercent(0.184, 0)).toBe("18%");
  });
});

describe("formatConfidence", () => {
  it("returns Unknown for null", () => {
    expect(formatConfidence(null)).toBe("Unknown");
  });

  it("returns High for >= 0.8", () => {
    expect(formatConfidence(0.9)).toContain("High");
  });

  it("returns Medium for >= 0.5", () => {
    expect(formatConfidence(0.6)).toContain("Medium");
  });

  it("returns Low for < 0.5", () => {
    expect(formatConfidence(0.3)).toContain("Low");
  });
});
