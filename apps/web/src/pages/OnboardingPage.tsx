import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getToken } from "../lib/auth";
import { PageMeta } from "../components/seo/PageMeta";

const STEPS = [
  { label: "Business Profile", description: "Tell us about your business" },
  { label: "Market Focus", description: "Your target market and categories" },
  { label: "Sourcing", description: "Where you source from" },
  { label: "Objective", description: "What you want to achieve" },
] as const;

const BUSINESS_ROLES = [
  { value: "reseller", label: "Reseller" },
  { value: "importer", label: "Importer" },
  { value: "both", label: "Both" },
] as const;

const SOURCING_REGIONS = [
  "China",
  "India",
  "Southeast Asia",
  "Middle East",
  "Europe",
  "North America",
  "Africa",
  "South America",
] as const;

const OBJECTIVES = [
  "Find products to resell in Bangladesh",
  "Research supplier options for my business",
  "Calculate landed costs for imports",
  "Evaluate market demand for products",
  "Discover new sourcing opportunities",
] as const;

export function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Business Profile
  const [businessName, setBusinessName] = useState("");
  const [businessRole, setBusinessRole] = useState<string>("reseller");

  // Step 2: Market Focus
  const [primaryMarket, setPrimaryMarket] = useState("Bangladesh");
  const [productCategories, setProductCategories] = useState("");

  // Step 3: Sourcing Preferences
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [budgetRange, setBudgetRange] = useState("");

  // Step 4: Objective
  const [objective, setObjective] = useState("");

  function toggleRegion(region: string) {
    setSelectedRegions((prev) =>
      prev.includes(region)
        ? prev.filter((r) => r !== region)
        : [...prev, region],
    );
  }

  function nextStep() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  }

  function prevStep() {
    if (step > 0) {
      setStep(step - 1);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const onboardingData = {
      businessName: businessName || user?.name || undefined,
      businessRole,
      primaryMarket,
      productCategories: productCategories
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      sourcingRegions: selectedRegions,
      budgetRange: budgetRange || undefined,
      objective: objective || undefined,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date().toISOString(),
    };

    try {
      const token = getToken();
      const res = await fetch("/api/v1/auth/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(onboardingData),
      });

      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: { message: res.statusText } }));
        throw new Error(
          body.error?.message ?? "We couldn't save your workspace configuration. Try again.",
        );
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We couldn't save your workspace configuration. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <PageMeta title="Workspace Setup — EXOSQUAD" noindex />
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="font-mono text-xl font-bold tracking-widest text-graphite-100">
            EXOSQUAD
          </h1>
          <p className="mt-1 font-mono text-xs tracking-wide text-graphite-500">
            WORKSPACE SETUP
          </p>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.label} className="flex flex-1 items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                      i < step
                        ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                        : i === step
                          ? "bg-accent/30 text-accent ring-1 ring-accent/60"
                          : "bg-graphite-800 text-graphite-500 ring-1 ring-graphite-700"
                    }`}
                  >
                    {i < step ? "✓" : i + 1}
                  </div>
                  <span
                    className={`mt-1 hidden font-mono text-[8px] uppercase tracking-wider sm:block ${
                      i <= step ? "text-graphite-300" : "text-graphite-600"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-1 h-px flex-1 ${
                      i < step ? "bg-accent/40" : "bg-graphite-800"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-panel p-6">
          <p className="section-label mb-1">
            STEP {step + 1} OF {STEPS.length}
          </p>
          <p className="mb-6 font-mono text-[10px] text-graphite-500">
            {STEPS[step]?.description}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded border border-status-failed/30 bg-status-failed/10 px-3 py-2 font-mono text-xs text-status-failed"
            >
              {error}
            </div>
          )}

          {/* Step 1: Business Profile */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="onboard-biz-name"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
                >
                  Business Name
                </label>
                <input
                  id="onboard-biz-name"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
                  placeholder="Your business or organization"
                />
              </div>
              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-graphite-500">
                  Business Role
                </label>
                <div className="flex gap-2">
                  {BUSINESS_ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setBusinessRole(r.value)}
                      className={`flex-1 rounded px-3 py-2 font-mono text-xs transition ${
                        businessRole === r.value
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                          : "bg-graphite-900 text-graphite-400 ring-1 ring-graphite-700 hover:text-graphite-200"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Market Focus */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="onboard-market"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
                >
                  Primary Market
                </label>
                <input
                  id="onboard-market"
                  type="text"
                  value={primaryMarket}
                  onChange={(e) => setPrimaryMarket(e.target.value)}
                  className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
                  placeholder="Bangladesh"
                />
              </div>
              <div>
                <label
                  htmlFor="onboard-categories"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
                >
                  Product Categories
                </label>
                <input
                  id="onboard-categories"
                  type="text"
                  value={productCategories}
                  onChange={(e) => setProductCategories(e.target.value)}
                  className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
                  placeholder="Electronics, textiles, machinery (comma-separated)"
                />
                <p className="mt-1 font-mono text-[9px] text-graphite-600">
                  Separate multiple categories with commas
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Sourcing Preferences */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-graphite-500">
                  Sourcing Regions
                </label>
                <div className="flex flex-wrap gap-2">
                  {SOURCING_REGIONS.map((region) => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => toggleRegion(region)}
                      className={`rounded px-3 py-1.5 font-mono text-[10px] transition ${
                        selectedRegions.includes(region)
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                          : "bg-graphite-900 text-graphite-400 ring-1 ring-graphite-700 hover:text-graphite-200"
                      }`}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label
                  htmlFor="onboard-budget"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
                >
                  Budget Range (optional)
                </label>
                <input
                  id="onboard-budget"
                  type="text"
                  value={budgetRange}
                  onChange={(e) => setBudgetRange(e.target.value)}
                  className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
                  placeholder="e.g., 50,000 - 200,000 BDT per shipment"
                />
              </div>
            </div>
          )}

          {/* Step 4: Objective */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-wider text-graphite-500">
                  What are you researching?
                </label>
                <div className="space-y-2">
                  {OBJECTIVES.map((obj) => (
                    <button
                      key={obj}
                      type="button"
                      onClick={() => setObjective(obj)}
                      className={`w-full rounded px-3 py-2 text-left font-mono text-xs transition ${
                        objective === obj
                          ? "bg-accent/20 text-accent ring-1 ring-accent/40"
                          : "bg-graphite-900 text-graphite-400 ring-1 ring-graphite-700 hover:text-graphite-200"
                      }`}
                    >
                      {obj}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label
                  htmlFor="onboard-custom-obj"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
                >
                  Or describe your objective
                </label>
                <textarea
                  id="onboard-custom-obj"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  rows={3}
                  className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
                  placeholder="Describe what you want to achieve..."
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={prevStep}
              disabled={step === 0}
              className="rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-graphite-400 transition hover:text-graphite-200 disabled:opacity-30"
            >
              ← Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={nextStep}
                className="rounded bg-accent/20 px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/40 transition hover:bg-accent/30"
              >
                Next →
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-accent/20 px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-accent ring-1 ring-accent/40 transition hover:bg-accent/30 disabled:opacity-50"
              >
                {isSubmitting ? "SAVING..." : "COMPLETE SETUP"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
    </>
  );
}
