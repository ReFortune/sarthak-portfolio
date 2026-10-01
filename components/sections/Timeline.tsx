"use client";

import { useEffect, useRef, useState } from "react";
import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";
import { timeline, type TimelineKind } from "@/data/timeline";
import { education } from "@/data/education";
import { ymToYear } from "@/lib/math";

const D0 = 2021.5;
const D1 = 2027.5;
const SPAN = D1 - D0;
const YEARS = [2022, 2023, 2024, 2025, 2026, 2027];
const NOW_FALLBACK = 2026.75;

const kindStyle: Record<TimelineKind, { bar: string; label: string }> = {
  education: { bar: "bg-bone/15 border border-bone/40", label: "Education" },
  work: { bar: "bg-laser", label: "Internship" },
  project: { bar: "bg-ice", label: "Project" },
  leadership: { bar: "bg-bone/80", label: "Leadership" },
  research: { bar: "bg-ice", label: "Research" },
};

const pct = (y: number) => `${(((y - D0) / SPAN) * 100).toFixed(3)}%`;
const fmt = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
};

export default function Timeline() {
  const root = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(NOW_FALLBACK);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date();
    setNow(Math.min(D1 - 0.05, d.getFullYear() + d.getMonth() / 12 + d.getDate() / 365));
  }, []);

  useGsap(root, ({ motion }) => {
    if (!motion) return;
    const bars = root.current!.querySelectorAll("[data-bar]");
    gsap.set(bars, { scaleX: 0, transformOrigin: "0% 50%" });
    gsap.to(bars, {
      scaleX: 1,
      duration: 1.3,
      ease: "expo.out",
      stagger: 0.07,
      scrollTrigger: { trigger: root.current, start: "top 75%", once: true },
    });
  }, []);

  const rows = timeline.map((r) => {
    const s = ymToYear(r.start);
    const e = r.end === null ? now : ymToYear(r.end) + 1 / 12; // inclusive of the end month
    const months = Math.max(1, Math.round((e - s) * 12));
    return { ...r, s, e, months, ongoing: r.end === null };
  });
  const active = rows.find((r) => r.id === hover);

  return (
    <section id="timeline" data-section="timeline" className="relative py-28 md:py-44">
      <div className="wrap">
        <SectionHead
          n="07"
          label="Timeline"
          title={
            <>
              Mission <span className="serif">timeline</span>
            </>
          }
          lede="Everything above on one axis — five years of study, two internships, two design teams, five projects and a research paper, overlapping the way real schedules do."
        />

        <div ref={root}>
          <div className="window relative overflow-hidden">
            {/* year header */}
            <div className="relative hidden h-10 border-b border-bone/10 md:block">
              <div className="absolute inset-y-0 left-[27%] right-0">
                {YEARS.map((y) => (
                  <span key={y} className="label tnum absolute top-1/2 -translate-y-1/2 pl-2" style={{ left: pct(y) }}>
                    {y}
                  </span>
                ))}
              </div>
            </div>

            {/* year axis (mobile) — the bars below share this 0–100 % track */}
            <div className="relative h-8 border-b border-bone/10 px-4 md:hidden" aria-hidden="true">
              <div className="relative h-full">
                {YEARS.map((y) => (
                  <span key={y} className="label tnum absolute top-1/2 -translate-y-1/2 pl-1" style={{ left: pct(y) }}>
                    {String(y).slice(2)}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              {/* grid + now-marker (desktop) */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[27%] right-0 hidden md:block">
                {YEARS.map((y) => (
                  <span key={y} className="absolute inset-y-0 w-px bg-bone/[0.07]" style={{ left: pct(y) }} />
                ))}
                <span className="absolute inset-y-0 z-10 w-px bg-laser/70" style={{ left: pct(now) }}>
                  <span className="label absolute -top-0 left-1.5 !text-laser">Today</span>
                </span>
              </div>

              <ul>
                {rows.map((r) => {
                  const k = kindStyle[r.kind];
                  const isPoint = r.months <= 1 && r.kind === "research";
                  return (
                    <li key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
                      <a
                        href={r.href}
                        onFocus={() => setHover(r.id)}
                        onBlur={() => setHover(null)}
                        className={`grid grid-cols-1 items-center gap-2 border-b border-bone/[0.07] px-4 py-3 transition-colors duration-300 md:grid-cols-[27%_1fr] md:gap-0 md:px-0 md:py-0 ${hover === r.id ? "bg-ink-3" : ""}`}
                        aria-label={`${r.label}, ${r.sub}: ${fmt(r.start)} to ${r.end ? fmt(r.end) : "present"}`}
                      >
                        <span className="md:px-5 md:py-3.5">
                          <span className="block text-[0.92rem] leading-tight text-bone">{r.label}</span>
                          <span className="label mt-0.5 block">{r.sub}</span>
                        </span>
                        <span className="relative block h-5 md:h-full md:min-h-[3.6rem]">
                          <span
                            data-bar
                            className={`absolute top-1/2 block -translate-y-1/2 ${isPoint ? "h-3.5 w-3.5 rotate-45" : "h-3.5 rounded-[2px]"} ${k.bar}`}
                            style={
                              isPoint
                                ? { left: `calc(${pct(r.s)} - 7px)` }
                                : { left: pct(r.s), width: `${(((r.e - r.s) / SPAN) * 100).toFixed(3)}%`, minWidth: "6px" }
                            }
                          >
                            {r.ongoing && (
                              <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-inherit [animation:blink_1.3s_infinite]" />
                            )}
                          </span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-bone/10 px-4 py-3.5 md:px-5" aria-live="polite">
              <p className="label !text-bone">
                {active ? (
                  <>
                    {active.label} · {fmt(active.start)} → {active.end ? fmt(active.end) : "present"} · {active.months} mo
                  </>
                ) : (
                  "Hover a row · click to jump to it"
                )}
              </p>
              <ul className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Legend">
                {(["work", "project", "leadership", "research", "education"] as TimelineKind[]).map((k) => (
                  <li key={k} className="label flex items-center gap-2">
                    <span className={`inline-block h-2 w-3.5 rounded-[1px] ${kindStyle[k].bar}`} />
                    {kindStyle[k].label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── education ── */}
        <div id="education" className="mt-24 grid gap-10 md:mt-32 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <p className="label mb-5 flex items-center gap-3">
              <span className="text-laser">●</span> Education
            </p>
            <h3 className="h-display text-[clamp(1.9rem,4.4vw,4.4rem)] !leading-[0.98]">{education.degree}</h3>
            <p className="lede mt-6 !text-bone">
              {education.school} · {education.place}
            </p>
            <p className="label tnum mt-2">{education.period}</p>
          </Reveal>
          <Reveal className="lg:col-span-5" delay={0.1}>
            <p className="label mb-5">Additional certificates</p>
            <ul className="divide-y divide-bone/10 border-y border-bone/10">
              {education.certificates.map((c) => (
                <li key={c.name} className="py-5">
                  <p className="text-[1.02rem] leading-snug text-bone">{c.name}</p>
                  {c.detail && <p className="label mt-2 !normal-case !tracking-normal">{c.detail}</p>}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
