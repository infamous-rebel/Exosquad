import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { TerminalShell } from "./components/layout/TerminalShell";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductDiscoveryPage } from "./pages/ProductDiscoveryPage";
import { ProductDetailPage } from "./pages/ProductDetailPage";

// Lazy-loaded pages for code splitting
const OnboardingPage = lazy(() =>
  import("./pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage })),
);
const MarketPage = lazy(() =>
  import("./pages/MarketPage").then((m) => ({ default: m.MarketPage })),
);
const DemandPage = lazy(() =>
  import("./pages/DemandPage").then((m) => ({ default: m.DemandPage })),
);
const SupplyPage = lazy(() =>
  import("./pages/SupplyPage").then((m) => ({ default: m.SupplyPage })),
);
const SourcingPage = lazy(() =>
  import("./pages/SourcingPage").then((m) => ({ default: m.SourcingPage })),
);
const LogisticsPage = lazy(() =>
  import("./pages/LogisticsPage").then((m) => ({ default: m.LogisticsPage })),
);
const EconomicsPage = lazy(() =>
  import("./pages/EconomicsPage").then((m) => ({ default: m.EconomicsPage })),
);
const ResearchPage = lazy(() =>
  import("./pages/ResearchPage").then((m) => ({ default: m.ResearchPage })),
);
const OutreachPage = lazy(() =>
  import("./pages/OutreachPage").then((m) => ({ default: m.OutreachPage })),
);
const EvidencePage = lazy(() =>
  import("./pages/EvidencePage").then((m) => ({ default: m.EvidencePage })),
);
const CompetitionPage = lazy(() =>
  import("./pages/CompetitionPage").then((m) => ({ default: m.CompetitionPage })),
);

function PageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="space-y-3">
        <div className="h-3 w-32 animate-pulse rounded bg-graphite-800" />
        <div className="h-2 w-48 animate-pulse rounded bg-graphite-800" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected routes — onboarding */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
        </Route>

        {/* Protected terminal routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<TerminalShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/products" element={<ProductDiscoveryPage />} />
            <Route path="/products/:productId" element={<ProductDetailPage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/demand" element={<DemandPage />} />
            <Route path="/supply" element={<SupplyPage />} />
            <Route path="/sourcing" element={<SourcingPage />} />
            <Route path="/logistics" element={<LogisticsPage />} />
            <Route path="/economics" element={<EconomicsPage />} />
            <Route path="/research" element={<ResearchPage />} />
            <Route path="/competition" element={<CompetitionPage />} />
            <Route path="/outreach" element={<OutreachPage />} />
            <Route path="/evidence" element={<EvidencePage />} />
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
