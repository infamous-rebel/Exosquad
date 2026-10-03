/**
 * Navigation breadcrumbs.
 */

import { Link } from "react-router-dom";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={`flex items-center gap-1 font-mono text-[10px] ${className ?? ""}`} aria-label="Breadcrumb">
      {items.map((item, idx) => (
        <span key={idx} className="flex items-center gap-1">
          {idx > 0 && <span className="text-graphite-700">/</span>}
          {item.href && idx < items.length - 1 ? (
            <Link to={item.href} className="text-graphite-500 hover:text-graphite-300 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-graphite-300">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
