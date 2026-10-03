# Phase 17 — Landing Page + Product/Auth Experience

## Overview

Phase 17 transforms the EXOSQUAD product entry experience from a minimal landing page and combined login/signup into a comprehensive, evidence-first product intelligence gateway with:

- **Expanded landing page** — 9 sections showcasing the full intelligence workflow
- **Separate auth pages** — Login, Register, Forgot Password, Reset Password
- **Password reset flow** — SHA-256 hashed tokens, enumeration-safe responses
- **Onboarding flow** — 4-step workspace configuration saving to Tenant.config
- **SEO & meta tags** — Lightweight PageMeta component
- **Enhanced user menu** — Tenant info in TopBar dropdown
- **Responsive design** — Mobile-first across all new pages

Phase 17 does NOT:
- Modify Phase 16 terminal (TerminalShell, NavigationRail, domain pages)
- Add fabricated data or testimonials
- Introduce new color tokens (uses existing graphite/glass/accent system)
- Create a separate Workspace model (Tenant.config is used)

---

## Architecture

### Route Structure

```
/                    → Landing page (9 sections, public)
/login               → Sign in (public)
/register            → Sign up (public)
/forgot-password     → Password recovery request (public)
/reset-password      → Password reset with token (public)
/onboarding          → Multi-step workspace setup (protected)
/dashboard           → Dashboard (existing, protected)
/products, /market…  → Terminal pages (existing, protected)
```

### Password Reset Flow

```
User enters email → POST /api/v1/auth/forgot-password
    │
    ▼
crypto.randomBytes(32) → raw token
    │
    ▼
SHA-256(raw token) → stored hash + 15 min expiry
    │
    ▼
Return { success: true } always (enumeration-safe)
    │
    ▼
User clicks link → POST /api/v1/auth/reset-password { token, newPassword }
    │
    ▼
SHA-256(incoming token) → compare stored hash → check expiry
    │
    ▼
bcrypt(newPassword, 12 rounds) → update user → clear token fields
```

### Onboarding Flow

```
4-Step Form → POST /api/v1/auth/onboarding
    │
    ├─ Step 1: Business Profile (name, role)
    ├─ Step 2: Market Focus (market, categories)
    ├─ Step 3: Sourcing Preferences (regions, budget)
    └─ Step 4: Objective (goal selection/description)
    │
    ▼
Tenant.config = { ...existingConfig, ...onboardingData }
(merge, not overwrite; tenantId from JWT only)
    │
    ▼
Redirect → /dashboard
```

---

## Files Modified/Created

### Backend

| File | Change |
|------|--------|
| `packages/database/prisma/schema.prisma` | Added `passwordResetToken`, `passwordResetExpiry` to User |
| `packages/database/prisma/migrations/20261003020000_phase17_password_reset/migration.sql` | New migration |
| `apps/api/src/services/auth.ts` | Added `requestPasswordReset`, `resetPassword`, `updateOnboarding` |
| `apps/api/src/routes/auth.ts` | Added forgot-password, reset-password, onboarding endpoints |

### Frontend

| File | Change |
|------|--------|
| `apps/web/src/lib/auth.tsx` | Complete rewrite: `isAuthResolved`, `forgotPassword`, `resetPassword` |
| `apps/web/src/components/auth/ProtectedRoute.tsx` | Loading skeleton while auth resolving |
| `apps/web/src/pages/LoginPage.tsx` | Rewritten: sign-in only + PageMeta |
| `apps/web/src/pages/RegisterPage.tsx` | New: registration form |
| `apps/web/src/pages/ForgotPasswordPage.tsx` | New: password recovery request |
| `apps/web/src/pages/ResetPasswordPage.tsx` | New: password reset with token |
| `apps/web/src/pages/OnboardingPage.tsx` | New: 4-step onboarding form |
| `apps/web/src/pages/LandingPage.tsx` | Major rewrite: 9 sections (~413 lines) |
| `apps/web/src/components/seo/PageMeta.tsx` | New: lightweight SEO meta manager |
| `apps/web/src/components/layout/TopBar.tsx` | Workspace menu item, Sign Out rename |
| `apps/web/src/App.tsx` | New routes for all auth pages + onboarding |

### Tests

| File | Tests |
|------|-------|
| `LandingPage.test.tsx` | 6 tests |
| `LoginPage.test.tsx` | 4 tests |
| `RegisterPage.test.tsx` | 4 tests |
| `ForgotPasswordPage.test.tsx` | 3 tests |
| `ResetPasswordPage.test.tsx` | 4 tests |
| `OnboardingPage.test.tsx` | 5 tests |
| `ProtectedRoute.test.tsx` | 2 tests |

---

## Security Design

### Password Reset Tokens
- **Never stored in plaintext** — SHA-256 hash of `crypto.randomBytes(32)` stored in DB
- **15-minute expiry** — tokens expire automatically
- **Single-use** — token fields cleared after successful reset
- **Prior token invalidation** — new request overwrites any existing token
- **Enumeration-safe** — API always returns `{ success: true }` regardless of email existence

### Onboarding
- **Tenant ID from JWT only** — never from client input
- **Zod validation** — all inputs validated server-side
- **Merge semantics** — preserves existing Tenant.config fields

---

## Design System Compliance

All new pages use existing design tokens:
- `bg-graphite-950`, `bg-graphite-900`, `text-graphite-100/300/500`
- `bg-accent/20`, `text-accent`, `ring-accent/40`
- `glass-panel` class for form containers
- `font-mono` for labels, `tracking-widest` for section labels
- `section-label` class for consistent section headers
- No new colors introduced

---

## Key Constraints Preserved

- Phase 16 terminal untouched (no TerminalShell/NavigationRail/domain page changes)
- No fabricated data, testimonials, or fake metrics
- No Workspace model — Tenant.config used for onboarding
- SHA-256 hashed reset tokens (never plaintext)
- Tenant ID from JWT only (never client-provided)
- All inputs Zod-validated on backend
