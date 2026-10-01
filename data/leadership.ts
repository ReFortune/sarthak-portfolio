import type { Metric } from "./experience";

export type Leadership = {
  id: string;
  org: string;
  fullName?: string;
  role: string;
  place: string;
  coords: string;
  period: string;
  start: string;
  end: string;
  bullets: string[];
  metrics: Metric[];
  awards?: string[];
};

export const leadership: Leadership[] = [
  {
    id: "steel-bridge",
    org: "York University Steel Bridge",
    role: "President",
    place: "North York, ON",
    coords: "43.77° N  79.50° W",
    period: "Sep 2024 — May 2026",
    start: "2024-09",
    end: "2026-05",
    bullets: [
      "Led a 20-member multidisciplinary team through design, fabrication, integration, and testing of a 20 ft competition steel bridge, entered against engineering schools from across Canada at the national competition in Moncton, NB.",
      "Grew the team from 6 to 20 members and shifted funding from member donations to $35,000 in external sponsorships and industry collaborations.",
      "Introduced experimental triangular-truss members in place of the flat members used in traditional builds.",
    ],
    metrics: [
      { value: "20", label: "members led" },
      { value: "6 → 20", label: "team growth" },
      { value: "$35,000", label: "sponsorships & industry collaboration" },
      { value: "20 ft", label: "competition bridge" },
    ],
  },
  {
    id: "gnctr",
    org: "Great Northern Concrete Toboggan Race",
    fullName: "GNCTR",
    role: "Steering & Braking Lead",
    place: "North York, ON",
    coords: "43.77° N  79.50° W",
    period: "Sep 2024 — Feb 2025",
    start: "2024-09",
    end: "2025-02",
    bullets: [
      "Served as Steering and Braking Lead for GNCTR, designing and integrating the toboggan’s steering and braking systems in SolidWorks under dynamic load conditions.",
      "Design was carried over and reused by the following year’s team; team won Best New Team and Best Ski Design and was featured in a CP24 news segment.",
    ],
    metrics: [
      { value: "2", label: "awards won" },
      { value: "CP24", label: "news segment feature" },
    ],
    awards: ["Best New Team", "Best Ski Design"],
  },
  {
    id: "les",
    org: "Lassonde Engineering Society",
    fullName: "LES",
    role: "VP Student Life",
    place: "North York, ON",
    coords: "43.77° N  79.50° W",
    period: "Sep 2022 — Apr 2024",
    start: "2022-09",
    end: "2024-04",
    bullets: [],
    metrics: [],
  },
];
