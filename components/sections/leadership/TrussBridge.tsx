"use client";

import { useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

/* A Warren truss, side elevation, drawn for a 20 ft span (680 units → 34 units per foot). */
const X0 = 70, SPAN = 680, PANELS = 8, P = SPAN / PANELS;
const YB = 196, YT = 92; // bottom / top chord
type Seg = [number, number, number, number];

const bottom = Array.from({ length: PANELS + 1 }, (_, i) => [X0 + i * P, YB] as const);
const top = Array.from({ length: PANELS }, (_, i) => [X0 + P / 2 + i * P, YT] as const);

const segs: Seg[] = [];
for (let i = 0; i < PANELS; i++) segs.push([bottom[i][0], YB, bottom[i + 1][0], YB]); // bottom chord panels
for (let i = 0; i < PANELS - 1; i++) segs.push([top[i][0], YT, top[i + 1][0], YT]); // top chord panels
for (let i = 0; i < PANELS; i++) {
  segs.push([bottom[i][0], YB, top[i][0], YT]); // up-diagonal
  segs.push([top[i][0], YT, bottom[i + 1][0], YB]); // down-diagonal
}

const f1 = (n: number) => Math.round(n * 10) / 10;

/** Zig-zag lattice between two rails — the "triangular truss" member. */
function latticePath([x1, y1, x2, y2]: Seg, w = 7, step = 11) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const n = Math.max(2, Math.round(L / step));
  let d = "";
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * L, s = k % 2 ? 1 : -1;
    d += `${k ? "L" : "M"}${f1(x1 + ux * t + nx * (w / 2) * s)} ${f1(y1 + uy * t + ny * (w / 2) * s)}`;
  }
  return d;
}
const rails = ([x1, y1, x2, y2]: Seg, w = 7): string => {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  const o = w / 2;
  return `M${f1(x1 + nx * o)} ${f1(y1 + ny * o)}L${f1(x2 + nx * o)} ${f1(y2 + ny * o)}M${f1(x1 - nx * o)} ${f1(y1 - ny * o)}L${f1(x2 - nx * o)} ${f1(y2 - ny * o)}`;
};

