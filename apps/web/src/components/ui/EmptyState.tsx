/**
 * Intelligence-aware empty state component.
 * Explains the actual situation and suggests next action.
 */

interface EmptyStateProps {
  title: string;
  description: string;
  action?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, actionHref, onAction, icon, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className ?? ""}`}>
      {icon && <div className="mb-4 text-graphite-600">{icon}</div>}
      <p className="section-label mb-2">{title}</p>
      <p className="max-w-sm font-mono text-xs text-graphite-500">{description}</p>
      {action && (
        onAction ? (
          <button
            onClick={onAction}
            className="mt-4 rounded bg-accent/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent ring-1 ring-accent/40 transition hover:bg-accent/30"
          >
            {action}
          </button>
        ) : actionHref ? (
          <a
            href={actionHref}
            className="mt-4 rounded bg-accent/20 px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent ring-1 ring-accent/40 transition hover:bg-accent/30"
          >
            {action}
          </a>
        ) : null
      )}
    </div>
  );
}
