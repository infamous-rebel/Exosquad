/**
 * Test utilities — render components with all required providers.
 */

import { type ReactElement, type ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";
import { AuthProvider } from "../lib/auth";

interface WrapperOptions {
  routerProps?: MemoryRouterProps;
  queryClientOverrides?: Record<string, unknown>;
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function createWrapper(options: WrapperOptions = {}) {
  const { routerProps } = options;
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter {...routerProps}>{children}</MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & WrapperOptions,
) {
  const { routerProps, queryClientOverrides, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: createWrapper({ routerProps, queryClientOverrides }),
    ...renderOptions,
  });
}

// Re-export everything from testing-library for convenience
export * from "@testing-library/react";
