export type SkillCluster = {
  id: string;
  name: string;
  blurb: string;
  skills: string[];
};

/** Faithful to the résumé's four skill groups. STK appears in two — the constellation draws it as a shared star. */
export const skillClusters: SkillCluster[] = [
  {
    id: "sim",
    name: "Simulation & CAD",
    blurb: "Model it before it is built.",
    skills: ["Abaqus", "FEA", "Fusion 360", "SAP2000", "SolidWorks", "STK"],
  },
  {
    id: "hw",
    name: "Hardware & Fabrication",
    blurb: "Then make it, in the shop.",
    skills: ["3D Printing", "DFM/DFA", "ESP32", "Laser & Water-Jet Cutting", "Machine Shop Trained"],
  },
  {
    id: "sw",
    name: "Software & Analysis",
    blurb: "Turn raw data into decisions.",
    skills: ["ARM Assembly", "Astropy", "C++", "LiDAR Point-Cloud Processing", "MATLAB", "Open3D", "Python", "STK"],
  },
  {
    id: "sys",
    name: "Systems Engineering",
    blurb: "Keep every requirement honest.",
    skills: ["Interface Definition", "Requirements Traceability", "Trade Studies", "Verification & Validation"],
  },
];
