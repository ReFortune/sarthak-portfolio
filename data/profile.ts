/**
 * Single source of truth for identity + site-wide copy.
 * Facts come from the September 2026 résumé (public/resume.pdf).
 */
export const profile = {
  name: "Sarthak Sahai",
  firstName: "Sarthak",
  lastName: "Sahai",
  pronouns: "he/him",
  role: "Student Systems Engineering Intern",
  org: "Canadian Space Agency",
  school: "York University",
  program: "B.Eng. Space Engineering",
  graduation: "Apr 2027",
  timezone: "America/Toronto",
  timezoneLabel: "Eastern Time",
  email: "sarthaksahai2014@gmail.com",
  linkedin: "https://www.linkedin.com/in/sarthak-sahai",
  linkedinHandle: "/in/sarthak-sahai",
  resume: {
    href: "/resume.pdf",
    filename: "Sarthak-Sahai-Resume-Sep-2026.pdf",
    edition: "September 2026",
    pages: 2,
  },
  hook: "I measure worlds.",
  tagline:
    "Space systems engineer in training. I build the instruments, payloads and teams that let us see other worlds clearly.",
  seeking:
    "Open to opportunities in aerospace systems engineering, mission design, AIT and space technology.",
  description:
    "Sarthak Sahai — Space Engineering student at York University and Student Systems Engineering Intern at the Canadian Space Agency. LiDAR surface mapping, stratospheric payloads, Mars mission design and exoplanet photometry.",
} as const;

/** Headline figures that scroll past as a ticker. Every value is lifted from the résumé. */
export const ticker = [
  { value: "1 cm", label: "LiDAR ranging accuracy characterised" },
  { value: "40 km", label: "NOVA payload flight altitude" },
  { value: "0.6%", label: "from the published exoplanet radius" },
  { value: "20", label: "engineers led on Steel Bridge" },
  { value: "$35,000", label: "sponsorship & industry support raised" },
  { value: "7 yr", label: "ROUTE-M mission design life" },
  { value: "706", label: "CCD frames reduced to one light curve" },
  { value: "3.7 W", label: "NOVA peak draw against a 4 W budget" },
  { value: "≈ $1,500", label: "Sparrow rover target build cost" },
] as const;

/** Menu / navigation entries (ids match the `id` on each page section). */
export const sections = [
  { id: "top", n: "00", label: "Home", hint: "Terrain scan" },
  { id: "profile", n: "01", label: "Profile", hint: "Who, why, where next" },
  { id: "experience", n: "02", label: "Experience", hint: "Canadian Space Agency · Canada’s Wonderland" },
  { id: "projects", n: "03", label: "Projects", hint: "NOVA · ROUTE-M · OSCAR · Sparrow · CHIRON" },
  { id: "leadership", n: "04", label: "Leadership", hint: "Steel Bridge · Concrete Toboggan · LES" },
  { id: "research", n: "05", label: "Research", hint: "HAT-P-18 b transit photometry" },
  { id: "toolkit", n: "06", label: "Toolkit", hint: "Simulation, hardware, software, systems" },
  { id: "timeline", n: "07", label: "Timeline", hint: "2021 → 2027" },
  { id: "resume", n: "08", label: "Résumé", hint: "September 2026" },
  { id: "contact", n: "09", label: "Contact", hint: "Say hello" },
] as const;

export type SectionId = (typeof sections)[number]["id"];
