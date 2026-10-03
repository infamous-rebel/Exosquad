import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { PageMeta } from "../components/seo/PageMeta";

// ─── Data ────────────────────────────────────────────────────────────────────

const WORKFLOW_STAGES = [
  { label: "Product", icon: "◆" },
  { label: "Demand", icon: "▲" },
  { label: "Competition", icon: "●" },
  { label: "Supplier", icon: "■" },
  { label: "Logistics", icon: "▸" },
  { label: "Landed Cost", icon: "$" },
  { label: "Economics", icon: "◎" },
  { label: "Research", icon: "?" },
  { label: "Outreach", icon: "→" },
  { label: "Decision", icon: "✓" },
];

const CAPABILITIES = [
  {
    title: "Product Discovery",
    description:
      "Find and investigate products relevant to the Bangladesh resale market. Trace brand identity, variants, barcodes, and product attributes across sources.",
  },
  {
    title: "Demand Intelligence",
    description:
      "Understand demand signals, trend trajectories, acceleration, and market persistence. Eight deterministic calculation engines with confidence scoring.",
  },
  {
    title: "Supply Intelligence",
    description:
      "Trace suppliers, manufacturers, and sourcing opportunities through a provenance graph. Evaluate supply chain relationships with evidence-backed confidence.",
  },
  {
    title: "Logistics",
    description:
      "Understand routes, transport nodes, ports, and logistics constraints. Calculate route confidence, transit durations, and risk across supply chain paths.",
  },
  {
    title: "Economics",
    description:
      "Calculate landed costs with 11 cost categories, margin analysis, pricing scenarios, and Bangladesh market economics. Every figure traces to its inputs.",
  },
  {
    title: "AI Research",
    description:
      "Investigate questions, evidence gaps, contradictions, and supplier claims. AI augments reasoning — deterministic engines always run first.",
  },
  {
    title: "Supplier Outreach",
    description:
      "Turn supplier intelligence into structured sourcing conversations. Generate outreach based on evidence, not guesswork.",
  },
  {
    title: "Evidence & Provenance",
    description:
      "Every claim traces back to its source. Observations, calculations, and AI extractions are distinguished and preserved independently.",
  },
];

const EVIDENCE_STATUSES = [
  { label: "Observed", color: "text-status-live" },
  { label: "Calculated", color: "text-accent" },
  { label: "AI-extracted", color: "text-status-changed" },
  { label: "Verified", color: "text-status-live" },
  { label: "Unverified", color: "text-graphite-400" },
  { label: "Contradicted", color: "text-status-failed" },
  { label: "Unknown", color: "text-status-nodata" },
];

