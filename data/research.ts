/**
 * HAT-P-18 b transit photometry. Bullets are from the résumé; the `paper` block
 * is lifted from the original report (PHYS 3070, Nov 2024).
 */
export const research = {
  title: "Observing the HAT-P-18 b Transit and Calculating Planetary Radius through Light Curves",
  org: "York University",
  period: "Nov 2024",
  bullets: [
    "Captured 706 CCD frames of exoplanet HAT-P-18 b at 30 s exposures across a single 6-hour transit observation at the Allan I. Carswell Observatory.",
    "Developed the Python reduction and photometry pipeline using Astropy, CCDPROC, Photutils, and Astroalign to process all 706 frames.",
    "Computed a planetary radius of 69,112 km from the transit light curve, within 0.6% of the published 69,560 km, alongside transit depth and ingress/egress durations.",
  ],
  tools: ["Astropy", "CCDPROC", "Photutils", "Astroalign", "Python"],
  pdf: "/assets/publications/hat-p-18b.pdf",
  numbers: {
    frames: 706,
    exposureSeconds: 30,
    transitHours: 6,
    radiusKm: 69112,
    publishedRadiusKm: 69560,
    percentOff: 0.6,
  },
  paper: {
    observed: "2 October 2024",
    distanceLy: 530,
    depthPercent: 1.7,
    radiusEarth: 10.85,
    radiusJupiter: 0.989,
    telescope: "1-metre telescope, Allan I. Carswell Observatory (York University)",
    calibration: "50 bias + 50 flat frames",
    /** Frame indices the paper marks on its labelled light curve. */
    contacts: { ingressStart: 100, ingressEnd: 250, egressStart: 550, egressEnd: 670 },
  },
} as const;
