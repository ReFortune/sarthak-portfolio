import { profile } from "./profile";

/** Who I am, in three beats and four facts: shared by the archive's About section and the home page's dossier. */
export const aboutBeats = [
  {
    n: "A",
    title: "Why space",
    body: "I chose Space Engineering because I have always been fascinated by the idea that humanity can build machines capable of leaving Earth and exploring the unknown. Spacecraft are one of the hardest engineering problems we have: every gram, watt and line of code matters, and every decision has to be trusted millions of kilometres away.",
  },
  {
    n: "B",
    title: "What I’ve learned",
    body: "York’s program treats a spacecraft as a complete system — orbital mechanics, mission design, payload development and the human decisions behind a successful mission. The most rewarding part has been watching classroom concepts become real engineering problems. At the Canadian Space Agency, requirements, test data and verification decide whether a system works.",
  },
  {
    n: "C",
    title: "Where I’m going",
    body: "I want to become an Assembly, Integration & Test (AIT) engineer: the person who turns ambitious ideas into working missions by connecting science objectives, spacecraft design and operations, while learning from the people and problems that make this field so inspiring.",
  },
];

export const aboutFacts: [string, string][] = [
  ["Now", `${profile.role}, ${profile.org}`],
  ["Studying", `${profile.program}, ${profile.school} (${profile.graduation})`],
  ["Focus", "LiDAR surface mapping · payloads · mission design · systems engineering"],
  ["Pronouns", profile.pronouns],
];

