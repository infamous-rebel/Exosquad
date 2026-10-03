import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, fireEvent } from "../../test/test-utils";
import { ActionChecklist } from "../actions/ActionChecklist";

const mockItems = [
  { id: "a1", label: "Run demand assessment", completed: false, priority: "high" as const },
  { id: "a2", label: "Review suppliers", completed: true, href: "/sourcing", priority: "medium" as const },
  { id: "a3", label: "Check logistics", completed: false, description: "Verify route viability" },
];

describe("ActionChecklist", () => {
  it("renders title and count", () => {
    renderWithProviders(<ActionChecklist items={mockItems} />);
    expect(screen.getByText("ACTIONS")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("renders all items", () => {
    renderWithProviders(<ActionChecklist items={mockItems} />);
    expect(screen.getByText("Run demand assessment")).toBeInTheDocument();
    expect(screen.getByText("Review suppliers")).toBeInTheDocument();
    expect(screen.getByText("Check logistics")).toBeInTheDocument();
  });

  it("renders description when present", () => {
    renderWithProviders(<ActionChecklist items={mockItems} />);
    expect(screen.getByText("Verify route viability")).toBeInTheDocument();
  });

  it("calls onToggle when checkbox clicked", () => {
    const onToggle = vi.fn();
    renderWithProviders(<ActionChecklist items={mockItems} onToggle={onToggle} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]!);
    expect(onToggle).toHaveBeenCalledWith("a1");
  });

  it("calls onNavigate when item with href clicked", () => {
    const onNavigate = vi.fn();
    renderWithProviders(<ActionChecklist items={mockItems} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Review suppliers"));
    expect(onNavigate).toHaveBeenCalledWith("/sourcing");
  });

  it("uses custom title", () => {
    renderWithProviders(<ActionChecklist items={mockItems} title="TODO" />);
    expect(screen.getByText("TODO")).toBeInTheDocument();
  });
});