export default function TrussBridge() {
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"flat" | "truss">("flat");

  /* draw the structure in once, in build order */
  useGsap(root, ({ motion }) => {
    if (!motion) return;
    const members = root.current!.querySelectorAll("[data-member]");
    const nodes = root.current!.querySelectorAll("[data-node]");
    gsap.set(members, { drawSVG: "0%" });
    gsap.set(nodes, { scale: 0, transformOrigin: "50% 50%" });
    const tl = gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 75%", once: true } });
    tl.to(members, { drawSVG: "100%", duration: 0.9, stagger: 0.045, ease: "power2.out" })
      .to(nodes, { scale: 1, duration: 0.5, stagger: 0.03, ease: "back.out(2.4)" }, "-=0.6");
  }, []);

  /* cross-fade member styles */
  useGsap(
    root,
    ({ motion }) => {
      const r = root.current!;
      const flat = r.querySelectorAll("[data-style='flat']");
      const truss = r.querySelectorAll("[data-style='truss']");
      const on = mode === "flat" ? flat : truss, off = mode === "flat" ? truss : flat;
      if (!motion) { gsap.set(on, { opacity: 1 }); gsap.set(off, { opacity: 0 }); return; }
      gsap.to(on, { opacity: 1, duration: 0.5 });
      gsap.to(off, { opacity: 0, duration: 0.4 });
    },
    [mode]
  );

  return (
    <div ref={root} className="window ticks">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bone/10 px-4 py-3 md:px-5">
        <p className="label label-strong">Competition steel bridge · side elevation</p>
        <div role="group" aria-label="Member type" className="flex">
          {(
            [
              ["flat", "Flat members"],
              ["truss", "Triangular-truss members"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={mode === k}
              onClick={() => setMode(k)}
              className={`label border px-3 py-1.5 transition-colors first:border-r-0 ${mode === k ? "border-laser bg-laser/10 !text-bone" : "border-bone/20 hover:border-bone/60"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative bg-ink-2 p-3 md:p-5">
        <svg viewBox="0 0 820 268" className="w-full" role="img" aria-label="Warren truss bridge spanning 20 feet, drawn with flat members or with experimental triangular-truss members">
          {/* abutments */}
          {[[20, 50], [750, 50]].map(([x, w], i) => (
            <g key={i}>
              <rect x={x} y={YB + 6} width={w} height="34" fill="none" stroke="rgb(236 231 219)" strokeOpacity="0.35" />
              {Array.from({ length: 6 }).map((_, k) => (
                <line key={k} x1={x + 4 + k * 8} y1={YB + 40} x2={x + 12 + k * 8} y2={YB + 30} stroke="rgb(236 231 219)" strokeOpacity="0.25" />
              ))}
            </g>
          ))}
          <line x1="10" y1={YB + 40} x2="810" y2={YB + 40} stroke="rgb(236 231 219)" strokeOpacity="0.3" />

          {/* members — flat */}
          <g data-style="flat">
            {segs.map((s, i) => (
              <line key={i} data-member x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} stroke="rgb(236 231 219)" strokeWidth="5" strokeLinecap="butt" strokeOpacity="0.85" />
            ))}
          </g>
          {/* members — triangular truss */}
          <g data-style="truss" opacity="0">
            {segs.map((s, i) => (
              <g key={i}>
                <path data-member d={rails(s)} fill="none" stroke="rgb(255 91 46)" strokeWidth="1.3" />
                <path data-member d={latticePath(s)} fill="none" stroke="rgb(236 231 219)" strokeWidth="0.9" strokeOpacity="0.9" />
              </g>
            ))}
          </g>

          {/* nodes */}
          {[...bottom, ...top].map(([x, y], i) => (
            <circle key={i} data-node cx={x} cy={y} r="5.5" fill="rgb(11 13 19)" stroke="rgb(255 91 46)" strokeWidth="1.6" />
          ))}

          {/* dimension line */}
          <g stroke="rgb(236 231 219)" strokeOpacity="0.6" fill="none">
            <line x1={X0} y1="256" x2={X0 + SPAN} y2="256" />
            <path d={`M${X0} 250v12M${X0 + SPAN} 250v12`} />
            <path d={`M${X0 + 8} 252l-8 4 8 4M${X0 + SPAN - 8} 252l8 4-8 4`} />
          </g>
          <rect x={X0 + SPAN / 2 - 34} y="247" width="68" height="18" fill="rgb(11 13 19)" />
          <text x={X0 + SPAN / 2} y="260" textAnchor="middle" fill="rgb(236 231 219)" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="1.5">20 FT</text>
        </svg>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <p className="label !normal-case !tracking-normal !leading-snug">
            {mode === "flat"
              ? "Traditional builds use flat members."
              : "Experimental: each member built as a triangular truss in place of a flat member."}
          </p>
          <svg width="150" height="34" viewBox="0 0 150 34" aria-hidden="true" className="shrink-0">
            <g fill="none" stroke="rgb(236 231 219)" strokeOpacity={mode === "flat" ? 1 : 0.3} style={{ transition: "stroke-opacity .4s" }}>
              <rect x="6" y="13" width="44" height="8" fill="rgb(236 231 219)" fillOpacity="0.25" />
              <text x="6" y="31" fill="rgb(163 160 148)" stroke="none" fontFamily="var(--font-mono)" fontSize="7.5" letterSpacing="1">FLAT</text>
            </g>
            <g fill="none" stroke="rgb(255 91 46)" strokeOpacity={mode === "truss" ? 1 : 0.3} style={{ transition: "stroke-opacity .4s" }}>
              <path d="M88 6 L112 6 L100 25 Z" />
              <path d="M94 6 L100 25 M106 6 L100 25 M91 12 L109 12" strokeWidth="0.8" />
              <text x="88" y="33" fill="rgb(163 160 148)" stroke="none" fontFamily="var(--font-mono)" fontSize="7.5" letterSpacing="1">TRUSS</text>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
