import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { label: "OVERVIEW", path: "/dashboard", icon: OverviewIcon },
  { label: "PRODUCTS", path: "/products", icon: ProductsIcon },
  { label: "MARKET", path: "/market", icon: MarketIcon },
  { label: "DEMAND", path: "/demand", icon: DemandIcon },
  { label: "COMPETITION", path: "/competition", icon: CompetitionIcon },
  { label: "SUPPLY", path: "/supply", icon: SupplyIcon },
  { label: "SOURCING", path: "/sourcing", icon: SourcingIcon },
  { label: "LOGISTICS", path: "/logistics", icon: LogisticsIcon },
  { label: "ECONOMICS", path: "/economics", icon: EconomicsIcon },
  { label: "RESEARCH", path: "/research", icon: ResearchIcon },
  { label: "OUTREACH", path: "/outreach", icon: OutreachIcon },
  { label: "EVIDENCE", path: "/evidence", icon: EvidenceIcon },
];

export function NavigationRail() {
  return (
    <nav className="flex h-full w-14 flex-col items-center border-r border-glass-border bg-graphite-950 py-3">
      {/* Logo */}
      <div className="mb-4 flex h-8 w-8 items-center justify-center">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-accent">
          <path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Nav Items */}
      <div className="flex flex-1 flex-col items-center gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `group relative flex h-8 w-8 items-center justify-center rounded-xs transition-colors ${
                isActive
                  ? "bg-accent-dim text-accent"
                  : "text-graphite-400 hover:bg-graphite-800 hover:text-graphite-200"
              }`
            }
            title={label}
          >
            <Icon />
            {/* Tooltip */}
            <span className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-xs bg-graphite-800 px-2 py-1 text-2xs font-medium text-graphite-100 opacity-0 transition-opacity group-hover:opacity-100">
              {label}
            </span>
          </NavLink>
        ))}
      </div>

      {/* Bottom spacer */}
      <div className="h-4" />
    </nav>
  );
}

function OverviewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="2" y="2" width="5" height="5" rx="0.5" />
      <rect x="9" y="2" width="5" height="5" rx="0.5" />
      <rect x="2" y="9" width="5" height="5" rx="0.5" />
      <rect x="9" y="9" width="5" height="5" rx="0.5" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M2 4l6-2 6 2v8l-6 2-6-2V4z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 2v12" strokeLinecap="round" />
    </svg>
  );
}

function MarketIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M2 12l3-4 3 3 4-6 2 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DemandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M2 14V8l3-2 3 2 3-4 3 2v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CompetitionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="5" cy="5" r="3" />
      <circle cx="11" cy="5" r="3" />
      <path d="M5 8v4M11 8v4M3 14h4M9 14h4" strokeLinecap="round" />
    </svg>
  );
}

function SupplyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="8" cy="3" r="2" />
      <circle cx="3" cy="13" r="2" />
      <circle cx="13" cy="13" r="2" />
      <path d="M8 5v3M5 11l2-3M11 11l-2-3" strokeLinecap="round" />
    </svg>
  );
}

function SourcingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l3 3" strokeLinecap="round" />
    </svg>
  );
}

function LogisticsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="1" y="6" width="9" height="7" rx="0.5" />
      <path d="M10 9h3l2 2v2h-5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="4" cy="14" r="1" />
      <circle cx="12" cy="14" r="1" />
    </svg>
  );
}

function EconomicsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M4 2v12M4 6h6a3 3 0 010 6H6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M6 2a4 4 0 013.46 6L12 11l-1 1-2.54-2.54A4 4 0 116 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OutreachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M2 3h12v8H5l-3 3V3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EvidenceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M8 1l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
