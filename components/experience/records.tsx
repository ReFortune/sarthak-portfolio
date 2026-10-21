"use client";

import { Fragment, type ReactNode } from "react";
import { profile } from "@/data/profile";
import { aboutBeats, aboutFacts } from "@/data/about";
import { education } from "@/data/education";
import { experience, type Finding, type Metric } from "@/data/experience";
import { projects } from "@/data/projects";
import { leadership } from "@/data/leadership";
import { research } from "@/data/research";
import { skillClusters } from "@/data/skills";
import { timeline, type TimelineKind } from "@/data/timeline";
import type { DossierRef } from "@/lib/world-store";
import { TLink } from "../core/Transition";
import MetricValue from "../ui/MetricValue";

/* What a dossier holds: one record of the archive, set out for reading. All of it comes from the same data files as the
   archive page, so the two can never disagree. */

function Head({ eyebrow, title, sub }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <header>
      <p className="label label-strong mb-4 flex items-center gap-3">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-laser" />
        {eyebrow}
      </p>
      <h2 id="dossier-title" className="h-display text-[clamp(2rem,5vw,3.6rem)] !leading-[0.96] text-balance">{title}</h2>
      {sub && <p className="label mt-4 !normal-case !tracking-[0.03em]">{sub}</p>}
    </header>
  );
}

function Metrics({ items }: { items: Metric[] }) {
  if (!items.length) return null;
  return (
    <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-bone/15 pt-6">
      {items.map((m) => (
        <div key={m.label}>
          <dd className="h-display text-[clamp(1.5rem,3vw,2.1rem)] text-bone"><MetricValue value={m.value} /></dd>
          <dt className="label mt-1.5 !leading-snug">{m.label}</dt>
        </div>
      ))}
    </dl>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-8 divide-y divide-bone/10 border-y border-bone/10">
      {items.map((b) => (
        <li key={b} className="body py-4 !text-[0.95rem] !leading-[1.6]">{b}</li>
      ))}
    </ul>
  );
}

function Tags({ items }: { items: readonly string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {items.map((t) => (
        <li key={t} className="label rounded-full border border-bone/15 px-3 py-1.5 !text-[0.68rem] !normal-case !tracking-[0.04em]">{t}</li>
      ))}
    </ul>
  );
}

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section data-rec={id} className="mt-12 border-t border-bone/15 pt-8 first:mt-0 first:border-0 first:pt-0">
      <h3 className="h-title mb-5 text-[1.35rem] text-bone">{title}</h3>
      {children}
    </section>
  );
}

const FindingBlock = ({ f }: { f: Finding }) => (
  <article className="mt-6 first:mt-0">
    <h4 className="label label-strong mb-2">{f.title}</h4>
    <p className="body !text-[0.95rem]">{f.body}</p>
    {f.metrics && (
      <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
        {f.metrics.map((m) => (
          <div key={m.label} className="flex items-baseline gap-2.5">
            <dd className="h-display text-[1.35rem] text-bone"><MetricValue value={m.value} /></dd>
            <dt className="label !text-[0.66rem]">{m.label}</dt>
          </div>
        ))}
      </dl>
    )}
    {f.tags && <Tags items={f.tags} />}
  </article>
);

/* ── the records ──────────────────────────────────────────────────────── */

function AboutRecord() {
  return (
    <>
      <Head eyebrow="About" title={<>Hello, I’m <span className="serif">Sarthak.</span></>} sub={`${profile.pronouns} · ${profile.school}`} />
      <p className="lede mt-6">{profile.tagline}</p>
      {aboutBeats.map((b) => (
        <article key={b.n} className="mt-8 border-t border-bone/15 pt-5">
          <p className="label mb-3 flex items-center justify-between"><span className="label-strong">{b.title}</span><span className="tnum text-laser">{b.n}</span></p>
          <p className="body">{b.body}</p>
        </article>
      ))}
      <dl className="mt-10 divide-y divide-bone/10 border-y border-bone/10">
        {aboutFacts.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[6rem_1fr] gap-4 py-3.5">
            <dt className="label pt-0.5">{k}</dt>
            <dd className="text-[0.95rem] leading-snug text-bone">{v}</dd>
          </div>
        ))}
      </dl>
      <Section title="Education">
        <p className="body !text-bone">{education.degree}</p>
        <p className="label mt-2 !normal-case !tracking-[0.03em]">{education.school} · {education.period}</p>
        <Tags items={education.certificates.map((c) => c.name)} />
      </Section>
    </>
  );
}

function ExperienceRecord({ id }: { id?: string }) {
  return (
    <div>
      <Head eyebrow="Experience" title={<>Flight <span className="serif">log</span></>} sub="Two internships, in the order of the last four years." />
      <div className="mt-10">
        {[...experience].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0)).map((e) => (
          <Section key={e.id} id={e.id} title={e.org}>
            <p className="label !normal-case !tracking-[0.03em]">{e.role} · {e.type} · {e.period}</p>
            {e.primary && <p className="lede mt-5 !text-[1rem]">{e.primary.lede}</p>}
            <div className="mt-6">{e.findings.map((f) => <FindingBlock key={f.title} f={f} />)}</div>
            {e.streams?.map((s) => (
              <div key={s.id} className="mt-10 border-t border-bone/10 pt-7">
                <p className="label label-strong mb-3">{s.label}</p>
                <p className="lede !text-[1rem]">{s.lede}</p>
                <div className="mt-6">{s.findings.map((f) => <FindingBlock key={f.title} f={f} />)}</div>
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2">
                  {s.link && <TLink href={s.link.href} label={s.link.code} className="label link inline-flex min-h-11 items-center !text-bone">{s.link.label} →</TLink>}
                  {s.demo && <TLink href={`/archive#${s.demo.id}`} label="Planner" className="label link inline-flex min-h-11 items-center !text-bone">Try the planner →</TLink>}
                </div>
              </div>
            ))}
            {e.id === "csa" && (
              <TLink href="/archive#trade-study" label="Trade study" className="label link mt-6 inline-flex min-h-11 items-center !text-bone">Run the LiDAR trade study →</TLink>
            )}
          </Section>
        ))}
      </div>
    </div>
  );
}