const JOURNEY_STEPS = [
  { num: "01", title: "Discover", desc: "Identify products with resale potential in Bangladesh" },
  { num: "02", title: "Research", desc: "Investigate demand, competition, and market conditions" },
  { num: "03", title: "Evaluate", desc: "Assess suppliers, logistics, and landed costs" },
  { num: "04", title: "Source", desc: "Trace supply chains and identify sourcing opportunities" },
  { num: "05", title: "Validate", desc: "Verify claims against evidence, check contradictions" },
  { num: "06", title: "Act", desc: "Make informed decisions with full intelligence context" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Authenticated users should go to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-graphite-950">
      <PageMeta
        title="EXOSQUAD — Product Intelligence for Bangladesh Resellers"
        description="Discover products, research markets, evaluate suppliers, calculate economics, and act with evidence. Intelligence platform for Bangladesh resellers."
        ogTitle="EXOSQUAD — Product Intelligence for Bangladesh Resellers"
        ogDescription="Discover products, research markets, evaluate suppliers, calculate economics, and act with evidence."
      />

      {/* ─── Navigation ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-glass-border bg-graphite-950/90 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-8">
          <Link to="/" className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-accent">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-sm font-semibold tracking-wider text-graphite-50">
              EXOSQUAD
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#product" className="text-xs text-graphite-300 transition-colors hover:text-graphite-50">
              Product
            </a>
            <a href="#workflow" className="text-xs text-graphite-300 transition-colors hover:text-graphite-50">
              How It Works
            </a>
            <a href="#intelligence" className="text-xs text-graphite-300 transition-colors hover:text-graphite-50">
              Intelligence
            </a>
            <a href="#evidence" className="text-xs text-graphite-300 transition-colors hover:text-graphite-50">
              Evidence
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/login"
              className="text-xs text-graphite-300 transition-colors hover:text-graphite-50"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              className="rounded-xs border border-accent/30 bg-accent-dim px-4 py-1.5 text-xs font-medium text-accent transition-all hover:bg-accent/20"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-8 w-8 items-center justify-center text-graphite-400 md:hidden"
            aria-label="Toggle menu"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              {mobileMenuOpen ? (
                <path d="M4 4l10 10M14 4L4 14" strokeLinecap="round" />
              ) : (
                <>
                  <path d="M2 4h14M2 9h14M2 14h14" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="border-t border-glass-border px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-3">
              <a href="#product" onClick={() => setMobileMenuOpen(false)} className="text-xs text-graphite-300">Product</a>
              <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="text-xs text-graphite-300">How It Works</a>
              <a href="#intelligence" onClick={() => setMobileMenuOpen(false)} className="text-xs text-graphite-300">Intelligence</a>
              <a href="#evidence" onClick={() => setMobileMenuOpen(false)} className="text-xs text-graphite-300">Evidence</a>
              <div className="mt-2 flex flex-col gap-2">
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="text-xs text-graphite-300">Sign In</Link>
                <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="rounded-xs border border-accent/30 bg-accent-dim px-4 py-1.5 text-center text-xs font-medium text-accent">Get Started</Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ─── Hero ───────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
        <div className="text-center">
          <p className="section-label mb-4">PRODUCT INTELLIGENCE FOR BANGLADESH RESELLERS</p>
          <h1 className="mb-6 text-3xl font-light leading-tight tracking-tight text-graphite-50 sm:text-5xl">
            Discover products.
            <br />
            Research markets.
            <br />
            <span className="text-accent">Act with evidence.</span>
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-sm leading-relaxed text-graphite-400">
            Evaluate suppliers. Calculate economics. Trace supply chains.
            EXOSQUAD connects intelligence domains into a single evidence-based workflow.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xs border border-accent/30 bg-accent-dim px-6 py-2.5 text-xs font-medium text-accent transition-all hover:bg-accent/20"
            >
              Enter Intelligence Terminal
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <a
              href="#product"
              className="inline-flex items-center gap-2 rounded-xs border border-graphite-700 px-6 py-2.5 text-xs font-medium text-graphite-300 transition-all hover:border-graphite-600 hover:text-graphite-100"
            >
              Explore Product
            </a>
          </div>
        </div>
      </section>

      {/* ─── Intelligence Workflow ──────────────────────────────────────── */}
      <section id="workflow" className="border-y border-glass-border bg-graphite-900/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
          <p className="section-label mb-2 text-center">CONNECTED INTELLIGENCE</p>
          <h2 className="mb-8 text-center text-xl font-light tracking-tight text-graphite-100 sm:text-2xl">
            From product discovery to sourcing decision
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {WORKFLOW_STAGES.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-2 sm:gap-3">
                <div className="glass-panel flex flex-col items-center px-3 py-2.5 sm:px-4 sm:py-3">
                  <span className="mb-1 text-sm text-accent">{stage.icon}</span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-graphite-300 sm:text-[10px]">
                    {stage.label}
                  </span>
                </div>
                {i < WORKFLOW_STAGES.length - 1 && (
                  <span className="hidden text-graphite-600 sm:inline">→</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-6 text-center font-mono text-[10px] text-graphite-500">
            Every stage connects to the next — not isolated tools, but a unified intelligence system
          </p>
        </div>
      </section>

      {/* ─── Product Capabilities ───────────────────────────────────────── */}
      <section id="product" className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-20">
        <p className="section-label mb-2 text-center">CAPABILITIES</p>
        <h2 className="mb-10 text-center text-xl font-light tracking-tight text-graphite-100 sm:text-2xl">
          What EXOSQUAD does
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title} className="glass-panel p-4">
              <h3 className="mb-2 font-mono text-xs font-semibold tracking-wide text-graphite-100">
                {cap.title}
              </h3>
              <p className="font-mono text-[10px] leading-relaxed text-graphite-400">
                {cap.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Evidence-First Positioning ─────────────────────────────────── */}
      <section id="evidence" className="border-y border-glass-border bg-graphite-900/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-label mb-2">EVIDENCE-FIRST INTELLIGENCE</p>
            <h2 className="mb-4 text-xl font-light tracking-tight text-graphite-100 sm:text-2xl">
              Traceability over certainty
            </h2>
            <p className="mb-8 text-sm leading-relaxed text-graphite-400">
              EXOSQUAD distinguishes between what has been observed, what has been calculated,
              what AI has extracted, and what remains unknown. Every conclusion links back to its
              evidence. No claim is presented as fact without provenance.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {EVIDENCE_STATUSES.map((status) => (
              <div
                key={status.label}
                className="flex items-center gap-2 rounded-xs border border-graphite-800 px-3 py-1.5"
              >
                <span className={`h-1.5 w-1.5 rounded-full bg-current ${status.color}`} />
                <span className={`font-mono text-[10px] ${status.color}`}>
                  {status.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-8 max-w-lg">
            <div className="glass-panel p-4">
              <p className="section-label mb-3 text-center">PROVENANCE CHAIN</p>
              <div className="flex items-center justify-center gap-2 font-mono text-[10px] text-graphite-400">
                <span className="text-graphite-300">Source</span>
                <span className="text-graphite-600">→</span>
                <span className="text-graphite-300">Observation</span>
                <span className="text-graphite-600">→</span>
                <span className="text-graphite-300">Evidence</span>
                <span className="text-graphite-600">→</span>
                <span className="text-accent">Intelligence</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Product Journey ────────────────────────────────────────────── */}
      <section id="intelligence" className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-20">
        <p className="section-label mb-2 text-center">PRODUCT WORKFLOW</p>
        <h2 className="mb-10 text-center text-xl font-light tracking-tight text-graphite-100 sm:text-2xl">
          How intelligence flows
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {JOURNEY_STEPS.map((step) => (
            <div key={step.num} className="glass-panel p-4">
              <div className="mb-2 flex items-center gap-3">
                <span className="font-mono text-lg font-bold text-accent/60">
                  {step.num}
                </span>
                <h3 className="font-mono text-xs font-semibold tracking-wide text-graphite-100">
                  {step.title}
                </h3>
              </div>
              <p className="font-mono text-[10px] leading-relaxed text-graphite-400">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Trust / Provenance ─────────────────────────────────────────── */}
      <section className="border-y border-glass-border bg-graphite-900/30">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <p className="section-label mb-2 text-center">HOW EXOSQUAD HANDLES INTELLIGENCE QUALITY</p>
            <h2 className="mb-6 text-center text-xl font-light tracking-tight text-graphite-100 sm:text-2xl">
              Built on traceable evidence
            </h2>
            <div className="space-y-4">
              <TrustItem
                title="Source Provenance"
                description="Every observation records its raw source, URL, retrieval timestamp, content hash, and parser version. Historical observations are never overwritten."
              />
              <TrustItem
                title="Uncertainty Preservation"
                description="When information is incomplete or conflicting, EXOSQUAD preserves the contradiction rather than silently choosing one version. Unknown values remain unknown."
              />
              <TrustItem
                title="Calculated vs Observed"
                description="Landed costs, demand signals, and confidence scores are deterministic calculations — clearly separated from observed data and AI-assisted research."
              />
              <TrustItem
                title="AI-Assisted, Not AI-Dependent"
                description="AI augments reasoning over evidence. The deterministic engine always runs first. AI output is never presented as automatically factual."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-8 sm:py-24">
        <h2 className="mb-4 text-xl font-light tracking-tight text-graphite-100 sm:text-2xl">
          Start your intelligence workflow
        </h2>
        <p className="mx-auto mb-8 max-w-md text-sm text-graphite-400">
          Create your workspace, configure your market focus, and begin investigating
          product opportunities with evidence-backed intelligence.
        </p>
        <Link
          to="/register"
          className="inline-flex items-center gap-2 rounded-xs border border-accent/30 bg-accent-dim px-8 py-3 text-sm font-medium text-accent transition-all hover:bg-accent/20"
        >
          Enter Intelligence Terminal
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-glass-border px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-accent/60">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-mono text-[10px] text-graphite-500">
              EXOSQUAD — Production intelligence platform
            </span>
          </div>
          <p className="font-mono text-[9px] text-graphite-600">
            No fabricated data. Evidence-based intelligence.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TrustItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass-panel p-4">
      <h3 className="mb-1 font-mono text-[11px] font-semibold tracking-wide text-graphite-100">
        {title}
      </h3>
      <p className="font-mono text-[10px] leading-relaxed text-graphite-400">
        {description}
      </p>
    </div>
  );
}
