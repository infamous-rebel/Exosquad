import { useState, type FormEvent } from "react";
import { Link, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { PageMeta } from "../components/seo/PageMeta";

export function ResetPasswordPage() {
  const { resetPassword, isLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // If no token in URL, show error
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-graphite-950 px-4">
        <div className="w-full max-w-sm">
          <div className="glass-panel p-6 text-center">
            <p className="section-label mb-4">INVALID REQUEST</p>
            <p className="mb-4 font-mono text-xs text-graphite-400">
              No reset token provided. Please request a new password reset link.
            </p>
            <Link
              to="/forgot-password"
              className="font-mono text-[10px] text-accent hover:text-accent/80"
            >
              Request new reset link →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // If already authenticated, redirect to dashboard
  if (success) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to reset password. The link may be invalid or expired.",
      );
    }
  }

  return (
    <>
    <PageMeta title="Reset Password — EXOSQUAD" noindex />
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
            RESET PASSWORD
          </p>
        </div>

        {/* Form */}
        <div className="glass-panel p-6">
          <p className="section-label mb-4">NEW PASSWORD</p>

          {success ? (
            <div className="space-y-4">
              <div className="rounded border border-status-live/30 bg-status-live/10 px-3 py-2 font-mono text-xs text-status-live">
                Password reset successfully. You can now sign in with your new
                password.
              </div>
              <div className="text-center">
                <Link
                  to="/login"
                  className="font-mono text-[10px] text-accent hover:text-accent/80"
                >
                  Proceed to sign in →
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

              <div>
                <label
                  htmlFor="reset-password"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
                >
                  New Password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label
                  htmlFor="reset-confirm"
                  className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-graphite-500"
                >
                  Confirm Password
                </label>
                <input
                  id="reset-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded bg-graphite-900 px-3 py-2 font-mono text-sm text-graphite-100 outline-none ring-1 ring-graphite-700 focus:ring-accent"
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded bg-accent/20 px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest text-accent ring-1 ring-accent/40 transition hover:bg-accent/30 disabled:opacity-50"
              >
                {isLoading ? "PROCESSING..." : "RESET PASSWORD"}
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
