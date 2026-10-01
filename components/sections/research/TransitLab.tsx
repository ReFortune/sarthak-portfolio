"use client";

import { useEffect, useRef, useState } from "react";
import { FLUX, FIT, FIT_STEP, TRANSIT_FRAMES } from "@/data/transitCurve";
import { research } from "@/data/research";
import { clamp, lerp } from "@/lib/math";

const N = TRANSIT_FRAMES;
const C = research.paper.contacts; // 100 / 250 / 550 / 670
const R_STAR_KM = 0.75 * 696340; // the paper's adopted stellar radius
const RP = research.numbers.radiusKm / R_STAR_KM; // planet / star radius ratio (≈ 0.132)

/** Planet centre (in stellar radii, central chord) at a given frame, from the four contact points. */
function planetX(f: number) {
  const slope = (2 * RP) / (C.ingressEnd - C.ingressStart); // ingress rate
  if (f <= C.ingressEnd) return -(1 + RP) + (f - C.ingressStart) * slope;
  if (f <= C.egressStart) return lerp(-(1 - RP), 1 - RP, (f - C.ingressEnd) / (C.egressStart - C.ingressEnd));
  const s2 = (2 * RP) / (C.egressEnd - C.egressStart);
  return 1 - RP + (f - C.egressStart) * s2;
}
function fitAt(f: number) {
  const i = f / FIT_STEP;
  const a = Math.floor(i), b = Math.min(FIT.length - 1, a + 1);
  return lerp(FIT[a], FIT[b], i - a);
}
const phase = (f: number) =>
  f < C.ingressStart ? "Out of transit · pre-ingress" : f < C.ingressEnd ? "Ingress" : f <= C.egressStart ? "In transit" : f <= C.egressEnd ? "Egress" : "Out of transit · post-egress";
