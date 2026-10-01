import type { Metric } from "./experience";

export type VisualKind = "nova" | "route" | "oscar" | "sparrow" | "chiron";

export type Project = {
  slug: string;
  n: string;
  code: string;
  name: string;
  kind: string;
  org: string;
  period: string;
  start: string;
  end: string | null;
  role: string;
  team: string;
  status: "Completed" | "Active";
  summary: string;
  /** Résumé bullets, faithful to the source. */
  bullets: string[];
  metrics: Metric[];
  tags: string[];
  visual: VisualKind;
  /** Only projects with supporting documents get a dedicated case-study page. */
  caseStudy: boolean;
};

export const projects: Project[] = [
  {
    slug: "nova-payload",
    n: "01",
    code: "NOVA",
    name: "Night-Optical and Visibility Assessment",
    kind: "Stratospheric balloon payload",
    org: "Canadian Space Agency (CSA)",
    period: "Sep 2024 — Aug 2025",
    start: "2024-09",
    end: "2025-08",
    role: "Project & Systems Lead",
    team: "6-person capstone team",
    status: "Completed",
    summary:
      "A secondary payload built to a sub-500 g mass allocation and flown on the Canadian Space Agency’s RSOnar III stratospheric balloon to measure night-sky brightness and support resident-space-object detection at 40 km altitude.",
    bullets: [
      "Led a 6-person capstone team as Project and Systems Lead on NOVA, a secondary payload built to a sub-500 g mass allocation and flown on the Canadian Space Agency’s RSOnar III stratospheric balloon to measure night-sky brightness and support resident-space-object detection at 40 km altitude.",
      "Owned the systems interface to the RSOnar III project manager and the payload’s requirements-to-verification traceability, mapping every mechanical, electrical, computational, and environmental requirement to a named test procedure across six subsystems.",
      "Qualified the Aluminum 6061 structure and 45° camera mount through random-vibration FEM across a 0–2000 Hz PSD profile and a 10 G load case, holding displacement under 0.1 mm and strain within the 8% aluminum limit.",
      "Brought avionics power draw within the 4 W budget by disabling unused BeagleBone Black Industrial peripherals and retuning exposure rates, holding 3.7 W peak at 5 V over >15 h continuous operation with zero image-data loss.",
    ],
    metrics: [
      { value: "<500 g", label: "mass allocation" },
      { value: "40 km", label: "flight altitude" },
      { value: "3.7 W", label: "peak draw · 4 W budget" },
      { value: "6", label: "subsystems traced" },
    ],
    tags: ["Systems engineering", "Requirements traceability", "FEM", "Aluminum 6061", "BeagleBone Black"],
    visual: "nova",
    caseStudy: true,
  },
  {
    slug: "route-m",
    n: "02",
    code: "ROUTE-M",
    name: "Reconnaissance Orbital Utility for Terrain Exploration",
    kind: "Mars orbital imaging mission",
    org: "Space Mission Design · York University",
    period: "Jan 2026 — Apr 2026",
    start: "2026-01",
    end: "2026-04",
    role: "Systems & Payload Lead",
    team: "ESSE 4361",
    status: "Completed",
    summary:
      "A Mars-orbiting high-definition imaging mission, taken through the NASA project lifecycle to Critical Design Review: a two-satellite stereo constellation mapping the full Martian surface at 1 m or better.",
    bullets: [
      "Served as Systems and Payload Lead for a Mars-orbiting high-definition imaging mission, developed through the NASA project lifecycle to Critical Design Review (CDR).",
      "Led mission architecture and payload selection for a stereo-imaging system delivering 1 m or better ground sample distance from a 300 km Sun-Synchronous Orbit around Mars.",
      "Resolved the mission-lifetime versus constellation-size trade by selecting a 2-satellite stereo constellation covering the full Martian surface across a 7-year design life.",
      "Supported mission-level mass (45 kg payload), power (120 W peak), cost, and risk assessments within a $750M USD theoretical mission budget.",
    ],
    metrics: [
      { value: "≤ 1 m", label: "ground sample distance" },
      { value: "300 km", label: "sun-synchronous orbit" },
      { value: "2", label: "satellite constellation" },
      { value: "7 yr", label: "design life" },
    ],
    tags: ["Mission architecture", "Trade studies", "Payload selection", "STK", "NASA lifecycle"],
    visual: "route",
    caseStudy: true,
  },
  {
    slug: "oscar",
    n: "03",
    code: "OSCAR",
    name: "Ocean Spectroscopy for Carbon and Algal Risk",
    kind: "Ocean-colour spectroscopy mission",
    org: "Space Mission Design · York University",
    period: "Jan 2026 — Apr 2026",
    start: "2026-01",
    end: "2026-04",
    role: "Project Lead & Payload Lead",
    team: "5-person team",
    status: "Completed",
    summary:
      "A space-based ocean spectroscopy mission that quantifies algal biomass from orbit to support ocean-health and global-temperature monitoring, taken through the NASA project lifecycle to Critical Design Review.",
    bullets: [
      "Led a 5-person team as overall project lead and payload lead for a space-based ocean spectroscopy mission taken through the NASA project lifecycle to Critical Design Review (CDR).",
      "Led payload architecture, instrument selection, and interface definition for spectrometer-based measurement of algal formation and ocean health indicators.",
      "Conducted trade studies on spectrometer configurations, orbital considerations, and data quality under mission constraints.",
      "Resolved the measurement-approach trade by selecting spectroscopic quantification of algal biomass to support ocean-health and global-temperature monitoring goals, delivering a mission design ready to proceed to CDR.",
    ],
    metrics: [
      { value: "5", label: "person team led" },
      { value: "CDR", label: "NASA lifecycle milestone" },
      { value: "3", label: "trade-study axes" },
    ],
    tags: ["Spectroscopy", "Payload architecture", "Interface definition", "Trade studies"],
    visual: "oscar",
    caseStudy: false,
  },
  {
    slug: "sparrow",
    n: "04",
    code: "SPARROW",
    name: "Sparrow — Autonomous Rover Research Platform",
    kind: "Reconfigurable 1:10-scale rover test platform",
    org: "Canadian Space Agency / York University",
    period: "Sep 2026 — Present",
    start: "2026-09",
    end: null,
    role: "Team Lead",
    team: "9-person team",
    status: "Active",
    summary:
      "A reconfigurable 1:10-scale wheeled rover test platform for the Canadian Space Agency, aiming at a fraction of what commercial platforms cost, with a single interface that accepts LiDAR, stereo or monocular cameras.",
    bullets: [
      "Lead a 9-person team across mechanical, software, and electrical subsystems to build Sparrow, a reconfigurable 1:10-scale wheeled rover test platform for the Canadian Space Agency, targeting a build cost near $1,500 against commercial platforms such as the Warthog costing many times more.",
      "Architected a sensor-agnostic interface supporting LiDAR, stereo camera, and monocular camera integration without platform modification, enabling rapid sensor swaps across test campaigns.",
    ],
    metrics: [
      { value: "9", label: "engineers led" },
      { value: "1:10", label: "scale wheeled platform" },
      { value: "≈ $1,500", label: "target build cost" },
      { value: "3", label: "sensor types, zero platform changes" },
    ],
    tags: ["Rover", "Sensor-agnostic interface", "LiDAR", "Stereo vision", "Team lead"],
    visual: "sparrow",
    caseStudy: false,
  },
  {
    slug: "hospital-dispensing-robot",
    n: "05",
    code: "CHIRON",
    name: "Hospital Medicinal Dispensing Robot",
    kind: "Autonomous medication-delivery robot",
    org: "Mechatronics · York University",
    period: "Jan 2026 — Apr 2026",
    start: "2026-01",
    end: "2026-04",
    role: "Mechanical & Electro-mechanical Lead",
    team: "3-person team",
    status: "Completed",
    summary:
      "An autonomous robot designed to follow hospital corridors and deliver the right pill box to the right room. I led the mechanical design and electro-mechanical integration, all inside a $300 project budget.",
    bullets: [
      "Led mechanical design and electro-mechanical integration on a 3-person autonomous medicinal dispensing robot, covering component mounting, enclosure design, and interface definition to the ESP32 microcontroller subsystem.",
      "Delivered the mechanical and electro-mechanical build within a $300 total project budget.",
    ],
    metrics: [
      { value: "$300", label: "total project budget" },
      { value: "3", label: "person team" },
      { value: "ESP32", label: "controller subsystem" },
    ],
    tags: ["Mechatronics", "Electro-mechanical design", "Enclosure design", "ESP32", "3D printing"],
    visual: "chiron",
    caseStudy: true,
  },
];

export const getProject = (slug: string) => projects.find((p) => p.slug === slug);
