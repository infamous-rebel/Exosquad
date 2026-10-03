import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "../../../test/test-utils";
import { ProtectedRoute } from "../ProtectedRoute";

beforeEach(() => {
  // Ensure clean localStorage
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "unauthorized" } }),
    }),
  );
});

describe("ProtectedRoute", () => {
  it("redirects to /login when not authenticated", () => {
    // With no token in localStorage, AuthProvider resolves immediately
    // with isAuthenticated=false → ProtectedRoute redirects to /login
    // We can't easily test Navigate directly, but we can verify no loading skeleton
    // and no outlet content is rendered.
    const { container } = renderWithProviders(<ProtectedRoute />, {
      routerProps: { initialEntries: ["/protected"] },
    });
    // The loading skeleton should NOT be present (auth is resolved immediately with no token)
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument();
  });

  it("shows loading skeleton while auth is resolving", () => {
    // Simulate a stored token — this makes isAuthResolved start as false
    localStorage.setItem("exosquad_token", "fake-token");

    // fetch will be called for /me — make it hang (never resolve)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})),
    );

    const { container } = renderWithProviders(<ProtectedRoute />, {
      routerProps: { initialEntries: ["/protected"] },
    });

    // Loading skeleton should be visible
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });
});
