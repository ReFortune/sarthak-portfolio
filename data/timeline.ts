import { projects } from "./projects";
import { experience } from "./experience";
import { leadership } from "./leadership";
import { education } from "./education";

export type TimelineKind = "education" | "work" | "project" | "leadership" | "research";

export type TimelineRow = {
  id: string;
  label: string;
  sub: string;
  kind: TimelineKind;
  start: string; // YYYY-MM
  end: string | null; // null = ongoing
  /** Section the row links to on the home page. */
  href: string;
};

/** Single source for the Gantt — derived from the other data files so dates can never drift. */
const rows: TimelineRow[] = [
  {
    id: "edu",
    label: "B.Eng. Space Engineering",
    sub: "York University",
    kind: "education",
    start: education.start,
    end: education.end,
    href: "#profile",
  },
  ...experience.map(
    (e): TimelineRow => ({ id: e.id, label: e.org, sub: e.role, kind: "work", start: e.start, end: e.end, href: "#experience" })
  ),
  ...leadership.map(
    (l): TimelineRow => ({ id: l.id, label: l.fullName ?? l.org, sub: l.role, kind: "leadership", start: l.start, end: l.end, href: "#leadership" })
  ),
  {
    id: "hat-p-18b",
    label: "HAT-P-18 b transit",
    sub: "Research project",
    kind: "research",
    start: "2024-11",
    end: "2024-11",
    href: "#research",
  },
  ...projects.map(
    (p): TimelineRow => ({ id: p.slug, label: p.code, sub: p.role, kind: "project", start: p.start, end: p.end, href: "#projects" })
  ),
];

export const timeline: TimelineRow[] = rows.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
