import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import type { Product } from "../lib/api";
import { TableSkeleton } from "../components/ui/skeletons";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { UnknownValue } from "../components/ui/UnknownValue";

export function ProductDiscoveryPage() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.products.list({ page, limit: 20, search: search || undefined, status: statusFilter || undefined }),
    queryFn: () => api.products.list({ page, limit: 20, search: search || undefined, status: statusFilter || undefined }),
    placeholderData: keepPreviousData,
  });

  const products = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="h-full overflow-y-auto p-4">
      {/* Header */}
      <div className="mb-4">
        <p className="section-label mb-1">PRODUCT DISCOVERY</p>
        <h1 className="text-lg font-light text-graphite-50">Find profitable products with real market intelligence</h1>
      </div>

      {/* Search + Filters */}
      <div className="mb-4 flex items-center gap-3">
        <div className="neu-control flex flex-1 max-w-lg items-center gap-2 px-3 py-2">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-graphite-500">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3 3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search products, brands..."
            className="w-full bg-transparent text-xs text-graphite-100 placeholder:text-graphite-500 outline-none"
          />
        </div>

        <div className="flex gap-px">
          {["active", "all"].map((f) => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={`px-3 py-1.5 text-xs uppercase transition-colors ${
                statusFilter === f
                  ? "neu-control-active text-accent"
                  : "neu-control text-graphite-400 hover:text-graphite-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="glass-panel">
        <div className="flex items-center justify-between border-b border-glass-border px-3 py-2">
          <span className="section-label">
            {pagination ? `${pagination.total} PRODUCTS` : "PRODUCTS"}
          </span>
        </div>

        {isLoading && <TableSkeleton rows={5} cols={6} />}

        {isError && (
          <ErrorState type="api-failure" onRetry={() => refetch()} />
        )}

        {!isLoading && !isError && products.length === 0 && (
          <EmptyState
            title="NO PRODUCTS FOUND"
            description={search ? "No products match your search criteria." : "No products have been imported yet. Configure sources to begin tracking products."}
          />
        )}

        {!isLoading && !isError && products.length > 0 && (
          <>
            {/* Table header */}
            <div className="flex items-center border-b border-glass-border px-3 py-1.5 text-2xs font-medium uppercase tracking-wider text-graphite-500">
              <span className="w-8">#</span>
              <span className="w-44">Product</span>
              <span className="w-24">Brand</span>
              <span className="w-24">Category</span>
              <span className="w-20">Status</span>
              <span className="w-20">Evidence</span>
              <span className="w-24 text-right">Action</span>
            </div>

            {products.map((p: Product, i: number) => (
              <div
                key={p.id}
                className="flex items-center border-b border-glass-border/50 px-3 py-2 transition-colors last:border-0 hover:bg-graphite-800/30"
              >
                <span className="w-8 text-2xs text-graphite-500">{(pagination ? (pagination.page - 1) * pagination.limit : 0) + i + 1}</span>
                <div className="w-44">
                  <p className="truncate text-xs font-medium text-graphite-100">{p.name}</p>
                </div>
                <span className="w-24 text-xs text-graphite-300">
                  <UnknownValue value={p.brand?.name} fallback="Unknown" />
                </span>
                <span className="w-24">
                  <span className="rounded-2xs border border-graphite-600 px-1.5 py-0.5 text-2xs text-graphite-300">
                    {p.category?.name ?? "Unknown"}
                  </span>
                </span>
                <span className="w-20">
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                    p.status === "active"
                      ? "bg-status-live/10 text-status-live"
                      : p.status === "merged"
                      ? "bg-status-changed/10 text-status-changed"
                      : "bg-graphite-800 text-graphite-500"
                  }`}>
                    {p.status}
                  </span>
                </span>
                <span className="w-20 text-xs text-graphite-400">
                  {p._count?.evidence ?? 0}
                </span>
                <span className="w-24 text-right">
                  <Link
                    to={`/products/${p.id}`}
                    className="rounded-2xs border border-accent/30 px-2 py-1 text-2xs text-accent transition-colors hover:bg-accent-dim"
                  >
                    View Analysis
                  </Link>
                </span>
              </div>
            ))}
          </>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-glass-border px-3 py-2">
            <span className="font-mono text-[10px] text-graphite-500">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded px-2 py-0.5 font-mono text-[10px] text-graphite-400 ring-1 ring-graphite-700 transition hover:bg-graphite-800 disabled:opacity-30"
              >
                ← PREV
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= pagination.totalPages}
                className="rounded px-2 py-0.5 font-mono text-[10px] text-graphite-400 ring-1 ring-graphite-700 transition hover:bg-graphite-800 disabled:opacity-30"
              >
                NEXT →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
