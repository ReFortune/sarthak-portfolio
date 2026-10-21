"use client";

import type { ReactNode } from "react";
import { profile } from "@/data/profile";
import { projects } from "@/data/projects";
import { leadership } from "@/data/leadership";
import { research } from "@/data/research";
import { countWord } from "@/lib/format";
import { EXHIBIT_PROJECT as SLOT, type BeatId } from "@/components/world/story";
import { TLink } from "../core/Transition";
import Magnetic from "../ui/Magnetic";
import CopyEmail from "../sections/CopyEmail";
import ResumeDeck from "../sections/ResumeDeck";
import { Copy, DossierButton } from "./parts";
import Threshold from "./Threshold";

/* The words of every beat, set in the site's own voice and taken from its data. Each beat is shown while the story
   is in it; the rest stays in the dossier drawer and the archive. */

const bridge = leadership.find((l) => l.id === "steel-bridge")!;

const TAGLINE: Record<string, string> = {
  sparrow: "A 1:10-scale wheeled rover test platform for the Canadian Space Agency, with one interface for LiDAR, stereo or monocular cameras.",
  "mission-planning-tool": "A rover mission-planning tool that runs on any laptop, low-spec included, with new approaches to path planning.",
  "hospital-dispensing-robot": "A hospital robot that follows corridors and delivers the right pill box to the right room, on a $300 budget.",
  "route-m": "A two-satellite stereo constellation mapping all of Mars at 1 m or better, taken through to Critical Design Review.",
  oscar: "An orbital spectrometer that quantifies algal biomass for ocean-health monitoring, taken through to Critical Design Review.",
  "nova-payload": "A sub-500 g payload flown to 40 km on the Canadian Space Agency’s RSOnar III balloon to measure night-sky brightness.",
};

const RING = Object.keys(SLOT);

function ProjectBeat({ slot }: { slot: keyof typeof SLOT }) {
  const p = projects.find((x) => x.slug === SLOT[slot])!;
  return (
    <Copy
      valign="bottom"
      eyebrow={
        <>
          {String(RING.indexOf(slot) + 1).padStart(2, "0")} / {String(RING.length).padStart(2, "0")} <span aria-hidden="true">—</span> {p.kind}
        </>
      }
      title={
        <>
          <span className="block text-[clamp(2.4rem,6.4vw,5.6rem)] leading-[0.92]">{p.code}</span>
          <span className="label mt-3 block !normal-case !tracking-[0.03em] !text-bone-dim">
            {p.role} · {p.team} · {p.period}
          </span>
        </>
      }
      body={TAGLINE[p.slug]}
      figs={p.metrics.slice(0, 3)}
      actions={
        <>
          <DossierButton to={{ kind: "project", id: p.slug }} solid>
            Open dossier
          </DossierButton>
          {p.caseStudy && (
            <TLink href={`/projects/${p.slug}`} label={p.code} className="label link inline-flex min-h-11 items-center !text-bone">
              Case study →
            </TLink>
          )}
        </>
      }
    />
  );
}

