"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { LabParams, LabScene, LabStats } from "./pushbroomScene";
import { OBSTACLES } from "./labData";

const PRESETS = [
  { rate: 25, inc: 0.5 },
  { rate: 25, inc: 0.25 },
  { rate: 50, inc: 0.5 },
  { rate: 50, inc: 0.25 },
] as const;

const DEFAULTS: LabParams = { rate: 50, inc: 0.25, speed: 0.5, pitch: 45, height: 0.8 };
const LIMIT_MM = 30; // the "3 cm" resolution scale

function analytic(p: LabParams) {
  const beta = (p.pitch * Math.PI) / 180;
  const sinB = Math.sin(beta);
  const dphi = (p.inc * Math.PI) / 180;
  const along = (p.speed / p.rate) * 1000;
  const k = ((p.height * dphi) / sinB) * 1000;
  const cross = (x: number) => k * (1 + Math.pow((x * sinB) / p.height, 2));
  let swath = 0;
  if (k < LIMIT_MM && along <= LIMIT_MM) swath = (p.height / sinB) * Math.sqrt(LIMIT_MM / k - 1);
  return { along, c0: cross(0), c1: cross(1), c2: cross(2), swath: Math.min(swath, 3.2), lead: p.height / Math.tan(beta) };
}

const chip = (n: number) =>
  n >= 15 ? { t: "Resolved", c: "border-ice/60 text-ice" } : n >= 6 ? { t: "Marginal", c: "border-bone/50 text-bone" } : { t: "Missed", c: "border-laser/70 text-laser" };

