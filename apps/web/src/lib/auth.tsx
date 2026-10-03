import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuthUser {
  userId: string;
  email: string;
  name: string;
  tenantId: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  isAuthResolved: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    tenantName: string,
    tenantSlug: string,
    name?: string,
  ) => Promise<void>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  isAuthenticated: boolean;
}

// ─── Token Management ───────────────────────────────────────────────────────

const TOKEN_KEY = "exosquad_token";
const USER_KEY = "exosquad_user";

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function storeSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ─── Context ────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthResolved, setIsAuthResolved] = useState(!getStoredToken());

  // Initial auth check on mount: if token exists but user doesn't, verify via /me
  useEffect(() => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      setIsAuthResolved(true);
      return;
    }

    let cancelled = false;

    fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${storedToken}` },
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data?.user) {
            const u = data.user as AuthUser;
            setUser(u);
            localStorage.setItem(USER_KEY, JSON.stringify(u));
          }
        } else {
          // Token invalid — clear session
          clearSession();
          setToken(null);
          setUser(null);
        }
        if (!cancelled) setIsAuthResolved(true);
      })
      .catch(() => {
        if (!cancelled) {
          // Network error — keep stored session, mark resolved
          setIsAuthResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string, tenantSlug: string) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, tenantSlug }),
        });

        if (!res.ok) {
          const body = await res
            .json()
            .catch(() => ({ error: { message: res.statusText } }));
          throw new Error(body.error?.message ?? "Login failed");
        }

        const data = await res.json();
        const newToken: string = data.token;
        // Decode user from JWT payload (middle segment)
        const payload = JSON.parse(atob(newToken.split(".")[1]!)) as Record<
          string,
          unknown
        >;
        const authUser: AuthUser = {
          userId:
            (payload.sub as string) ?? (payload.userId as string) ?? "",
          email: (payload.email as string) ?? email,
          name: (payload.name as string) ?? email,
          tenantId: (payload.tenantId as string) ?? "",
          role: (payload.role as string) ?? "member",
        };

        storeSession(newToken, authUser);
        setToken(newToken);
        setUser(authUser);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const signup = useCallback(
    async (
      email: string,
      password: string,
      tenantName: string,
      tenantSlug: string,
      name?: string,
    ) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/v1/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name, tenantName, tenantSlug }),
        });

        if (!res.ok) {
          const body = await res
            .json()
            .catch(() => ({ error: { message: res.statusText } }));
          throw new Error(body.error?.message ?? "Signup failed");
        }

        const data = await res.json();
        const newToken: string = data.token;
        const payload = JSON.parse(atob(newToken.split(".")[1]!)) as Record<
          string,
          unknown
        >;
        const authUser: AuthUser = {
          userId:
            (payload.sub as string) ?? (payload.userId as string) ?? "",
          email: (payload.email as string) ?? email,
          name: (payload.name as string) ?? name ?? email,
          tenantId: (payload.tenantId as string) ?? "",
          role: (payload.role as string) ?? "member",
        };

        storeSession(newToken, authUser);
        setToken(newToken);
        setUser(authUser);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: { message: res.statusText } }));
        throw new Error(body.error?.message ?? "Request failed");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resetPassword = useCallback(
    async (token: string, newPassword: string) => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/v1/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, newPassword }),
        });

        if (!res.ok) {
          const body = await res
            .json()
            .catch(() => ({ error: { message: res.statusText } }));
          throw new Error(body.error?.message ?? "Reset failed");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const value: AuthState = {
    token,
    user,
    isLoading,
    isAuthResolved,
    login,
    signup,
    logout,
    forgotPassword,
    resetPassword,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/** Get the current token for API calls (non-reactive). */
export function getToken(): string | null {
  return getStoredToken();
}
