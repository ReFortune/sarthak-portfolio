export type Metric = { value: string; label: string };

export type Finding = {
  title: string;
  /** Résumé bullet, kept faithful to the source. */
  body: string;
  metrics?: Metric[];
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
  findings: Finding[];
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
