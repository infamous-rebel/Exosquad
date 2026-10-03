import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // === BASE CANVAS ===
        graphite: {
          950: "#06080a", // deepest canvas
          900: "#0a0e12", // app background
          850: "#0f1419", // panel backgrounds
          800: "#141b22", // elevated panels
          750: "#1a2230", // hover states
          700: "#212d3d", // borders
          600: "#2a3a4e", // subtle borders
          500: "#3a4f68", // muted text
          400: "#5a7a9e", // secondary text
          300: "#8aa4be", // tertiary text
          200: "#b8cfe0", // light text
          100: "#dce8f0", // near-white text
          50: "#eef4f8", // white text
        },
        // === GLASS SURFACES ===
        glass: {
          DEFAULT: "rgba(15, 20, 25, 0.72)",
          light: "rgba(20, 27, 34, 0.60)",
          lighter: "rgba(26, 34, 48, 0.48)",
          border: "rgba(42, 58, 78, 0.50)",
          borderLight: "rgba(58, 79, 104, 0.35)",
        },
        // === SEMANTIC ACCENTS ===
        accent: {
          DEFAULT: "#4fc3f7", // primary accent (ice blue)
          dim: "rgba(79, 195, 247, 0.15)",
          glow: "rgba(79, 195, 247, 0.08)",
        },
        status: {
          live: "#26c281", // green — live/active
          updated: "#4fc3f7", // blue — recently updated
          changed: "#ffa726", // amber — changed
          stale: "#78909c", // grey — stale
          failed: "#ef5350", // red — failed
          nodata: "#546e7a", // blue-grey — no data
        },
        demand: {
          high: "#26c281",
          medium: "#ffa726",
          low: "#ef5350",
        },
        risk: {
          low: "#26c281",
          medium: "#ffa726",
          high: "#ef5350",
          critical: "#ff1744",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "'SF Mono'", "Menlo", "monospace"],
        sans: ["'Inter'", "'SF Pro Display'", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.75rem", letterSpacing: "0.02em" }],
        xs: ["0.6875rem", { lineHeight: "0.875rem", letterSpacing: "0.01em" }],
        "data-lg": ["1.25rem", { lineHeight: "1.5rem", letterSpacing: "-0.01em" }],
        "data-xl": ["1.5rem", { lineHeight: "1.75rem", letterSpacing: "-0.02em" }],
        "data-2xl": ["2rem", { lineHeight: "2.25rem", letterSpacing: "-0.02em" }],
      },
      spacing: {
        "0.5": "0.125rem",
        "1.5": "0.375rem",
        "2.5": "0.625rem",
        "3.5": "0.875rem",
        "4.5": "1.125rem",
        "5.5": "1.375rem",
        "7": "1.75rem",
        "9": "2.25rem",
        "11": "2.75rem",
        "13": "3.25rem",
        "15": "3.75rem",
        "18": "4.5rem",
        "22": "5.5rem",
        "26": "6.5rem",
        "30": "7.5rem",
      },
      borderRadius: {
        "2xs": "0.125rem",
        xs: "0.25rem",
        sm: "0.375rem",
      },
      borderWidth: {
        "0.5": "0.5px",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-live": "pulse-live 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fade-in 0.15s ease-out",
        "slide-up": "slide-up 0.2s ease-out",
      },
      keyframes: {
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
