"use client";

import { useEffect, useMemo, useState } from "react";
import { timeline, type TimelineKind, type TimelineRow } from "@/data/timeline";
import { ymToYear } from "@/lib/math";
import { dossierStore, focusStore, sheetStore, type DossierRef } from "@/lib/world-store";
import { NOW_FALLBACK, SPAN, YEARS, fmt, kindStyle, nowYear, pct } from "../../sections/timelineKit";

/** What a row opens in the dossier. */
const recordOf = (r: TimelineRow): DossierRef =>
  r.kind === "project" ? { kind: "project", id: r.id } : r.kind === "work" ? { kind: "experience", id: r.id } : r.kind === "leadership" ? { kind: "leadership", id: r.id } : r.kind === "research" ? { kind: "research" } : { kind: "about" };

/** The timeline as rows on one axis. Point at a row and the same line lights up beside the route in the world. */
export default function TimelinePanel() {
  const [now, setNow] = useState(NOW_FALLBACK);
  const [hover, setHover] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setNow(nowYear());
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    focusStore.set(hover ? `row:${hover}` : null);
  }, [hover]);
  useEffect(() => () => focusStore.set(null), []);

  const rows = useMemo(
    () =>
      timeline.map((r) => {
        const s = ymToYear(r.start);
        const e = r.end === null ? now : ymToYear(r.end) + 1 / 12;
        return { ...r, s, e, months: Math.max(1, Math.round((e - s) * 12)), ongoing: r.end === null };
      }),
    [now]
  );
  const active = rows.find((r) => r.id === hover);

  return (
    <div className="flex h-full flex-col" onPointerLeave={() => setHover(null)}>
      <div className="relative h-8 shrink-0 border-b border-bone/10" aria-hidden="true">
        <div className="absolute inset-y-0 left-[34%] right-5">
          {YEARS.map((y) => (
            <span key={y} className="label tnum absolute top-1/2 -translate-y-1/2 pl-1" style={{ left: pct(y) }}>
              <span className="sm:hidden">{String(y).slice(2)}</span>
              <span className="hidden sm:inline">{y}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-[34%] right-5">
          {YEARS.map((y) => (
            <span key={y} className="absolute inset-y-0 w-px bg-bone/[0.07]" style={{ left: pct(y) }} />
          ))}
          <span className="absolute inset-y-0 z-10 w-px bg-laser/70" style={{ left: pct(now) }} />
        </div>
        <ul className="relative h-full">
          {rows.map((r, i) => {
            const k = kindStyle[r.kind as TimelineKind];
            const isPoint = r.months <= 1 && r.kind === "research";
            return (
              <li key={r.id} className="h-[calc(100%/var(--n))] min-h-8 max-h-11" style={{ ["--n" as string]: rows.length }}>
                <button
                  type="button"
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHover(r.id)}
                  onFocus={() => setHover(r.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => {
                    setHover(r.id);
                    sheetStore.set(false);
                    dossierStore.set(recordOf(r));
                  }}
                  data-cursor="link"
                  aria-label={`${r.label}, ${r.sub}: ${fmt(r.start)} to ${r.end ? fmt(r.end) : "present"}. Open its record.`}
                  className={`grid h-full w-full grid-cols-[34%_1fr] items-center border-b border-bone/[0.07] text-left transition-colors duration-300 ${hover === r.id ? "bg-ink-3" : ""}`}
                >
                  <span className="min-w-0 px-4">
                    <span className="block truncate text-[0.82rem] leading-tight text-bone">{r.label}</span>
                    <span className="label block truncate !text-[0.62rem]">{r.sub}</span>
                  </span>
                  <span className="relative mr-5 block h-4">
                    <span
                      className={`absolute top-1/2 block -translate-y-1/2 ${isPoint ? "h-3.5 w-3.5 rotate-45" : "h-3 rounded-[2px]"} ${k.bar}`}
                      style={{
                        ...(isPoint ? { left: `calc(${pct(r.s)} - 7px)` } : { left: pct(r.s), width: `${(((r.e - r.s) / SPAN) * 100).toFixed(3)}%`, minWidth: "5px" }),
                        transformOrigin: "0% 50%",
                        transform: `translateY(-50%) ${isPoint ? "rotate(45deg)" : ""} scaleX(${ready ? 1 : 0})`,
                        transition: "transform 1.1s cubic-bezier(.16,1,.3,1)",
                        transitionDelay: `${i * 45}ms`,
                      }}
                    >
                      {r.ongoing && <span className="absolute -right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-inherit [animation:blink_1.3s_infinite]" />}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-bone/10 px-4 py-2.5" aria-live="polite">
        <p className="label min-h-[1.4em] !text-bone">
          {active ? (
            <>
              {active.label} · {fmt(active.start)} → {active.end ? fmt(active.end) : "present"} · {active.months} mo
            </>
          ) : (
            "Point at a row"
          )}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
          {(["work", "project", "leadership", "research", "education"] as TimelineKind[]).map((k) => (
            <li key={k} className="label flex items-center gap-1.5 !text-[0.62rem]">
              <span className={`inline-block h-1.5 w-3 rounded-[1px] ${kindStyle[k].bar}`} />
              {kindStyle[k].label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