function ProjectRecord({ id }: { id?: string }) {
  const p = projects.find((x) => x.slug === id) ?? projects[0];
  return (
    <>
      <Head eyebrow={p.kind} title={p.code} sub={`${p.name} · ${p.org}`} />
      <p className="label mt-5 !normal-case !tracking-[0.03em]">{p.role} · {p.team} · {p.period} · {p.status}</p>
      <p className="lede mt-6">{p.summary}</p>
      <Metrics items={p.metrics} />
      <Bullets items={p.bullets} />
      <Tags items={p.tags} />
      {p.caseStudy && (
        <TLink href={`/projects/${p.slug}`} label={p.code} className="btn btn--solid mt-9">
          Read the case study <span aria-hidden="true" className="arrow">→</span>
        </TLink>
      )}
    </>
  );
}

function LeadershipRecord({ id }: { id?: string }) {
  return (
    <div>
      <Head eyebrow="Leadership" title={<>Leading <span className="serif">teams</span></>} sub="Design teams, a national stage, and two years of student life." />
      <div className="mt-10">
        {[...leadership].sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : 0)).map((l) => (
          <Section key={l.id} id={l.id} title={l.fullName ?? l.org}>
            <p className="label !normal-case !tracking-[0.03em]">{l.role} · {l.period}{l.fullName ? ` · ${l.org}` : ""}</p>
            <Metrics items={l.metrics} />
            <Bullets items={l.bullets} />
            {l.awards && <Tags items={l.awards} />}
          </Section>
        ))}
      </div>
    </div>
  );
}

function ResearchRecord() {
  return (
    <>
      <Head eyebrow={`Research · ${research.period}`} title={<>HAT-P-18 <span className="serif">b</span></>} sub={research.org} />
      <p className="lede mt-6">{research.title}</p>
      <Metrics
        items={[
          { value: `${research.numbers.radiusKm.toLocaleString("en-CA")} km`, label: `planet radius, ${research.numbers.percentOff}% from the published ${research.numbers.publishedRadiusKm.toLocaleString("en-CA")} km` },
          { value: String(research.numbers.frames), label: `CCD frames, ${research.numbers.exposureSeconds} s exposures` },
          { value: `${research.paper.depthPercent} %`, label: "transit depth" },
          { value: `${research.paper.distanceLy} ly`, label: "distance to the star" },
        ]}
      />
      <Bullets items={[...research.bullets]} />
      <Tags items={research.tools} />
      <p className="label mt-8 !normal-case !tracking-[0.03em]">{research.paper.telescope} · observed {research.paper.observed} · {research.paper.calibration}</p>
      <a href={research.pdf} target="_blank" rel="noopener noreferrer" className="btn btn--solid mt-8">
        Read the report <span aria-hidden="true" className="arrow">↗</span>
      </a>
    </>
  );
}

function SkillsRecord() {
  return (
    <>
      <Head eyebrow="Skills" title={<>The <span className="serif">toolkit</span></>} sub="Four groups, the way a spacecraft is built." />
      <div className="mt-10">
        {skillClusters.map((c) => (
          <Section key={c.id} title={c.name}>
            <p className="body !text-[0.95rem]">{c.blurb}</p>
            <Tags items={c.skills} />
          </Section>
        ))}
      </div>
    </>
  );
}

const KIND: Record<TimelineKind, string> = { education: "Study", work: "Work", project: "Project", leadership: "Team", research: "Research" };

function TimelineRecord() {
  const years = [...new Set(timeline.map((r) => r.start.slice(0, 4)))];
  return (
    <>
      <Head eyebrow="Timeline" title={<>Every <span className="serif">date</span></>} sub="2021 → 2027" />
      <div className="mt-10">
        {years.map((y) => (
          <Fragment key={y}>
            <p className="label label-strong mt-8 border-b border-bone/15 pb-2 first:mt-0">{y}</p>
            <ul>
              {timeline.filter((r) => r.start.startsWith(y)).map((r) => (
                <li key={r.id} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 border-b border-bone/10 py-3.5">
                  <span className="text-[0.98rem] text-bone">{r.label}</span>
                  <span className="label tnum">{r.end === r.start ? r.start : `${r.start} → ${r.end ?? "now"}`}</span>
                  <span className="label !normal-case !tracking-[0.03em]">{r.sub}</span>
                  <span className="label text-laser">{KIND[r.kind]}</span>
                </li>
              ))}
            </ul>
          </Fragment>
        ))}
      </div>
    </>
  );
}

export function Record({ r }: { r: DossierRef }) {
  switch (r.kind) {
    case "about": return <AboutRecord />;
    case "experience": return <ExperienceRecord id={r.id} />;
    case "project": return <ProjectRecord id={r.id} />;
    case "leadership": return <LeadershipRecord id={r.id} />;
    case "research": return <ResearchRecord />;
    case "skills": return <SkillsRecord />;
    case "timeline": return <TimelineRecord />;
  }
}

/** The word shown in the drawer's header strip. */
export const RECORD_KIND: Record<DossierRef["kind"], string> = {
  about: "About",
  experience: "Experience",
  project: "Project",
  leadership: "Leadership",
  research: "Research",
  skills: "Skills",
  timeline: "Timeline",
};
