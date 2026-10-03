import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { TableSkeleton } from "../components/ui/skeletons";

export function ResearchPage() {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const requests = useQuery({ queryKey: queryKeys.research.list({ page: 1, limit: 20 }), queryFn: () => api.research.list({ page: 1, limit: 20 }) });
  const createMutation = useMutation({
    mutationFn: (q: string) => api.research.create({ question: q }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.research.lists() }),
  });

  return (
    <div className="h-full overflow-y-auto p-4">
      <p className="section-label mb-1">RESEARCH</p>
      <h1 className="mb-4 text-lg font-light text-graphite-50">Research requests and intelligence gaps</h1>

      {/* Create request */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a research question..."
          className="neu-control flex-1 rounded px-3 py-2 font-mono text-xs text-graphite-100 placeholder:text-graphite-500 outline-none"
        />
        <button
          onClick={() => { if (question.trim()) { createMutation.mutate(question); setQuestion(""); } }}
          disabled={createMutation.isPending}
          className="rounded bg-accent/20 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-accent ring-1 ring-accent/40 hover:bg-accent/30 disabled:opacity-50"
        >
          SUBMIT
        </button>
      </div>

      <div className="glass-panel">
        <div className="border-b border-glass-border px-3 py-2"><span className="section-label">REQUESTS</span></div>
        {requests.isLoading && <TableSkeleton rows={3} cols={3} />}
        {requests.isError && <ErrorState onRetry={() => requests.refetch()} />}
        {requests.isSuccess && (!requests.data?.data || requests.data.data.length === 0) && <EmptyState title="NO REQUESTS" description="No research requests submitted yet." />}
        {requests.isSuccess && requests.data?.data && requests.data.data.length > 0 && (
          <div className="divide-y divide-glass-border">
            {requests.data.data.map((r) => (
              <div key={r.id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${r.status === "completed" ? "bg-status-live/10 text-status-live" : r.status === "processing" ? "bg-status-changed/10 text-status-changed" : "bg-graphite-800 text-graphite-500"}`}>{r.status}</span>
                  <span className="text-xs text-graphite-200">{r.question}</span>
                </div>
                {r.questionType && <p className="mt-1 text-[10px] text-graphite-500">{r.questionType}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
