import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, fireEvent } from "../../test/test-utils";
import { DataTable, type Column } from "../ui/DataTable";

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns: Column<TestRow>[] = [
  { key: "name", header: "Name", render: (row) => row.name, sortable: true },
  { key: "value", header: "Value", render: (row) => row.value, sortable: true, align: "right" },
];

const data: TestRow[] = [
  { id: "1", name: "Alpha", value: 100 },
  { id: "2", name: "Beta", value: 200 },
  { id: "3", name: "Gamma", value: 300 },
];

describe("DataTable", () => {
  it("renders columns and data", () => {
    renderWithProviders(
      <DataTable columns={columns} data={data} keyExtractor={(r) => r.id} />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("renders empty state when no data", () => {
    renderWithProviders(
      <DataTable columns={columns} data={[]} keyExtractor={(r) => r.id} />,
    );
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders custom empty message", () => {
    renderWithProviders(
      <DataTable columns={columns} data={[]} keyExtractor={(r) => r.id} emptyMessage="Nothing here" />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("renders loading state", () => {
    renderWithProviders(
      <DataTable columns={columns} data={data} keyExtractor={(r) => r.id} isLoading />,
    );
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("calls onSort when sortable column header clicked", () => {
    const onSort = vi.fn();
    renderWithProviders(
      <DataTable columns={columns} data={data} keyExtractor={(r) => r.id} onSort={onSort} sortField="name" sortDirection="asc" />,
    );
    fireEvent.click(screen.getByText("Name"));
    expect(onSort).toHaveBeenCalledWith("name", "desc");
  });

  it("calls onRowClick when row clicked", () => {
    const onRowClick = vi.fn();
    renderWithProviders(
      <DataTable columns={columns} data={data} keyExtractor={(r) => r.id} onRowClick={onRowClick} />,
    );
    fireEvent.click(screen.getByText("Alpha"));
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it("renders pagination when provided", () => {
    const pagination = { page: 1, limit: 10, total: 25, totalPages: 3 };
    const onPageChange = vi.fn();
    renderWithProviders(
      <DataTable
        columns={columns}
        data={data}
        keyExtractor={(r) => r.id}
        pagination={pagination}
        onPageChange={onPageChange}
      />,
    );
    expect(screen.getByText("25 results · Page 1/3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("NEXT →"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("disables prev button on first page", () => {
    const pagination = { page: 1, limit: 10, total: 25, totalPages: 3 };
    renderWithProviders(
      <DataTable
        columns={columns}
        data={data}
        keyExtractor={(r) => r.id}
        pagination={pagination}
        onPageChange={vi.fn()}
      />,
    );
    expect(screen.getByText("← PREV")).toBeDisabled();
  });

  it("shows sort indicator for active sort column", () => {
    renderWithProviders(
      <DataTable columns={columns} data={data} keyExtractor={(r) => r.id} sortField="name" sortDirection="asc" />,
    );
    expect(screen.getByText("↑")).toBeInTheDocument();
  });
});
