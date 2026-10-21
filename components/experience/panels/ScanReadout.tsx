"use client";

import { useEffect, useRef, useState } from "react";
import { worldApi } from "@/lib/world-store";
import { jumpToBeat } from "../jump";

/* The first stops: the ground is a LiDAR scan, so here are the sensor's settings and what it has gathered, and what the
   rover and its planner know about the route. The numbers come straight from the world (the same route and ground you
   are looking at); the four configurations are the ones the CSA trade study compared. */

const MODES = [
  { rate: 50, inc: 0.25 },
  { rate: 25, inc: 0.5 },
  { rate: 50, inc: 0.5 },
  { rate: 25, inc: 0.25 },
] as const;
const perScan = (inc: number) => Math.round(270 / inc) + 1; // 270° field of view

const KEY_ROWS: [string, string][] = [
  ["Distance", "distance"],
  ["Elevation", "elevation"],
  ["Slope", "slope"],
  ["Next gate", "next"],
];
const PLAN_ROWS: [string, string][] = [
  ["Route", "route"],
  ["Steepest cell", "steep"],
  ["Planned in", "ms"],
];

export default function ScanReadout() {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState(0);
  const auto = useRef(true);
  const m = MODES[mode];
  const modeRef = useRef(m);
  modeRef.current = m;

  // until the visitor chooses one, the configurations take turns
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => auto.current && setMode((x) => (x + 1) % MODES.length), 5600);
    return () => window.clearInterval(id);
  }, []);

  // the readouts are written straight to the page, a few times a second
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const cells = new Map<string, HTMLElement>();
    el.querySelectorAll<HTMLElement>("[data-k]").forEach((c) => cells.set(c.dataset.k!, c));
    const put = (k: string, v: string) => {
      const c = cells.get(k);
      if (c && c.textContent !== v) c.textContent = v;
    };
    const t0 = performance.now();
    let last = 0;
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - last < 100) return;
      last = now;
      const t = worldApi.telemetry();
      const { rate, inc } = modeRef.current;
      // the sensor keeps sampling when the rover stops, so the count never sits still
      const gathered = (t ? t.points(rate, perScan(inc)) : 0) + ((now - t0) / 1000) * rate * perScan(inc);
      put("points", Math.floor(gathered).toLocaleString("en-US"));
      if (!t) return;
      put("distance", `${Math.round(t.distance)} m`);
      put("elevation", `${t.elevation >= 0 ? "+" : "−"}${Math.abs(t.elevation).toFixed(1)} m`);
      put("slope", `${Math.round(t.slope)}°`);
      put("next", t.nextGate === null ? "—" : `${Math.round(t.nextGate)} m`);
      put("route", `${Math.round(t.plan.length)} m`);
      put("steep", `${Math.round(t.plan.maxSlope)}° · limit ${t.plan.limit}°`);
      put("ms", `${t.plan.ms < 10 ? t.plan.ms.toFixed(1) : Math.round(t.plan.ms)} ms`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const row = "flex items-baseline justify-between gap-6 border-b border-bone/10 pb-2 last:border-0 last:pb-0 [@media(max-height:960px)]:pb-1.5";
  const lite = "hidden [@media(min-height:1000px)]:flex";
  return (
    <div ref={root} className="ticks border border-bone/15 bg-ink/60 px-5 py-4 backdrop-blur-[3px]" data-no-ping>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="label label-strong flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1.2s_infinite]" />
          Pushbroom LiDAR · live
        </p>
        <div role="group" aria-label="Scan configuration" className="flex gap-0.5">
          {MODES.map((c, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === mode}
              aria-label={`${c.rate} hertz, ${c.inc} degree increment`}
              title={`${c.rate} Hz · ${c.inc.toFixed(2)}°`}
              data-cursor="link"
              onClick={() => {
                auto.current = false;
                setMode(i);
              }}
              className="group grid h-6 w-6 place-items-center"
            >
              <span className={`block h-1.5 w-4 transition-colors duration-500 group-hover:bg-bone ${i === mode ? "bg-laser" : "bg-bone/25"}`} />
            </button>
          ))}
        </div>
      </div>
      <dl className="space-y-2 [@media(max-height:960px)]:space-y-1.5">
        <div className={row}>
          <dt className="label">Scan rate</dt>
          <dd className="mono tnum text-[0.8rem] tracking-wide text-bone">{m.rate} Hz</dd>
        </div>
        <div className={row}>
          <dt className="label">Angular increment</dt>
          <dd className="mono tnum text-[0.8rem] tracking-wide text-bone">{m.inc.toFixed(2)}°</dd>
        </div>
        <div className={`${row} ${lite}`}>
          <dt className="label">Points per scan</dt>
          <dd className="mono tnum text-[0.8rem] tracking-wide text-bone">{perScan(m.inc).toLocaleString("en-US")}</dd>
        </div>
        <div className={`${row} ${lite}`}>
          <dt className="label">Field of view · range</dt>
          <dd className="mono tnum text-[0.8rem] tracking-wide text-bone">270° · 20 m</dd>
        </div>
        <div className={row}>
          <dt className="label">Points acquired</dt>
          <dd className="mono tnum text-[0.8rem] tracking-wide text-laser" data-k="points">0</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-bone/15 pt-3 [@media(max-height:800px)]:hidden [@media(max-height:960px)]:mt-3 [@media(max-height:960px)]:pt-2.5">
        <p className="label label-strong mb-2.5 flex items-center gap-2 [@media(max-height:960px)]:mb-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-bone [animation:blink_1.4s_infinite]" />
          Rover · live
        </p>
        <dl className="space-y-1.5 [@media(max-height:960px)]:space-y-1">
          {KEY_ROWS.map(([label, key]) => (
            <div key={key} className={`${row} !pb-1.5 [@media(max-height:960px)]:!pb-1`}>
              <dt className="label">{label}</dt>
              <dd className="mono tnum text-[0.8rem] tracking-wide text-bone" data-k={key}>—</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 border-t border-bone/15 pt-3 [@media(max-height:960px)]:mt-3 [@media(max-height:960px)]:pt-2.5">
        <p className="label label-strong mb-2.5 flex items-center gap-2 [@media(max-height:960px)]:mb-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice [animation:blink_1.6s_infinite]" />
          Route planner · live
        </p>
        <dl className="space-y-1.5 [@media(max-height:960px)]:space-y-1">
          {PLAN_ROWS.map(([label, key]) => (
            <div key={key} className={`${row} !pb-1.5 [@media(max-height:960px)]:!pb-1`}>
              <dt className="label">{label}</dt>
              <dd className="mono tnum text-[0.8rem] tracking-wide text-bone" data-k={key}>—</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <button type="button" onClick={() => jumpToBeat("survey")} className="label link !text-bone-dim hover:!text-bone" data-cursor="link">
            Run the trade study ↓
          </button>
          <button type="button" onClick={() => jumpToBeat("plan")} className="label link !text-bone-dim hover:!text-bone" data-cursor="link">
            Try the planner ↓
          </button>
        </div>
      </div>
    </div>
  );
}
