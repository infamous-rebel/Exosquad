/**
 * Action checklist — checkbox items with deep-link navigation.
 */

interface ActionItem {
  id: string;
  label: string;
  description?: string;
  completed: boolean;
  href?: string;
  priority?: "high" | "medium" | "low";
}

interface ActionChecklistProps {
  items: ActionItem[];
  onToggle?: (id: string) => void;
  onNavigate?: (href: string) => void;
  title?: string;
  className?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-status-failed",
  medium: "text-status-stale",
  low: "text-graphite-500",
};

export function ActionChecklist({ items, onToggle, onNavigate, title = "ACTIONS", className }: ActionChecklistProps) {
  const completedCount = items.filter((i) => i.completed).length;

  return (
    <div className={`glass-panel p-4 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="section-label">{title}</p>
        <span className="font-mono text-[10px] text-graphite-500">
          {completedCount}/{items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-2 rounded px-2 py-1.5 ${
              item.completed ? "opacity-50" : ""
            }`}
          >
            <button
              onClick={() => onToggle?.(item.id)}
              className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                item.completed
                  ? "border-accent bg-accent/30"
                  : "border-graphite-600 hover:border-accent"
              }`}
              aria-label={`Mark ${item.label} as ${item.completed ? "incomplete" : "complete"}`}
            >
              {item.completed && (
                <svg className="h-2.5 w-2.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {item.priority && (
                  <span className={`font-mono text-[8px] uppercase ${PRIORITY_COLORS[item.priority]}`}>
                    ●
                  </span>
                )}
                <span
                  className={`font-mono text-xs ${
                    item.completed ? "text-graphite-500 line-through" : "text-graphite-200"
                  } ${item.href ? "cursor-pointer hover:text-accent" : ""}`}
                  onClick={() => item.href && onNavigate?.(item.href)}
                >
                  {item.label}
                </span>
              </div>
              {item.description && (
                <p className="mt-0.5 font-mono text-[10px] text-graphite-500">{item.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