export default function PushbroomLab() {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const labelHost = useRef<HTMLDivElement>(null);
  const scene = useRef<LabScene | null>(null);
  const [params, setParams] = useState<LabParams>(DEFAULTS);
  const [stats, setStats] = useState<LabStats | null>(null);
  const [supported, setSupported] = useState(true);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const a = useMemo(() => analytic(params), [params]);

  /* mount the WebGL scene lazily, pause it off-screen */
  useEffect(() => {
    const host = canvasHost.current;
    const labels = labelHost.current;
    const root = wrap.current;
    if (!host || !labels || !root) return;
    let disposed = false;
    let sc: LabScene | null = null;
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;
    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full";
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.cursor = "drag";
    host.appendChild(canvas);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;

    const boot = async () => {
      try {
        const mod = await import("./pushbroomScene");
        if (disposed) return;
        sc = mod.createPushbroomLab(canvas, labels, { lowPower, reduced });
        scene.current = sc;
        sc.setParams(paramsRef.current);
        sc.onStats(setStats);
        ro = new ResizeObserver(() => sc?.resize());
        ro.observe(host);
        io = new IntersectionObserver(([e]) => sc?.setVisible(e.isIntersecting), { rootMargin: "60px" });
        io.observe(root);
      } catch (err) {
        console.warn("Pushbroom lab unavailable:", err);
        setSupported(false);
      }
    };

    // create the scene only once the lab is near the viewport
    const gate = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          gate.disconnect();
          boot();
        }
      },
      { rootMargin: "500px" }
    );
    gate.observe(root);

    return () => {
      disposed = true;
      gate.disconnect();
      io?.disconnect();
      ro?.disconnect();
      sc?.dispose();
      scene.current = null;
      canvas.remove();
    };
  }, []);

  const update = (patch: Partial<LabParams>) => {
    const next = { ...paramsRef.current, ...patch };
    setParams(next);
    scene.current?.setParams(next);
  };

  const activePreset = PRESETS.findIndex((p) => p.rate === params.rate && p.inc === params.inc);
  const pps = stats ? params.rate * stats.raysPerScan : 0;

  return (
    <div ref={wrap} className="window ticks" id="pushbroom-lab">
      {/* header strip */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-bone/10 px-4 py-3 md:px-5">
        <p className="label label-strong flex items-center gap-2.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1.2s_infinite]" />
          Pushbroom lab
        </p>
        <p className="label hidden sm:block">Interactive · illustrative model, not flight data</p>
        <p className="label tnum">
          {stats ? (stats.done ? "Scan complete" : `Scanning ${String(Math.round(stats.progress * 100)).padStart(2, "0")}%`) : "Initialising"}
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.55fr_1fr]">
        {/* ── viewport ─────────────────────────────────────────── */}
        <div className="relative min-h-[26rem] border-b border-bone/10 lg:min-h-[36rem] lg:border-b-0 lg:border-r">
          <div ref={canvasHost} className="absolute inset-0 bg-ink-2" />
          <div ref={labelHost} className="pointer-events-none absolute inset-0 overflow-hidden" />
          {!supported && (
            <p className="label absolute inset-0 grid place-items-center px-8 text-center">
              WebGL is unavailable in this browser. The readouts on the right still update.
            </p>
          )}
          <p className="label pointer-events-none absolute bottom-3 left-4 hidden !text-bone/60 sm:block">Drag to orbit</p>
          <div className="absolute bottom-3 right-3 flex gap-1.5">
            {[
              ["+", "Zoom in", () => scene.current?.zoom(1)],
              ["−", "Zoom out", () => scene.current?.zoom(-1)],
              ["⟲", "Reset view", () => scene.current?.resetView()],
              ["▶", "Replay scan", () => scene.current?.restart()],
            ].map(([sym, label, fn]) => (
              <button
                key={label as string}
                type="button"
                aria-label={label as string}
                title={label as string}
                onClick={fn as () => void}
                className="grid h-9 w-9 place-items-center border border-bone/20 bg-ink/70 font-mono text-sm backdrop-blur-sm transition-colors hover:border-bone hover:bg-bone hover:text-ink"
              >
                {sym as string}
              </button>
            ))}
          </div>
        </div>

        {/* ── controls ─────────────────────────────────────────── */}
        <div className="space-y-6 p-4 md:p-6">
          <fieldset>
            <legend className="label mb-3">Trade space · scan rate × angular increment</legend>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={activePreset === i}
                  onClick={() => update({ rate: p.rate, inc: p.inc })}
                  className={`border px-3 py-2.5 text-left transition-colors ${
                    activePreset === i ? "border-laser bg-laser/10" : "border-bone/15 hover:border-bone/50"
                  }`}
                >
                  <span className="h-display block text-[1.35rem] leading-none">{p.rate} Hz</span>
                  <span className="label mt-1 block">{p.inc.toFixed(2)}° increment</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3.5">
            <Slider label="Traverse speed" unit="m/s" min={0.3} max={2} step={0.05} value={params.speed} digits={2} onChange={(v) => update({ speed: v })} />
            <Slider label="Sensor pitch" unit="° below horizontal" min={20} max={75} step={1} value={params.pitch} digits={0} onChange={(v) => update({ pitch: v })} />
            <Slider label="Mast height" unit="m" min={0.4} max={1.4} step={0.05} value={params.height} digits={2} onChange={(v) => update({ height: v })} />
          </div>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-bone/10 py-4">
            <Metric k="Along-track Δ" v={`${a.along.toFixed(1)} mm`} note="v ÷ f" />
            <Metric k="Across-track Δ · x = 0" v={`${a.c0.toFixed(1)} mm`} />
            <Metric k="Across-track Δ · x = 1 m" v={`${a.c1.toFixed(1)} mm`} />
            <Metric k="Across-track Δ · x = 2 m" v={`${a.c2.toFixed(1)} mm`} />
            <Metric
              k={`Usable swath (Δ ≤ ${LIMIT_MM} mm)`}
              v={a.swath > 0 ? `± ${a.swath.toFixed(2)} m` : "none"}
              accent
              note={a.along > LIMIT_MM ? "along-track gap too large" : undefined}
            />
            <Metric k="Points / second" v={pps ? pps.toLocaleString("en-US") : "—"} note={stats ? `${stats.raysPerScan} per scan` : undefined} />
          </dl>

          <div>
            <p className="label mb-2.5 flex items-center justify-between">
              <span>Obstacle check</span>
              <span className="text-bone-mute">Returns on target</span>
            </p>
            <ul className="divide-y divide-bone/10 border-y border-bone/10">
              {OBSTACLES.map((o, i) => {
                const n = stats?.hits[i] ?? 0;
                // Only judge once the scan has finished — partial counts would flash a misleading "Missed".
                const c = stats?.done ? chip(n) : { t: "Scanning", c: "border-bone/20 text-bone-mute" };
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="flex items-baseline gap-2.5">
                      <span className="h-display text-base">{o.label}</span>
                      <span className="label">x {o.x.toFixed(2)} m</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="mono tnum text-[0.8rem]">{n.toLocaleString("en-US")}</span>
                      <span className={`label w-[5.4rem] border px-2 py-1 text-center !text-inherit ${c.c}`}>{c.t}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <p className="label border-t border-bone/10 px-4 py-3 !leading-relaxed md:px-5">
        270° field of view · 20 m range gate · scan plane perpendicular to travel. Spacing along-track = v ÷ f; across-track
        ≈ H·Δθ ÷ sin β · (1 + (x·sin β ÷ H)²). “Resolved” ≥ 15 returns, “marginal” 6–14 — illustrative thresholds.
      </p>
    </div>
  );
}

function Slider({
  label, unit, min, max, step, value, digits, onChange,
}: {
  label: string; unit: string; min: number; max: number; step: number; value: number; digits: number; onChange: (v: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="mb-0.5 flex items-baseline justify-between">
        <span className="label">{label}</span>
        <span className="mono tnum text-[0.82rem] text-bone">
          {value.toFixed(digits)} <span className="text-bone-mute">{unit}</span>
        </span>
      </span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${fill}%` } as CSSProperties}
      />
    </label>
  );
}

function Metric({ k, v, note, accent }: { k: string; v: string; note?: string; accent?: boolean }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className={`mono tnum mt-0.5 text-[0.95rem] ${accent ? "text-laser" : "text-bone"}`}>
        {v}
        {note && <span className="label ml-2 normal-case tracking-normal !text-bone-mute">{note}</span>}
      </dd>
    </div>
  );
}
