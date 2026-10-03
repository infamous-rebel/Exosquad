import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils";
import { LoginPage } from "../LoginPage";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "unauthorized" } }),
    }),
  );
});

describe("LoginPage", () => {
  it("renders sign in form", () => {
    renderWithProviders(<LoginPage />, {
      routerProps: { initialEntries: ["/login"] },
    });
    expect(screen.getByText("SIGN IN")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tenant slug/i)).toBeInTheDocument();
  });

  it("has link to register page", () => {
    renderWithProviders(<LoginPage />, {
      routerProps: { initialEntries: ["/login"] },
    });
    expect(screen.getByText(/No account\? Register/i)).toBeInTheDocument();
  });

  it("has link to forgot password", () => {
    renderWithProviders(<LoginPage />, {
      routerProps: { initialEntries: ["/login"] },
    });
    expect(screen.getByText(/Forgot password/i)).toBeInTheDocument();
  });

  it("has authenticate button", () => {
    renderWithProviders(<LoginPage />, {
      routerProps: { initialEntries: ["/login"] },
    });
    expect(screen.getByRole("button", { name: /authenticate/i })).toBeInTheDocument();
  });
});
