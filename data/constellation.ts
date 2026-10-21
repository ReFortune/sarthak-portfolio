/** The skills as a star chart: hand-placed in a 1000 × 600 space. STK belongs to two clusters (as on the résumé). Shared by the archive's constellation and the world's sky. */
export type Align = "r" | "l" | "t" | "b";
export type Star = { id: string; label: string; x: number; y: number; a: Align; clusters: string[] };

export const STARS: Star[] = [
  // Simulation & CAD
  { id: "Abaqus", label: "Abaqus", x: 70, y: 215, a: "b", clusters: ["sim"] },
  { id: "FEA", label: "FEA", x: 175, y: 120, a: "t", clusters: ["sim"] },
  { id: "Fusion 360", label: "Fusion 360", x: 290, y: 185, a: "r", clusters: ["sim"] },
  { id: "SAP2000", label: "SAP2000", x: 395, y: 92, a: "r", clusters: ["sim"] },
  { id: "SolidWorks", label: "SolidWorks", x: 255, y: 290, a: "b", clusters: ["sim"] },
  { id: "STK", label: "STK", x: 492, y: 230, a: "b", clusters: ["sim", "sw"] },
  // Software & Analysis
  { id: "Python", label: "Python", x: 730, y: 178, a: "b", clusters: ["sw"] },
  { id: "MATLAB", label: "MATLAB", x: 630, y: 86, a: "t", clusters: ["sw"] },
  { id: "Astropy", label: "Astropy", x: 850, y: 82, a: "t", clusters: ["sw"] },
  { id: "C++", label: "C++", x: 905, y: 185, a: "r", clusters: ["sw"] },
  { id: "ARM Assembly", label: "ARM Assembly", x: 950, y: 262, a: "l", clusters: ["sw"] },
  { id: "Open3D", label: "Open3D", x: 622, y: 268, a: "b", clusters: ["sw"] },
  { id: "LiDAR Point-Cloud Processing", label: "LiDAR point-cloud processing", x: 785, y: 282, a: "b", clusters: ["sw"] },
  // Hardware & Fabrication
  { id: "3D Printing", label: "3D printing", x: 75, y: 470, a: "t", clusters: ["hw"] },
  { id: "DFM/DFA", label: "DFM / DFA", x: 190, y: 392, a: "t", clusters: ["hw"] },
  { id: "Laser & Water-Jet Cutting", label: "Laser & water-jet cutting", x: 318, y: 470, a: "r", clusters: ["hw"] },
  { id: "Machine Shop Trained", label: "Machine shop trained", x: 195, y: 545, a: "r", clusters: ["hw"] },
  { id: "ESP32", label: "ESP32", x: 420, y: 398, a: "r", clusters: ["hw"] },
  // Systems Engineering (a closed loop)
  { id: "Requirements Traceability", label: "Requirements traceability", x: 650, y: 440, a: "l", clusters: ["sys"] },
  { id: "Interface Definition", label: "Interface definition", x: 805, y: 410, a: "t", clusters: ["sys"] },
  { id: "Verification & Validation", label: "Verification & validation", x: 935, y: 480, a: "l", clusters: ["sys"] },
  { id: "Trade Studies", label: "Trade studies", x: 775, y: 538, a: "b", clusters: ["sys"] },
];

export const EDGES: [string, string][] = [
  ["Abaqus", "FEA"], ["FEA", "Fusion 360"], ["Fusion 360", "SAP2000"], ["Fusion 360", "SolidWorks"], ["SolidWorks", "STK"],
  ["STK", "Python"], ["Python", "MATLAB"], ["Python", "Astropy"], ["Python", "C++"], ["C++", "ARM Assembly"], ["Python", "Open3D"], ["Open3D", "LiDAR Point-Cloud Processing"],
  ["3D Printing", "DFM/DFA"], ["DFM/DFA", "Laser & Water-Jet Cutting"], ["Laser & Water-Jet Cutting", "Machine Shop Trained"], ["Machine Shop Trained", "3D Printing"], ["Laser & Water-Jet Cutting", "ESP32"],
  ["Requirements Traceability", "Interface Definition"], ["Interface Definition", "Verification & Validation"], ["Verification & Validation", "Trade Studies"], ["Trade Studies", "Requirements Traceability"],
];

