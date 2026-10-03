import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../lib/auth";

export function ProtectedRoute() {
  const { isAuthenticated, isAuthResolved } = useAuth();

  // While auth is being resolved, show a loading state
  if (!isAuthResolved) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-graphite-950">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-6 w-6 animate-pulse rounded-full bg-accent/20" />
          <div className="h-2 w-32 animate-pulse rounded bg-graphite-800" />
          <div className="h-2 w-48 animate-pulse rounded bg-graphite-800" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
