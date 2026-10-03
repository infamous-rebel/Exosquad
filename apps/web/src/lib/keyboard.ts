/**
 * Keyboard shortcut hooks for terminal-style navigation.
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * useShortcut — register a keyboard shortcut.
 * Supports single keys and two-key sequences (e.g., 'g' then 'd').
 */
export function useShortcut(
  keys: string | string[],
  callback: () => void,
  options?: { enabled?: boolean; ignoreInput?: boolean },
) {
  const { enabled = true, ignoreInput = true } = options ?? {};
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (ignoreInput && e.target instanceof HTMLInputElement) return;
      if (ignoreInput && e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      const keyList = Array.isArray(keys) ? keys : [keys];

      if (keyList.includes(key)) {
        e.preventDefault();
        callbackRef.current();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keys, enabled, ignoreInput]);
}

/**
 * useGoShortcut — two-key sequence: 'g' then a second key navigates.
 */
export function useGoShortcut() {
  const navigate = useNavigate();
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();

      if (pendingRef.current) {
        clearTimeout(timerRef.current);
        pendingRef.current = false;

        switch (key) {
          case "d": navigate("/dashboard"); break;
          case "p": navigate("/products"); break;
          case "m": navigate("/market"); break;
          case "s": navigate("/sourcing"); break;
          case "r": navigate("/research"); break;
          case "e": navigate("/evidence"); break;
          case "l": navigate("/logistics"); break;
          case "o": navigate("/outreach"); break;
          case "c": navigate("/competition"); break;
        }
        return;
      }

      if (key === "g") {
        pendingRef.current = true;
        timerRef.current = setTimeout(() => { pendingRef.current = false; }, 1000);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}

/**
 * useSearchShortcut — '/' or Cmd+K opens search.
 */
export function useSearchShortcut() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k")) {
        e.preventDefault();
        window.dispatchEvent(new Event("open-search"));
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

/**
 * useEscShortcut — ESC closes panels/modals.
 */
export function useEscShortcut(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        callbackRef.current();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
