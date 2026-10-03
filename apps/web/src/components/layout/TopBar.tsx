import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { StatusIndicator } from "../ui/StatusIndicator";

interface TopBarProps {
  onSearchOpen?: () => void;
}

export function TopBar({ onSearchOpen }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [menuOpen]);

  // Keyboard shortcut: Cmd/Ctrl+K to open search dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onSearchOpen?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSearchOpen]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="flex h-11 items-center border-b border-glass-border bg-graphite-950/80 px-4 backdrop-blur-xs">
      {/* Command Search — triggers dialog */}
      <div className="flex flex-1 items-center">
        <button
          onClick={onSearchOpen}
          className="neu-control flex w-full max-w-xl items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-graphite-800/50"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-graphite-500">
            <circle cx="7" cy="7" r="5" />
            <path d="M11 11l3 3" strokeLinecap="round" />
          </svg>
          <span className="text-xs text-graphite-500">Search products, evidence, research...</span>
          <kbd className="terminal-text ml-auto rounded-2xs border border-graphite-700 px-1.5 py-0.5 text-2xs text-graphite-500">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right side */}
      <div className="ml-4 flex items-center gap-3">
        {/* Region selector */}
        <button className="neu-control flex items-center gap-1.5 px-2.5 py-1 text-xs text-graphite-200 transition-colors hover:text-graphite-50">
          <span className="text-sm">🇧🇩</span>
          <span>Bangladesh</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 4l2 2 2-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Status */}
        <StatusIndicator status="live" timestamp={new Date()} />

        {/* User menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="neu-control flex items-center gap-1.5 px-2.5 py-1 text-xs text-graphite-200 transition-colors hover:text-graphite-50"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 font-mono text-[9px] font-bold text-accent">
              {(user?.name ?? user?.email ?? "?").charAt(0).toUpperCase()}
            </div>
            <span className="max-w-20 truncate">{user?.name ?? user?.email ?? "User"}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded border border-graphite-800 bg-graphite-900 py-1 shadow-xl">
              <div className="border-b border-graphite-800 px-3 py-2">
                <p className="font-mono text-xs text-graphite-200">{user?.name ?? "User"}</p>
                <p className="font-mono text-[10px] text-graphite-500">{user?.email}</p>
              </div>
              <button
                onClick={() => { navigate("/dashboard"); setMenuOpen(false); }}
                className="w-full px-3 py-1.5 text-left font-mono text-xs text-graphite-300 hover:bg-graphite-800"
              >
                Dashboard
              </button>
              <button
                onClick={() => { navigate("/dashboard"); setMenuOpen(false); }}
                className="w-full border-t border-graphite-800 px-3 py-1.5 text-left font-mono text-xs text-graphite-400 hover:bg-graphite-800"
              >
                Workspace
              </button>
              <button
                onClick={handleLogout}
                className="w-full border-t border-graphite-800 px-3 py-1.5 text-left font-mono text-xs text-status-failed hover:bg-graphite-800"
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
