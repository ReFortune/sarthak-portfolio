import type { Config } from "tailwindcss";

/** Colour tokens are CSS variables (see app/globals.css) so alpha modifiers like `bg-ink/60` keep working. */
const channel = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: channel("ink"), 2: channel("ink-2"), 3: channel("ink-3"), 4: channel("ink-4") },
        bone: { DEFAULT: channel("bone"), dim: channel("bone-dim"), mute: channel("bone-mute") },
        laser: channel("laser"),
        ice: channel("ice"),
        paper: channel("paper"),
        rule: "rgb(var(--bone) / 0.14)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-display)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Fluid display scale — big type is a structural element on this site
        "d-xs": ["clamp(1.5rem, 2.4vw, 2.25rem)", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        "d-sm": ["clamp(2rem, 4vw, 3.75rem)", { lineHeight: "1.02", letterSpacing: "-0.025em" }],
        "d-md": ["clamp(2.75rem, 6.6vw, 7rem)", { lineHeight: "0.96", letterSpacing: "-0.03em" }],
        "d-lg": ["clamp(3.5rem, 10vw, 11rem)", { lineHeight: "0.9", letterSpacing: "-0.035em" }],
        "d-xl": ["clamp(3.25rem, 13.4vw, 17rem)", { lineHeight: "0.86", letterSpacing: "-0.04em" }],
      },
      letterSpacing: { label: "0.14em" },
      transitionTimingFunction: {
        out: "cubic-bezier(.16,1,.3,1)",
        io: "cubic-bezier(.76,0,.24,1)",
      },
      screens: { xs: "480px" },
    },
  },
  plugins: [],
};
export default config;
