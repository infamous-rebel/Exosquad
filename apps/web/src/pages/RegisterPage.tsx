import { useState, type FormEvent } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { PageMeta } from "../components/seo/PageMeta";

export function RegisterPage() {
  const { signup, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Redirect already-authenticated users to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (tenantSlug.length < 2) {
      setError("Tenant slug must be at least 2 characters.");
      return;
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(tenantSlug)) {
      setError("Tenant slug must be lowercase alphanumeric with hyphens.");
      return;
    }

    try {
      await signup(email, password, tenantName || tenantSlug, tenantSlug, name || undefined);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create your account. Please review the fields and try again.");
    }
  }

  return (
    <>
    <PageMeta title="Register — EXOSQUAD" noindex />
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <h1 className="font-mono text-xl font-bold tracking-widest text-graphite-100">
              EXOSQUAD
            </h1>
          </Link>
          <p className="mt-1 font-mono text-xs tracking-wide text-graphite-500">
            CREATE ACCOUNT
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-panel space-y-4 p-6">
          <p className="section-label mb-4">REGISTER</p>

          {error && (
            <div
              role="alert"
              className="rounded border border-status-failed/30 bg-status-failed/10 px-3 py-2 font-mono text-xs text-status-failed"
            >
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="reg-name"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            >
              Your Name
            </label>
            <input
              id="reg-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
              placeholder="Optional"
              autoComplete="name"
            />
          </div>

          <div>
            <label
              htmlFor="reg-email"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            >
              Email
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
              placeholder="operator@company.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="reg-password"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            >
              Password
            </label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label
              htmlFor="reg-tenant-name"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            >
              Organization Name
            </label>
            <input
              id="reg-tenant-name"
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
              placeholder="My Company Ltd"
            />
          </div>

          <div>
            <label
              htmlFor="reg-tenant-slug"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            >
              Tenant Slug
            </label>
            <input
              id="reg-tenant-slug"
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              required
              pattern="^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
              minLength={2}
              maxLength={63}
              className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
              placeholder="my-company"
              autoComplete="organization"
            />
            <p className="mt-1 font-mono text-[9px] text-graphite-600">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-accent/20 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent ring-1 ring-accent/40 transition hover:bg-accent/30 disabled:opacity-50"
          >
            {isLoading ? "PROCESSING..." : "CREATE ACCOUNT"}
          </button>

          <div className="text-center">
            <Link
              to="/login"
              className="font-mono text-[10px] text-graphite-500 hover:text-graphite-300"
            >
              Already have an account? Sign in →
            </Link>
          </div>
        </form>

        {/* Footer */}
        <div className="mt-4 text-center">
          <Link
            to="/"
            className="font-mono text-[10px] text-graphite-600 hover:text-graphite-400"
          >
            ← Back to landing
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}
