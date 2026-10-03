import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { PageMeta } from "../components/seo/PageMeta";

export function ForgotPasswordPage() {
  const { forgotPassword, isLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      await forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process your request. Please try again.",
      );
    }
  }

  return (
    <>
    <PageMeta title="Forgot Password — EXOSQUAD" noindex />
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
            PASSWORD RECOVERY
          </p>
        </div>

        {/* Form */}
        <div className="glass-panel p-6">
          <p className="section-label mb-4">FORGOT PASSWORD</p>

          {submitted ? (
            <div className="space-y-4">
              <div className="rounded border border-status-live/30 bg-status-live/10 px-3 py-2 font-mono text-xs text-status-live">
                If an account with that email exists, a password reset link has
                been generated.
              </div>
              <p className="font-mono text-[10px] text-graphite-500">
                Check your email for further instructions. If you do not receive
                an email, verify the address and try again.
              </p>
              <div className="text-center">
                <Link
                  to="/login"
                  className="font-mono text-[10px] text-accent hover:text-accent/80"
                >
                  ← Return to sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="rounded border border-status-failed/30 bg-status-failed/10 px-3 py-2 font-mono text-xs text-status-failed"
                >
                  {error}
                </div>
              )}

              <p className="font-mono text-[10px] text-graphite-400">
                Enter your account email. If the account exists, you will
                receive reset instructions.
              </p>

              <div>
                <label
                  htmlFor="forgot-email"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
                >
                  Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
                  placeholder="operator@company.com"
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded bg-accent/20 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent ring-1 ring-accent/40 transition hover:bg-accent/30 disabled:opacity-50"
              >
                {isLoading ? "PROCESSING..." : "REQUEST RESET"}
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="font-mono text-[10px] text-graphite-500 hover:text-graphite-300"
                >
                  ← Back to sign in
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
