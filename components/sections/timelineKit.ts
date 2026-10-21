import type { TimelineKind } from "@/data/timeline";

/** The geometry and the colours of the timeline, shared by the long-form page and the home page's instrument panel. */
export const D0 = 2021.5;
export const D1 = 2027.5;
export const SPAN = D1 - D0;
export const YEARS = [2022, 2023, 2024, 2025, 2026, 2027];
export const NOW_FALLBACK = 2026.75;

export const kindStyle: Record<TimelineKind, { bar: string; label: string }> = {
  education: { bar: "bg-bone/15 border border-bone/40", label: "Education" },
  work: { bar: "bg-laser", label: "Internship" },
  project: { bar: "bg-ice", label: "Project" },
  leadership: { bar: "bg-bone/80", label: "Leadership" },
  research: { bar: "bg-ice", label: "Research" },
};

export const pct = (y: number) => `${(((y - D0) / SPAN) * 100).toFixed(3)}%`;
export const fmt = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

/** The year a day falls in, as a fraction of it; clamped to the end of the axis. */
export const nowYear = () => {
  const d = new Date();
  return Math.min(D1 - 0.05, d.getFullYear() + d.getMonth() / 12 + d.getDate() / 365);
};
