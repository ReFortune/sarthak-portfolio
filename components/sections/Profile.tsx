import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import ScrubText from "../ui/ScrubText";
import ScanFrame from "../ui/ScanFrame";
import PortraitLens from "./PortraitLens";
import VideoCard from "./VideoCard";
import { profile } from "@/data/profile";

const beats = [
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

const facts: [string, string][] = [
  ["Now", `${profile.role}, ${profile.org}`],
  ["Studying", `${profile.program}, ${profile.school} (${profile.graduation})`],
  ["Focus", "LiDAR surface mapping · payloads · mission design · systems engineering"],
  ["Pronouns", profile.pronouns],
];

export default function Profile() {
  return (
    <section id="profile" data-section="profile" className="relative py-28 md:py-44">
      <div className="wrap">
        <SectionHead
          n="01"
          label="Profile"
          title={
            <>
              Hello, I’m <span className="serif">Sarthak.</span>
            </>
          }
        />

        <div className="grid gap-16 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <ScrubText className="text-[clamp(1.75rem,3.5vw,3.6rem)] font-[560] leading-[1.12] tracking-[-0.025em] text-bone">
              I design the instruments, systems and teams that let us{" "}
              <span className="serif">measure other worlds</span>, from a 40 km balloon to orbit around Mars.
            </ScrubText>
          </div>

          <figure className="lg:col-span-4 lg:col-start-9">
            <ScanFrame>
              <PortraitLens src="/assets/about/headshot.jpg" alt={`${profile.name} (${profile.pronouns})`} />
            </ScanFrame>
            <figcaption className="label mt-3 flex justify-between gap-4">
              <span>
                Fig. 01 — {profile.name} ({profile.pronouns})
              </span>
              <span className="hidden sm:inline">Hover to scan</span>
            </figcaption>
          </figure>
        </div>

        <Reveal selector="[data-beat]" stagger={0.14} className="mt-24 grid gap-12 md:mt-32 md:grid-cols-3 md:gap-10">
          {beats.map((b) => (
            <article key={b.n} data-beat className="border-t border-bone/15 pt-5">
              <p className="label mb-5 flex items-center justify-between">
                <span className="label-strong">{b.title}</span>
                <span className="tnum text-laser">{b.n}</span>
              </p>
              <p className="body">{b.body}</p>
            </article>
          ))}
        </Reveal>

        <div className="mt-24 grid gap-14 md:mt-32 lg:grid-cols-12">
          <Reveal className="lg:col-span-4">
            <dl className="divide-y divide-bone/10 border-y border-bone/10">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-4 py-4">
                  <dt className="label pt-0.5">{k}</dt>
                  <dd className="text-[0.95rem] leading-snug text-bone">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <Reveal className="lg:col-span-8" delay={0.1}>
            <VideoCard
              src="/assets/about/about-me-720.mp4"
              poster="/assets/about/about-me-poster.webp"
              title="In my own words"
              caption="Fig. 02 — A short video introduction"
              duration="2:13"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
