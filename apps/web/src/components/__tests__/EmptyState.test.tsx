import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../../test/test-utils";
import { EmptyState } from "../ui/EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    renderWithProviders(
      <EmptyState title="No Data" description="Nothing to show yet." />,
    );
    expect(screen.getByText("No Data")).toBeInTheDocument();
    expect(screen.getByText("Nothing to show yet.")).toBeInTheDocument();
  });

  it("renders action button with onAction", () => {
    const onAction = () => {};
    renderWithProviders(
      <EmptyState title="Empty" description="Desc" action="Create New" onAction={onAction} />,
    );
    expect(screen.getByText("Create New")).toBeInTheDocument();
  });

  it("renders action link with actionHref", () => {
    renderWithProviders(
      <EmptyState title="Empty" description="Desc" action="Go" actionHref="/dashboard" />,
    );
    const link = screen.getByText("Go");
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe("/dashboard");
  });

  it("renders icon when provided", () => {
    renderWithProviders(
      <EmptyState title="Empty" description="Desc" icon={<span data-testid="icon">📭</span>} />,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("does not render action when not provided", () => {
    renderWithProviders(
      <EmptyState title="Empty" description="Desc" />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