/** A line set quietly at the foot of the frame. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <div className="wrap flex h-full items-end pb-[clamp(4.5rem,9vh,6rem)]">
      <p className="label label-strong flex items-center gap-3">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-laser [animation:blink_1.4s_infinite]" />
        {children}
      </p>
    </div>
  );
}

export const contents: Partial<Record<BeatId, ReactNode>> = {
  threshold: <Threshold />,

  why: (
    <Copy
      eyebrow="About"
      title={
        <>
          I design the instruments, systems and teams that let us <span className="serif">measure other worlds</span>, from a 40 km balloon to orbit around Mars.
        </>
      }
      actions={<DossierButton to={{ kind: "about" }}>Who I am</DossierButton>}
    />
  ),

  survey: (
    <Copy
      eyebrow="Canadian Space Agency · LiDAR"
      title={
        <>
          Every route starts as <span className="serif">a surface.</span>
        </>
      }
      body="At the CSA I characterised a LiDAR to 1 cm ranging accuracy, then traded four pushbroom configurations for Artemis 4 surface mapping."
      figs={[
        { value: "1 cm", label: "ranging accuracy" },
        { value: "3 cm", label: "smallest obstacle detected" },
      ]}
      actions={
        <>
          <DossierButton to={{ kind: "experience", id: "csa" }} solid>
            Flight log
          </DossierButton>
          <TLink href="/archive#trade-study" label="Trade study" className="label link inline-flex min-h-11 items-center !text-bone">
            Run the trade study →
          </TLink>
        </>
      }
    />
  ),

  plan: (
    <Copy
      eyebrow="Route planning"
      title={
        <>
          Then <span className="serif">the path</span> across it.
        </>
      }
      body="On this made-up terrain, a planner searches for the cheapest way across and keeps clear of ground steeper than its limit. At the CSA I built the front end of a rover mission-planning tool and explored new ways to plan paths."
      actions={
        <>
          <DossierButton to={{ kind: "project", id: "mission-planning-tool" }} solid>
            Mission planning tool
          </DossierButton>
          <TLink href="/archive#mission-planner" label="Planner" className="label link inline-flex min-h-11 items-center !text-bone">
            Try the planner →
          </TLink>
        </>
      }
    />
  ),

  gate2: <Caption>Sparrow, scanned in · the instruments are next</Caption>,

  sparrow: <ProjectBeat slot="sparrow" />,
  mpt: <ProjectBeat slot="mpt" />,
  chiron: <ProjectBeat slot="chiron" />,
  routem: <ProjectBeat slot="routem" />,
  oscar: <ProjectBeat slot="oscar" />,
  nova: <ProjectBeat slot="nova" />,

  crew: (
    <Copy
      align="right"
      eyebrow="Leadership"
      title={
        <>
          Leading <span className="serif">teams</span>
        </>
      }
      body="Design teams taught me the other half of engineering: people, budgets and deadlines. As President of York University Steel Bridge I grew the team from 6 to 20 and moved its funding to $35,000 of external sponsorship."
      figs={bridge.metrics.slice(0, 3)}
      actions={<DossierButton to={{ kind: "leadership", id: "steel-bridge" }}>Steel Bridge, GNCTR, LES</DossierButton>}
    />
  ),

  transit: (
    <Copy
      align="right"
      eyebrow="Research · HAT-P-18 b"
      title={
        <>
          A planet, <span className="serif">from starlight</span>
        </>
      }
      body="Nothing but photons from a star about 530 light-years away: 706 CCD frames, one six-hour transit, and a pipeline that turns them into the size of a world."
      figs={[
        { value: "69,112 km", label: "radius, within 0.6% of published" },
        { value: String(research.numbers.frames), label: "CCD frames reduced" },
      ]}
      actions={<DossierButton to={{ kind: "research" }}>The report</DossierButton>}
    />
  ),

  toolkit: (
    <Copy
      align="right"
      eyebrow="Skills"
      title={
        <>
          Four disciplines, <span className="serif">one system</span>
        </>
      }
      body="Grouped the way a spacecraft is: model it, build it, process its data, and keep every requirement honest. STK sits in two of them."
      actions={<DossierButton to={{ kind: "skills" }}>The toolkit</DossierButton>}
    />
  ),

  path: (
    <Copy
      valign="bottom"
      eyebrow="Timeline"
      title={
        <>
          Mission <span className="serif">timeline</span>
        </>
      }
      body={`Everything on one route: study, two internships, two design teams, ${countWord(projects.length)} projects and a research paper, overlapping the way real schedules do.`}
      actions={<DossierButton to={{ kind: "timeline" }}>Every date</DossierButton>}
    />
  ),

  resume: (
    <>
      <Copy
        eyebrow={`Résumé · ${profile.resume.edition} · ${profile.resume.pages} pages`}
        title={
          <>
            The <span className="serif">short</span> version
          </>
        }
        body="Two pages: the work above, in the order a recruiter reads it."
        actions={
          <>
            <Magnetic strength={0.22}>
              <a href={profile.resume.href} download={profile.resume.filename} className="btn btn--solid">
                Download PDF <span aria-hidden="true" className="arrow">↓</span>
              </a>
            </Magnetic>
            <TLink href="/archive#resume" label="Archive" className="label link inline-flex min-h-11 items-center !text-bone">
              Read it on the page →
            </TLink>
          </>
        }
      />
      {/* the document itself, tilting toward the pointer */}
      <div className="[pointer-events:var(--pe,auto)] absolute inset-y-0 right-[max(var(--gutter),3vw)] hidden w-[min(32vw,25rem)] items-center lg:flex">
        <ResumeDeck />
      </div>
    </>
  ),

  gate: (
    <div className="wrap flex h-full flex-col justify-end pb-[clamp(4.5rem,9vh,6rem)] pt-[clamp(6rem,13vh,8.5rem)]">
      <p className="label label-strong mb-5 flex items-center gap-3">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-laser [animation:blink_1.4s_infinite]" />
        Contact
      </p>
      <h2 className="h-display max-w-[48rem] text-balance text-[clamp(2.1rem,5.2vw,5.2rem)] !leading-[0.94]">
        Let’s build something that <span className="serif">leaves Earth.</span>
      </h2>
      <p className="lede mt-6 max-w-[34rem]">{profile.seeking}</p>
      <div className="[pointer-events:var(--pe,auto)] mt-8 max-w-full">
        <CopyEmail email={profile.email} />
      </div>
      <div className="[pointer-events:var(--pe,auto)] mt-2 flex flex-wrap items-center gap-3">
        <Magnetic strength={0.22}>
          <a href={`mailto:${profile.email}?subject=Hello%20Sarthak`} className="btn btn--solid">
            Write me <span aria-hidden="true" className="arrow">↗</span>
          </a>
        </Magnetic>
        <Magnetic strength={0.22}>
          <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="btn">
            LinkedIn <span aria-hidden="true" className="arrow">↗</span>
          </a>
        </Magnetic>
        <a href="#top" className="label link inline-flex min-h-11 items-center !text-bone">
          Back to the start ↑
        </a>
        <TLink href="/archive" label="Archive" className="label link inline-flex min-h-11 items-center !text-bone">
          Archive →
        </TLink>
      </div>
      <p className="label mt-8">
        © {new Date().getFullYear()} {profile.name} · Space engineering
      </p>
    </div>
  ),
};
