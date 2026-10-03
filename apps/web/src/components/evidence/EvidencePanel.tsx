/**
 * Evidence panel — slide-out sidebar showing evidence detail.
 * Source, evidence type, observed value, dates, quality, verification status, region.
 */

import type { EvidenceDetail } from "../../lib/api";
import { EvidenceBadge } from "./EvidenceBadge";
import { FreshnessIndicator } from "../ui/FreshnessIndicator";
import { UnknownValue } from "../ui/UnknownValue";

interface EvidencePanelProps {
  evidence: EvidenceDetail | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

export function EvidencePanel({ evidence, isOpen, onClose, isLoading }: EvidencePanelProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-graphite-950/60" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-96 flex-col border-l border-graphite-800 bg-graphite-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-graphite-800 px-4 py-3">
          <p className="section-label">EVIDENCE DETAIL</p>
          <button
            onClick={onClose}
            className="rounded p-1 font-mono text-graphite-500 hover:bg-graphite-800 hover:text-graphite-300"
            aria-label="Close evidence panel"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <span className="font-mono text-xs text-graphite-500">Loading evidence...</span>
            </div>
          )}

          {!isLoading && !evidence && (
            <div className="flex items-center justify-center py-8">
              <span className="font-mono text-xs text-graphite-500">No evidence selected</span>
            </div>
          )}

          {!isLoading && evidence && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                <EvidenceBadge status={evidence.status} />
                <EvidenceBadge status={evidence.freshness} />
              </div>

              {/* Core fields */}
              <Field label="Evidence Type" value={evidence.evidenceType} />
              <Field label="Entity" value={`${evidence.entityType} → ${evidence.entityId}`} />
              <Field label="Observed Value" value={evidence.observedValue ?? "Unknown"} />
              <Field label="Source ID" value={evidence.sourceId ?? "Unknown"} mono />
              <Field label="Region" value={evidence.region ?? "Unknown"} />
              <Field
                label="Confidence"
                value={
                  evidence.confidence !== null
                    ? `${(evidence.confidence * 100).toFixed(0)}%`
                    : "Unknown"
                }
              />

              {/* Dates */}
              <div className="thin-divider" />
              <Field label="Observed At" value={evidence.observedAt ? new Date(evidence.observedAt).toLocaleString() : "Unknown"} />
              <Field label="Recorded At" value={evidence.createdAt ? new Date(evidence.createdAt).toLocaleString() : "Unknown"} />
              <div className="mt-2">
                <FreshnessIndicator timestamp={evidence.observedAt} />
              </div>

              {/* Quality metadata */}
              {evidence.quality && Object.keys(evidence.quality).length > 0 && (
                <>
                  <div className="thin-divider" />
                  <p className="font-mono text-[10px] uppercase tracking-wider text-graphite-500">QUALITY</p>
                  <pre className="mt-1 overflow-x-auto rounded bg-graphite-900 p-2 font-mono text-[10px] text-graphite-400">
                    {JSON.stringify(evidence.quality, null, 2)}
                  </pre>
                </>
              )}

              {/* Additional metadata */}
              {evidence.metadata && Object.keys(evidence.metadata).length > 0 && (
                <>
                  <div className="thin-divider" />
                  <p className="font-mono text-[10px] uppercase tracking-wider text-graphite-500">METADATA</p>
                  <pre className="mt-1 overflow-x-auto rounded bg-graphite-900 p-2 font-mono text-[10px] text-graphite-400">
                    {JSON.stringify(evidence.metadata, null, 2)}
                  </pre>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-graphite-500">{label}</p>
      <p className={`mt-0.5 text-xs text-graphite-200 ${mono ? "font-mono" : ""}`}>
        <UnknownValue value={value} />
      </p>
    </div>
  );
}
