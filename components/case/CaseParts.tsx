import type { ReactNode } from "react";
import Reveal from "../ui/Reveal";
import CountUp from "../ui/CountUp";
import SplitReveal from "../ui/SplitReveal";
import MetricValue from "../ui/MetricValue";
import { TLink } from "../core/Transition";
import { projects, type Project } from "@/data/projects";

/** Section wrapper: hairline + index label, big title, content. */
export function CaseSection({
  n,
  label,
  title,
  children,
  id,
}: {
  n: string;
  label: string;
  title: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} data-chapter={label} data-chapter-n={n} className="relative py-20 md:py-32">
      <div className="wrap">
        <Reveal className="flex items-center justify-between border-t border-bone/15 pt-4">
          <p className="label label-strong flex items-center gap-3">
            <span className="tnum text-laser">{n}</span>
            <span aria-hidden="true">—</span>
            {label}
          </p>
        </Reveal>
        <SplitReveal as="h2" className="h-display mt-8 max-w-[22ch] text-[clamp(2rem,4.6vw,4.6rem)] !leading-[0.98] md:mt-12">
          {title}
        </SplitReveal>
        <div className="mt-12 md:mt-16">{children}</div>
      </div>
    </section>
  );
}

/** Big-number strip with count-ups. `numeric` metrics animate; the rest render as MetricValue. */
export function StatStrip({ stats }: { stats: { value: string; label: string; to?: number; decimals?: number; prefix?: string; suffix?: string }[] }) {
  return (
    <section aria-label="Key numbers" className="border-y border-bone/15">
      <div className="wrap">
        <dl className={`grid divide-bone/10 md:divide-x ${stats.length === 3 ? "grid-cols-3 md:grid-cols-3" : "grid-cols-2 md:grid-cols-4"}`}>
          {stats.map((s) => (
            <div key={s.label} className={`border-b border-bone/10 px-0 py-8 md:border-b-0 md:px-7 md:py-12 md:first:pl-0 ${stats.length === 3 ? "pr-3 md:pr-7" : ""}`}>
              <dd className="h-display text-[clamp(2.1rem,4.6vw,4.8rem)] leading-none">
                {s.to !== undefined ? (
                  <span>
                    <CountUp to={s.to} decimals={s.decimals} prefix={s.prefix} suffix={s.suffix} />
                  </span>
                ) : (
                  <MetricValue value={s.value} />
                )}
              </dd>
              <dt className="label mt-4 max-w-[12rem] !leading-snug">{s.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** A lettered/numbered list of paragraphs. */
export function NumberedList({ items }: { items: { title?: string; body: string }[] }) {
  return (
    <Reveal selector="li" stagger={0.1}>
      <ol className="divide-y divide-bone/10 border-y border-bone/10">
        {items.map((it, i) => (
          <li key={i} className="grid grid-cols-[2.6rem_1fr] gap-4 py-6 md:grid-cols-[3.5rem_14rem_1fr] md:gap-8 md:py-7">
            <span className="h-display text-[1.6rem] leading-none text-laser tnum">{String(i + 1).padStart(2, "0")}</span>
            {it.title && <h3 className="h-title col-span-1 text-[1.15rem] md:col-span-1">{it.title}</h3>}
            <p className={`body ${it.title ? "col-span-2 md:col-span-1" : "md:col-span-2"}`}>{it.body}</p>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

export type DocLink = { href: string; label: string; detail: string; size: string };

export function Documents({ docs }: { docs: DocLink[] }) {
  return (
    <Reveal selector="a" stagger={0.1}>
      <ul className="grid gap-px bg-bone/10 sm:grid-cols-2">
        {docs.map((d) => (
          <li key={d.href} className="bg-ink">
            <a href={d.href} target="_blank" rel="noopener noreferrer" className="group flex h-full items-end justify-between gap-6 p-7 transition-colors hover:bg-ink-2 md:p-9">
              <span>
                <span className="label mb-4 block">PDF · {d.size}</span>
                <span className="h-display block text-[clamp(1.4rem,2.4vw,2.2rem)] !leading-[1.02]">{d.label}</span>
                <span className="label mt-3 block !normal-case !tracking-normal">{d.detail}</span>
              </span>
              <span aria-hidden="true" className="text-2xl text-laser transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1">↗</span>
            </a>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/** Big "next case study" banner. */
export function NextProject({ current }: { current: string }) {
  const cases = projects.filter((p) => p.caseStudy);
  const i = cases.findIndex((p) => p.slug === current);
  const next: Project = cases[(i + 1) % cases.length];
  return (
    <section className="relative border-t border-bone/15 py-24 md:py-40">
      <div className="wrap">
        <p className="label mb-8">Next case study</p>
        <TLink
          href={`/projects/${next.slug}`}
          label={next.code}
          data-cursor="view"
          data-cursor-label="Open"
          className="group block"
        >
          <span className="h-display block text-[clamp(3rem,13vw,14rem)] !leading-[0.86] transition-colors duration-500 group-hover:text-laser">
            {next.code}
          </span>
          <span className="mt-8 flex flex-wrap items-end justify-between gap-6">
            <span className="serif max-w-2xl text-[clamp(1.2rem,2vw,1.8rem)] leading-tight text-bone-dim">{next.name}</span>
            <span className="btn btn--solid pointer-events-none">
              Open <span aria-hidden="true" className="arrow">↗</span>
            </span>
          </span>
        </TLink>
        <div className="mt-16 flex flex-wrap gap-6 border-t border-bone/10 pt-8">
          <TLink href="/#projects" label="Projects" className="label link !text-bone">← All projects</TLink>
          <TLink href="/#contact" label="Contact" className="label link !text-bone">Get in touch →</TLink>
        </div>
      </div>
    </section>
  );
}
