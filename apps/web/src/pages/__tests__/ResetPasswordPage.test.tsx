import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils";
import { ResetPasswordPage } from "../ResetPasswordPage";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "unauthorized" } }),
    }),
  );
});

describe("ResetPasswordPage", () => {
  it("shows error when no token provided", () => {
    renderWithProviders(<ResetPasswordPage />, {
      routerProps: { initialEntries: ["/reset-password"] },
    });
    expect(screen.getByText(/No reset token provided/i)).toBeInTheDocument();
  });

  it("renders password form when token is present", () => {
    renderWithProviders(<ResetPasswordPage />, {
      routerProps: { initialEntries: ["/reset-password?token=abc123"] },
    });
    expect(screen.getByText("NEW PASSWORD")).toBeInTheDocument();
    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("has reset password button", () => {
    renderWithProviders(<ResetPasswordPage />, {
      routerProps: { initialEntries: ["/reset-password?token=abc123"] },
    });
    expect(screen.getByRole("button", { name: /reset password/i })).toBeInTheDocument();
  });

  it("has link back to sign in", () => {
    renderWithProviders(<ResetPasswordPage />, {
      routerProps: { initialEntries: ["/reset-password?token=abc123"] },
    });
    expect(screen.getByText(/Back to sign in/i)).toBeInTheDocument();
  });
});