const clock = (f: number) => {
  const s = Math.round(f * research.numbers.exposureSeconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

export default function TransitLab() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLCanvasElement>(null);
  const chart = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(40);
  const playing = useRef(true);
  const [playingUI, setPlayingUI] = useState(true);
  const [f, setF] = useState(40);

  useEffect(() => {
    const cs = stage.current!, cc = chart.current!, rootEl = root.current!;
    const sx = cs.getContext("2d")!, cx = cc.getContext("2d")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1, sw = 1, sh = 1, cw = 1, ch = 1, raf = 0, last = performance.now(), visible = true, lastUI = 0;

    const drawStage = (f: number) => {
      sx.clearRect(0, 0, sw, sh);
      const R = Math.min(sh * 0.38, sw * 0.2);
      const x0 = sw * 0.5, y0 = sh * 0.52;
      // corona
      const glow = sx.createRadialGradient(x0, y0, R * 0.9, x0, y0, R * 2.6);
      glow.addColorStop(0, "rgba(255,150,80,0.30)"); glow.addColorStop(1, "rgba(255,150,80,0)");
      sx.fillStyle = glow; sx.fillRect(0, 0, sw, sh);
      // star disc with limb darkening (a K-dwarf: warm)
      const g = sx.createRadialGradient(x0, y0, 0, x0, y0, R);
      g.addColorStop(0, "rgb(255,226,176)"); g.addColorStop(0.62, "rgb(255,176,104)"); g.addColorStop(0.93, "rgb(214,110,50)"); g.addColorStop(1, "rgb(150,62,28)");
      sx.fillStyle = g; sx.beginPath(); sx.arc(x0, y0, R, 0, Math.PI * 2); sx.fill();
      // planet
      const px = x0 + planetX(f) * R, rp = RP * R;
      sx.fillStyle = "rgb(4,5,9)"; sx.beginPath(); sx.arc(px, y0, rp, 0, Math.PI * 2); sx.fill();
      sx.strokeStyle = "rgba(236,231,219,0.35)"; sx.lineWidth = 1; sx.beginPath(); sx.arc(px, y0, rp + 0.5, 0, Math.PI * 2); sx.stroke();
      // chord guide
      sx.strokeStyle = "rgba(236,231,219,0.10)"; sx.setLineDash([3, 5]);
      sx.beginPath(); sx.moveTo(sw * 0.06, y0); sx.lineTo(sw * 0.94, y0); sx.stroke(); sx.setLineDash([]);
      // scale bar: Jupiter radius for context (0.989 R_J planet)
      sx.fillStyle = "rgba(163,160,148,0.9)"; sx.font = "10px var(--font-mono), monospace"; sx.textAlign = "left";
      sx.fillText("HAT-P-18 · K2 dwarf", sw * 0.06, sh * 0.1);
      sx.fillText("b · planet", px - rp, y0 + rp + 16);
    };

    const drawChart = (f: number) => {
      const L = 50, Rm = 14, T = 16, B = 30;
      const w = cw - L - Rm, h = ch - T - B;
      const y0 = 0.9625, y1 = 1.0125;
      const X = (i: number) => L + (i / (N - 1)) * w;
      const Y = (v: number) => T + h - ((v - y0) / (y1 - y0)) * h;
      cx.clearRect(0, 0, cw, ch);
      // phase bands
      cx.fillStyle = "rgba(255,91,46,0.07)";
      cx.fillRect(X(C.ingressStart), T, X(C.ingressEnd) - X(C.ingressStart), h);
      cx.fillRect(X(C.egressStart), T, X(C.egressEnd) - X(C.egressStart), h);
      // grid
      cx.strokeStyle = "rgba(236,231,219,0.08)"; cx.lineWidth = 1;
      cx.font = "10px var(--font-mono), monospace"; cx.fillStyle = "rgba(163,160,148,0.9)"; cx.textAlign = "right";
      for (const v of [0.97, 0.98, 0.99, 1.0, 1.01]) { cx.beginPath(); cx.moveTo(L, Y(v)); cx.lineTo(L + w, Y(v)); cx.stroke(); cx.fillText(v.toFixed(2), L - 7, Y(v) + 3); }
      cx.textAlign = "center";
      for (const i of [0, 100, 200, 300, 400, 500, 600, 700]) { cx.beginPath(); cx.moveTo(X(i), T); cx.lineTo(X(i), T + h); cx.stroke(); cx.fillText(String(i), X(i), T + h + 15); }
      cx.textAlign = "left"; cx.fillText("frame", L + w - 30, T + h + 27);
      cx.save(); cx.translate(12, T + h / 2); cx.rotate(-Math.PI / 2); cx.textAlign = "center"; cx.fillText("normalised flux", 0, 0); cx.restore();
      // contact markers
      cx.strokeStyle = "rgba(255,91,46,0.4)"; cx.setLineDash([3, 4]);
      [C.ingressStart, C.ingressEnd, C.egressStart, C.egressEnd].forEach((i) => { cx.beginPath(); cx.moveTo(X(i), T); cx.lineTo(X(i), T + h); cx.stroke(); });
      cx.setLineDash([]);
      cx.fillStyle = "rgba(255,91,46,0.85)"; cx.textAlign = "center";
      cx.fillText("INGRESS", X((C.ingressStart + C.ingressEnd) / 2), T + 11);
      cx.fillText("EGRESS", X((C.egressStart + C.egressEnd) / 2), T + 11);
      // data points: revealed ones bright, the rest faint
      for (let i = 0; i < N; i++) {
        cx.fillStyle = i <= f ? "rgba(169,216,255,0.95)" : "rgba(169,216,255,0.16)";
        cx.fillRect(X(i) - 0.9, Y(FLUX[i]) - 0.9, 1.8, 1.8);
      }
      // paper's best-fit
      cx.strokeStyle = "rgb(255,120,80)"; cx.lineWidth = 1.8; cx.beginPath();
      for (let i = 0; i < FIT.length; i++) { const x = X(i * FIT_STEP), y = Y(FIT[i]); i ? cx.lineTo(x, y) : cx.moveTo(x, y); }
      cx.stroke();
      // depth bracket
      const bx = X(410);
      cx.strokeStyle = "rgba(236,231,219,0.85)"; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(bx, Y(1.0)); cx.lineTo(bx, Y(0.983)); cx.moveTo(bx - 5, Y(1.0)); cx.lineTo(bx + 5, Y(1.0)); cx.moveTo(bx - 5, Y(0.983)); cx.lineTo(bx + 5, Y(0.983)); cx.stroke();
      cx.fillStyle = "rgb(236,231,219)"; cx.textAlign = "left"; cx.fillText("depth 1.7 %", bx + 9, Y(0.9915) + 3);
      // cursor
      cx.strokeStyle = "rgb(236,231,219)"; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(X(f), T); cx.lineTo(X(f), T + h); cx.stroke();
      cx.fillStyle = "rgb(255,91,46)"; cx.beginPath(); cx.arc(X(f), Y(fitAt(f)), 4, 0, Math.PI * 2); cx.fill();
    };

    const render = () => { drawStage(frameRef.current); drawChart(frameRef.current); };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const a = cs.getBoundingClientRect(), b = cc.getBoundingClientRect();
      sw = Math.max(1, a.width); sh = Math.max(1, a.height); cw = Math.max(1, b.width); ch = Math.max(1, b.height);
      cs.width = sw * dpr; cs.height = sh * dpr; cc.width = cw * dpr; cc.height = ch * dpr;
      sx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      if (playing.current) {
        frameRef.current += dt * 62;
        if (frameRef.current > N - 1) frameRef.current = 0;
        render();
        if (now - lastUI > 60) { lastUI = now; setF(Math.round(frameRef.current)); }
      }
    };

    const ro = new ResizeObserver(resize); ro.observe(cs); ro.observe(cc);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "60px" });
    io.observe(rootEl);
    resize();
    if (reduced) { playing.current = false; setPlayingUI(false); frameRef.current = 330; render(); setF(330); }
    else raf = requestAnimationFrame(tick);
    (rootEl as HTMLElement & { __render?: () => void }).__render = render;
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  const scrub = (v: number) => {
    playing.current = false; setPlayingUI(false);
    frameRef.current = v; setF(v);
    (root.current as (HTMLElement & { __render?: () => void }) | null)?.__render?.();
  };
  const toggle = () => { playing.current = !playing.current; setPlayingUI(playing.current); };

  const flux = FLUX[clamp(f, 0, N - 1)];
  const fill = (f / (N - 1)) * 100;

  return (
    <div ref={root} className="window ticks">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-bone/10 px-4 py-3 md:px-5">
        <p className="label label-strong flex items-center gap-2.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1.2s_infinite]" />
          Transit lab · HAT-P-18 b
        </p>
        <p className="label hidden sm:block">Re-plotted from Fig. 6.1 of the paper · 706 frames × 30 s</p>
      </div>

      <div className="relative bg-ink-2">
        <canvas ref={stage} className="block h-[15rem] w-full sm:h-[17rem]" role="img" aria-label="A planet silhouette crossing the face of a star during transit" />
        <dl className="pointer-events-none absolute right-4 top-4 space-y-2 text-right">
          <div><dt className="label">Frame</dt><dd className="h-display text-[1.5rem] leading-none tnum">{String(f + 1).padStart(3, "0")}<span className="serif text-[0.6em] text-bone-dim"> / {N}</span></dd></div>
          <div><dt className="label">Elapsed</dt><dd className="mono tnum text-[0.85rem]">T+ {clock(f)}</dd></div>
          <div><dt className="label">Flux</dt><dd className="mono tnum text-[0.85rem] text-laser">{flux.toFixed(4)}</dd></div>
        </dl>
        <p className="label pointer-events-none absolute bottom-3 left-4 !text-bone">{phase(f)}</p>
      </div>

      <canvas ref={chart} className="block h-[14rem] w-full border-t border-bone/10 sm:h-[15.5rem]" role="img" aria-label="Light curve: normalised flux against frame number with the transit dip" />

      <div className="flex items-center gap-4 border-t border-bone/10 px-4 py-3 md:px-5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playingUI ? "Pause" : "Play"}
          className="grid h-9 w-9 shrink-0 place-items-center border border-bone/25 font-mono text-xs transition-colors hover:border-bone hover:bg-bone hover:text-ink"
        >
          {playingUI ? "❚❚" : "▶"}
        </button>
        <label className="flex flex-1 items-center gap-4">
          <span className="label hidden sm:block">Scrub</span>
          <input
            type="range"
            className="slider"
            min={0}
            max={N - 1}
            step={1}
            value={f}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label="Scrub through the 706 observation frames"
            style={{ ["--fill" as string]: `${fill}%` }}
          />
        </label>
      </div>
    </div>
  );
}
