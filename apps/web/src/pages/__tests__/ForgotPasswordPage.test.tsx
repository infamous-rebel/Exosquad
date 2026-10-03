import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils";
import { ForgotPasswordPage } from "../ForgotPasswordPage";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "unauthorized" } }),
    }),
  );
});

describe("ForgotPasswordPage", () => {
  it("renders forgot password form", () => {
    renderWithProviders(<ForgotPasswordPage />, {
      routerProps: { initialEntries: ["/forgot-password"] },
    });
    expect(screen.getByText("FORGOT PASSWORD")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("has request reset button", () => {
    renderWithProviders(<ForgotPasswordPage />, {
      routerProps: { initialEntries: ["/forgot-password"] },
    });
    expect(screen.getByRole("button", { name: /request reset/i })).toBeInTheDocument();
  });

  it("has link back to sign in", () => {
    renderWithProviders(<ForgotPasswordPage />, {
      routerProps: { initialEntries: ["/forgot-password"] },
    });
    expect(screen.getByText(/Back to sign in/i)).toBeInTheDocument();
  });
});
