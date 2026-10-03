import { useState, type FormEvent } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { PageMeta } from "../components/seo/PageMeta";

export function LoginPage() {
  const { login, isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Redirect already-authenticated users to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      await login(email, password, tenantSlug);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in. Check your credentials and try again.");
    }
  }

  return (
    <>
    <PageMeta title="Sign In — EXOSQUAD" noindex />
    <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <h1 className="font-mono text-xl font-bold tracking-widest text-graphite-100">
              EXOSQUAD
            </h1>
          </Link>
          <p className="mt-1 font-mono text-xs tracking-wide text-graphite-500">
            INTELLIGENCE TERMINAL
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-panel space-y-4 p-6">
          <p className="section-label mb-4">SIGN IN</p>

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
              htmlFor="login-email"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            >
              Email
            </label>
            <input
              id="login-email"
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
              htmlFor="login-password"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label
              htmlFor="login-tenant"
              className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
            >
              Tenant Slug
            </label>
            <input
              id="login-tenant"
              type="text"
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              required
              className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
              placeholder="my-company"
              autoComplete="organization"
            />
          </div>

          <div className="text-right">
            <Link
              to="/forgot-password"
              className="font-mono text-[10px] text-accent/70 hover:text-accent"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded bg-accent/20 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent ring-1 ring-accent/40 transition hover:bg-accent/30 disabled:opacity-50"
          >
            {isLoading ? "PROCESSING..." : "AUTHENTICATE"}
          </button>

          <div className="text-center">
            <Link
              to="/register"
              className="font-mono text-[10px] text-graphite-500 hover:text-graphite-300"
            >
              No account? Register →
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
