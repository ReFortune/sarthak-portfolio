import type { VisualKind } from "./projects";

export type Metric = { value: string; label: string };

export type Finding = {
  title: string;
  /** Résumé bullet, kept faithful to the source. (The mission-planning findings are not on the September 2026 résumé yet; they describe the work in general terms.) */
  body: string;
  metrics?: Metric[];
  /** Short focus-area chips, for findings without a bespoke figure. */
  tags?: string[];
  /** One line under the figure. */
  note?: string;
};

/** How one project of an internship introduces itself: its name, a display heading and a line of context. */
export type ProjectIntro = {
  /** Plain name, e.g. "Mission planning". */
  label: string;
  title: string;
  /** The word in the title set in the serif italic. */
  accent: string;
  lede: string;
};

/** A further project of the same role, shown after the main findings with its own heading, findings and demo. */
export type Stream = ProjectIntro & {
  id: string;
  findings: Finding[];
  /** An interactive instrument shown below the findings. */
  demo?: { id: string; kind: VisualKind; eyebrow: string; title: string; accent: string; lede: string; frameLabel: string };
  link?: { href: string; label: string; code: string };
};

export type Experience = {
  id: string;
  org: string;
  role: string;
  type: string;
  period: string;
  start: string; // YYYY-MM
  end: string | null; // null = present
  current?: boolean;
  /** Introduction of the project the main `findings` belong to. Only needed when `streams` is set. */
  primary?: ProjectIntro;
  findings: Finding[];
  streams?: Stream[];
};

export const experience: Experience[] = [
  {
    id: "csa",
    org: "Canadian Space Agency",
    role: "Student Systems Engineering Intern",
    type: "Internship",
    period: "May 2026 — Present",
    start: "2026-05",
    end: null,
    current: true,
    primary: {
      label: "LiDAR surface mapping",
      title: "Map the",
      accent: "surface",
      lede: "Characterising a LiDAR sensor, defining the scan for surface mapping, and building the measurement chain in-house.",
    },
    findings: [
      {
        title: "Characterise the sensor",
        body: "Processed and analyzed SICK LMS111-10100 LiDAR point clouds in Python, characterizing 1 cm ranging accuracy and a 3 cm minimum detectable obstacle height across a 20 m maximum scan range to support a TRL increase for off-world navigation and landing.",
        metrics: [
          { value: "1 cm", label: "ranging accuracy" },
          { value: "3 cm", label: "min. detectable obstacle" },
          { value: "20 m", label: "max. scan range" },
        ],
      },
      {
        title: "Define the scan",
        body: "Defined pushbroom LiDAR surface-mapping configurations for NASA’s Artemis 4 by trading 25 Hz and 50 Hz scan rates against 0.25° and 0.5° angular increments across varied pitch angles and traverse speeds.",
        metrics: [
          { value: "25 | 50 Hz", label: "scan rates traded" },
          { value: "0.25° | 0.5°", label: "angular increments" },
        ],
      },
      {
        title: "Own the chain",
        body: "Ability to replace a contracted third-party scanning service by building the in-house LiDAR measurement chain end to end — scanning module, Python processing pipeline, and point-cloud viewer.",
      },
    ],
    streams: [
      {
        id: "planning",
        label: "Mission planning",
        title: "Plan the",
        accent: "drive",
        lede: "A separate project within the internship: rover mission planning, in a team of three. The others worked on the existing software; I built a new tool alongside it.",
        findings: [
          {
            title: "Build a new tool",
            body: "Built a new rover mission-planning tool alongside the team’s legacy software, designed to run on any laptop, low-spec ones included.",
            metrics: [
              { value: "3", label: "person team" },
              { value: "Any", label: "laptop, low-spec included" },
            ],
          },
          {
            title: "Own the front end",
            body: "Designed and built the interface of the new tool: what a planner sees and touches when setting up a plan and checking it.",
            tags: ["Front end", "Interface design"],
            note: "What a planner sees and touches.",
          },
          {
            title: "Look beyond the usual",
            body: "Explored unconventional ways of implementing path planning, rather than only the conventional ones.",
            tags: ["Path planning", "Unconventional methods"],
            note: "Beyond the usual approaches.",
          },
        ],
        demo: {
          id: "mission-planner",
          kind: "planner",
          eyebrow: "Interactive · illustrative",
          title: "Fastest or",
          accent: "safest",
          lede: "Drag A and B, switch between Fastest and Safest, or close ground off with a keep-out zone. It is an original demo on made-up terrain, not CSA software or data.",
          frameLabel: "Illustrative demo · MPT",
        },
        link: { href: "/projects/mission-planning-tool", label: "Read the MPT case study", code: "MPT" },
      },
    ],
  },
  {
    id: "wonderland",
    org: "Canada’s Wonderland",
    role: "Rides Mechanical Intern",
    type: "Internship",
    period: "Apr 2023 — Jan 2024",
    start: "2023-04",
    end: "2024-01",
    findings: [
      {
        title: "Keep it running",
        body: "Kept two roller coasters, Dragon Fyre and Leviathan, in safe continuous operation across 8 months through structural integrity assessments, root-cause failure analysis, and preventive mechanical work.",
        metrics: [
          { value: "2", label: "roller coasters" },
          { value: "8 mo", label: "continuous operation" },
        ],
      },
      {
        title: "Find the failure",
        body: "Diagnosed failures across four restraint and drive subsystems, including lap bars, shoulder restraints, lift chain, and hydraulics, using tolerance analysis, schematics, and manufacturer specifications.",
        metrics: [{ value: "4", label: "subsystems diagnosed" }],
      },
    ],
  },
];

/** Subsystems named in the Wonderland bullet — used by the coaster-profile visual. */
export const coasterSubsystems = ["Lap bars", "Shoulder restraints", "Lift chain", "Hydraulics"] as const;
