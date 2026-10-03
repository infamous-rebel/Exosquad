import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../test/test-utils";
import { RegisterPage } from "../RegisterPage";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "unauthorized" } }),
    }),
  );
});

describe("RegisterPage", () => {
  it("renders registration form", () => {
    renderWithProviders(<RegisterPage />, {
      routerProps: { initialEntries: ["/register"] },
    });
    expect(screen.getByText("REGISTER")).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/tenant slug/i)).toBeInTheDocument();
  });

  it("has link to login page", () => {
    renderWithProviders(<RegisterPage />, {
      routerProps: { initialEntries: ["/register"] },
    });
    expect(screen.getByText(/Already have an account/i)).toBeInTheDocument();
  });

  it("has create account button", () => {
    renderWithProviders(<RegisterPage />, {
      routerProps: { initialEntries: ["/register"] },
    });
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("has organization name field", () => {
    renderWithProviders(<RegisterPage />, {
      routerProps: { initialEntries: ["/register"] },
    });
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument();
  });
});
