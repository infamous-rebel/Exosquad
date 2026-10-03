/**
 * Generic typed data table with sorting, pagination, keyboard nav,
 * expandable rows, and status indicators.
 */

import { useState, useCallback, useEffect, type ReactNode } from "react";
import type { Pagination } from "../../lib/api";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  pagination?: Pagination;
  onPageChange?: (page: number) => void;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (field: string, direction: "asc" | "desc") => void;
  onRowClick?: (row: T) => void;
  expandableRow?: (row: T) => ReactNode;
  emptyMessage?: string;
  isLoading?: boolean;
  keyExtractor: (row: T) => string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  pagination,
  onPageChange,
  sortField,
  sortDirection = "asc",
  onSort,
  onRowClick,
  emptyMessage = "No data available",
  isLoading = false,
  keyExtractor,
  className = "",
}: DataTableProps<T>) {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const handleSort = useCallback(
    (col: Column<T>) => {
      if (!col.sortable || !onSort) return;
      const newDir = sortField === col.key && sortDirection === "asc" ? "desc" : "asc";
      onSort(col.key, newDir);
    },
    [sortField, sortDirection, onSort],
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, data.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && focusedIndex >= 0 && onRowClick) {
        onRowClick(data[focusedIndex]!);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [data, focusedIndex, onRowClick]);

  if (isLoading) {
    return (
      <div className={`glass-panel overflow-hidden ${className}`}>
        <div className="flex items-center justify-center py-8">
          <span className="font-mono text-xs text-graphite-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`glass-panel overflow-hidden ${className}`}>
        <div className="flex items-center justify-center py-8">
          <span className="font-mono text-xs text-graphite-500">{emptyMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-panel overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-graphite-800">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-graphite-500 ${
                    col.sortable ? "cursor-pointer select-none hover:text-graphite-300" : ""
                  } ${col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"}`}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={() => handleSort(col)}
                >
                  {col.header}
                  {sortField === col.key && (
                    <span className="ml-1 text-accent">{sortDirection === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const key = keyExtractor(row);
              const isFocused = idx === focusedIndex;

              return (
                <tr
                  key={key}
                  className={`border-b border-graphite-800/50 transition-colors ${
                    onRowClick ? "cursor-pointer hover:bg-graphite-800/30" : ""
                  } ${isFocused ? "bg-accent/5 ring-1 ring-inset ring-accent/20" : ""}`}
                  onClick={() => onRowClick?.(row)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-2.5 font-mono text-xs ${
                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between border-t border-graphite-800 px-4 py-2">
          <span className="font-mono text-[10px] text-graphite-500">
            {pagination.total} results · Page {pagination.page}/{pagination.totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded px-2 py-0.5 font-mono text-[10px] text-graphite-400 ring-1 ring-graphite-700 transition hover:bg-graphite-800 disabled:opacity-30"
            >
              ← PREV
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded px-2 py-0.5 font-mono text-[10px] text-graphite-400 ring-1 ring-graphite-700 transition hover:bg-graphite-800 disabled:opacity-30"
            >
              NEXT →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
