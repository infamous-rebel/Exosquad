/**
 * Risk list panel — displays risk items with severity, evidence, reason, impact, required action.
 */

export interface RiskItem {
  id: string;
  riskType: string;
  severity: string;
  description: string;
  impact?: string | null;
  requiredAction?: string | null;
  confidence?: number | null;
  evidenceCount?: number;
}

interface RiskPanelProps {
  risks: RiskItem[];
  title?: string;
  onEvidenceClick?: (riskId: string) => void;
  className?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-status-failed",
  high: "text-status-failed",
  medium: "text-status-stale",
  low: "text-status-changed",
  info: "text-graphite-400",
};

export function RiskPanel({ risks, title = "RISKS", onEvidenceClick, className }: RiskPanelProps) {
  if (risks.length === 0) {
    return (
      <div className={`glass-panel p-4 ${className ?? ""}`}>
        <p className="section-label mb-2">{title}</p>
        <p className="font-mono text-xs text-graphite-500">No risks identified</p>
      </div>
    );
  }

  return (
    <div className={`glass-panel p-4 ${className ?? ""}`}>
      <p className="section-label mb-3">{title} ({risks.length})</p>
      <div className="space-y-3">
        {risks.map((risk) => (
          <div key={risk.id} className="rounded bg-graphite-900/50 p-3 ring-1 ring-graphite-800">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`font-mono text-[10px] uppercase font-bold ${SEVERITY_COLORS[risk.severity] ?? "text-graphite-400"}`}>
                  {risk.severity}
                </span>
                <span className="font-mono text-xs text-graphite-300">{risk.riskType}</span>
              </div>
              {risk.confidence !== null && risk.confidence !== undefined && (
                <span className="font-mono text-[10px] text-graphite-500">
                  {(risk.confidence * 100).toFixed(0)}% conf.
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-graphite-400">{risk.description}</p>
            {risk.impact && (
              <p className="mt-1 font-mono text-[10px] text-graphite-500">
                <span className="text-graphite-600">IMPACT:</span> {risk.impact}
              </p>
            )}
            {risk.requiredAction && (
              <p className="mt-1 font-mono text-[10px] text-status-changed">
                <span className="text-graphite-600">ACTION:</span> {risk.requiredAction}
              </p>
            )}
            {onEvidenceClick && risk.evidenceCount !== undefined && risk.evidenceCount > 0 && (
              <button
                onClick={() => onEvidenceClick(risk.id)}
                className="mt-2 font-mono text-[10px] text-accent hover:underline"
              >
                {risk.evidenceCount} evidence items →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
