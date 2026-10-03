/**
 * Global search dialog — command palette triggered by / or Cmd+K.
 * Debounced input (300ms), searches products, evidence, research requests.
 * Results grouped by entity type with type badge. Navigate on selection.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import type { Product, Evidence, ResearchRequest } from "../../lib/api";

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ResultGroup = {
  type: "PRODUCT" | "EVIDENCE" | "RESEARCH";
  label: string;
  items: SearchResult[];
};

type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  badge: string;
  href: string;
};

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      const [productsRes, evidenceRes, researchRes] = await Promise.allSettled([
        api.products.list({ search: q, limit: 5 }),
        api.evidence.list({ search: q, limit: 5 }),
        api.research.list({ question: q, limit: 5 } as Record<string, unknown> as { page?: number; limit?: number }),
      ]);

      const groups: ResultGroup[] = [];

      if (productsRes.status === "fulfilled") {
        const products = (productsRes.value as { data: Product[] }).data ?? [];
        if (products.length > 0) {
          groups.push({
            type: "PRODUCT",
            label: "PRODUCTS",
            items: products.map((p) => ({
              id: p.id,
              title: p.name,
              subtitle: `${p.brand?.name ?? "Unknown brand"} · ${p.category?.name ?? "Unknown category"}`,
              badge: p.status.toUpperCase(),
              href: `/products/${p.id}`,
            })),
          });
        }
      }

      if (evidenceRes.status === "fulfilled") {
        const evidence = (evidenceRes.value as { data: Evidence[] }).data ?? [];
        if (evidence.length > 0) {
          groups.push({
            type: "EVIDENCE",
            label: "EVIDENCE",
            items: evidence.map((e) => ({
              id: e.id,
              title: `${e.evidenceType} — ${e.entityType}`,
              subtitle: e.observedValue ?? undefined,
              badge: e.status,
              href: `/evidence`,
            })),
          });
        }
      }

      if (researchRes.status === "fulfilled") {
        const requests = (researchRes.value as { data: ResearchRequest[] }).data ?? [];
        if (requests.length > 0) {
          groups.push({
            type: "RESEARCH",
            label: "RESEARCH",
            items: requests.map((r) => ({
              id: r.id,
              title: r.question,
              subtitle: r.status,
              badge: r.status.toUpperCase(),
              href: `/research`,
            })),
          });
        }
      }

      setResults(groups);
      setSelectedIndex(0);
    } catch {
      // Silently fail — show empty results
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  // Flatten results for keyboard navigation
  const allItems = results.flatMap((g) => g.items);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && allItems[selectedIndex]) {
      navigate(allItems[selectedIndex]!.href);
      onClose();
    }
  }

  if (!isOpen) return null;

  let flatIdx = 0;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-graphite-950/70" onClick={onClose} />
      <div className="fixed left-1/2 top-16 z-50 w-full max-w-lg -translate-x-1/2 rounded-lg border border-graphite-800 bg-graphite-900 shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-2 border-b border-graphite-800 px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-graphite-500 shrink-0">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3 3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search products, evidence, research..."
            className="w-full bg-transparent font-mono text-sm text-graphite-100 placeholder:text-graphite-600 outline-none"
          />
          <kbd className="shrink-0 rounded border border-graphite-700 px-1.5 py-0.5 font-mono text-[10px] text-graphite-500">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {isLoading && (
            <div className="px-4 py-6 text-center">
              <span className="font-mono text-xs text-graphite-500">Searching...</span>
            </div>
          )}

          {!isLoading && query.length >= 2 && results.length === 0 && (
            <div className="px-4 py-6 text-center">
              <span className="font-mono text-xs text-graphite-500">No results found</span>
            </div>
          )}

          {!isLoading && results.map((group) => (
            <div key={group.type}>
              <div className="px-4 py-1.5">
                <span className="font-mono text-[9px] uppercase tracking-wider text-graphite-600">{group.label}</span>
              </div>
              {group.items.map((item) => {
                const idx = flatIdx++;
                return (
                  <button
                    key={item.id}
                    onClick={() => { navigate(item.href); onClose(); }}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                      idx === selectedIndex ? "bg-accent/10" : "hover:bg-graphite-800/50"
                    }`}
                  >
                    <span className={`shrink-0 rounded px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
                      group.type === "PRODUCT" ? "bg-accent/10 text-accent" :
                      group.type === "EVIDENCE" ? "bg-status-updated/10 text-status-updated" :
                      "bg-status-changed/10 text-status-changed"
                    }`}>
                      {item.badge}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-graphite-200">{item.title}</p>
                      {item.subtitle && (
                        <p className="truncate font-mono text-[10px] text-graphite-500">{item.subtitle}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}

          {!isLoading && query.length < 2 && (
            <div className="px-4 py-6 text-center">
              <span className="font-mono text-xs text-graphite-500">Type at least 2 characters to search</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
