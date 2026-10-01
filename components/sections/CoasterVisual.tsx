"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coasterSubsystems } from "@/data/experience";

/* Two stylised roller-coaster profiles. The trains obey energy conservation:
   constant chain speed up the lift, then v = √(2g·Δh) on the way down. */

type Profile = { id: string; name: string; pts: [number, number][]; len: number[]; crestIdx: number; hMax: number };

const W = 1000;
const H = 150;

function gauss(x: number, c: number, s: number) {
  return Math.exp(-((x - c) * (x - c)) / (2 * s * s));
}

/** height(x) in [0,1] for a lift hill + big drop + camelback hills. */
function makeProfile(id: string, name: string, spec: { lift: [number, number]; hills: [number, number, number][]; amp: number }): Profile {
  const { lift, hills, amp } = spec;
  const pts: [number, number][] = [];
  const base = H - 14;
  let crestIdx = 0;
  let crestY = Infinity;
  for (let x = 24; x <= W - 24; x += 3) {
    let h = 0;
    if (x >= lift[0] && x <= lift[1]) {
      const t = (x - lift[0]) / (lift[1] - lift[0]);
      h = Math.pow(t, 1.05); // chain lift, almost linear
    } else if (x > lift[1]) {
      const t = (x - lift[1]) / 70;
      h = t < 1 ? 0.5 + 0.5 * Math.cos(Math.PI * t) : 0; // the drop
      h = Math.max(h, 0);
    }
    for (const [c, s, a] of hills) h += a * gauss(x, c, s);
    const y = Math.round((base - h * amp) * 10) / 10; // round: Math.exp/cos differ by an ulp across engines
    if (y < crestY) { crestY = y; crestIdx = pts.length; }
    pts.push([x, y]);
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { id, name, pts, len, crestIdx, hMax: base - crestY };
}

const PROFILES: Profile[] = [
  makeProfile("dragon", "Dragon Fyre", { lift: [120, 300], hills: [[520, 34, 0.34], [690, 40, 0.22], [830, 30, 0.12]], amp: 112 }),
  makeProfile("leviathan", "Leviathan", { lift: [80, 330], hills: [[500, 46, 0.46], [660, 38, 0.3], [790, 34, 0.2], [900, 24, 0.1]], amp: 118 }),
];

const pathD = (p: Profile) => p.pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");

export default function CoasterVisual() {
  const [hover, setHover] = useState<string | null>(null);
  const dots = useRef<(SVGGElement | null)[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  const d = useMemo(() => PROFILES.map(pathD), []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const state = PROFILES.map((p, i) => ({ s: (i * 0.4) * p.len[p.len.length - 1] * 0.2, v: 0 }));
    let raf = 0;
    let last = performance.now();
    let visible = true;

    const pointAt = (p: Profile, s: number): [number, number, number] => {
      const total = p.len[p.len.length - 1];
      const t = ((s % total) + total) % total;
      // binary search the arc-length table
      let lo = 0, hi = p.len.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.len[m] <= t) lo = m; else hi = m; }
      const k = (t - p.len[lo]) / Math.max(1e-6, p.len[hi] - p.len[lo]);
      const x = p.pts[lo][0] + (p.pts[hi][0] - p.pts[lo][0]) * k;
      const y = p.pts[lo][1] + (p.pts[hi][1] - p.pts[lo][1]) * k;
      const ang = Math.atan2(p.pts[hi][1] - p.pts[lo][1], p.pts[hi][0] - p.pts[lo][0]);
      return [x, y, ang];
    };

    const place = () => {
      PROFILES.forEach((p, i) => {
        const g = dots.current[i];
        if (!g) return;
        const [x, y, a] = pointAt(p, state[i].s);
        g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((a * 180) / Math.PI).toFixed(1)})`);
      });
    };
    place();
    if (reduced) return;

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "100px" });
    if (svgRef.current) io.observe(svgRef.current);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!visible) return;
      PROFILES.forEach((p, i) => {
        const st = state[i];
        const [, y] = pointAt(p, st.s);
        const crestS = p.len[p.crestIdx];
        const total = p.len[p.len.length - 1];
        const sMod = ((st.s % total) + total) % total;
        let v: number;
        if (sMod < crestS) v = 34; // chain lift: constant speed
        else v = Math.max(22, Math.sqrt(2 * 9000 * Math.max(0, y - (H - 14 - p.hMax))) * 0.42 + 22); // free roll
        // a gentle brake run at the end so the train never teleports
        st.v += (v - st.v) * Math.min(1, dt * 6);
        st.s += st.v * dt * 1.6;
      });
      place();
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const on = (k: string) => hover === k;

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H * 2 + 50}`}
        role="img"
        aria-label="Schematic side profiles of the Dragon Fyre and Leviathan roller coasters with their lift chain, restraints and hydraulics"
        className="w-full"
      >
        {PROFILES.map((p, i) => {
          const oy = i * (H + 50);
          return (
            <g key={p.id} transform={`translate(0 ${oy})`}>
              {/* supports */}
              {p.pts.filter((_, k) => k % 7 === 0).map(([x, y], k) => (
                <line key={k} x1={x} y1={(y + 2).toFixed(1)} x2={x} y2={H - 14} stroke="rgb(236 231 219)" strokeOpacity="0.09" />
              ))}
              {/* ground */}
              <line x1="12" y1={H - 13} x2={W - 12} y2={H - 13} stroke="rgb(236 231 219)" strokeOpacity="0.25" />
              {Array.from({ length: 40 }).map((_, k) => (
                <line key={k} x1={24 + k * 24.5} y1={H - 13} x2={24 + k * 24.5} y2={H - 8} stroke="rgb(236 231 219)" strokeOpacity="0.2" />
              ))}
              {/* the track */}
              <path d={d[i]} fill="none" stroke="rgb(236 231 219)" strokeWidth="2" strokeLinejoin="round" />
              {/* lift chain highlight */}
              <path
                d={p.pts.slice(0, p.crestIdx + 1).filter((_, k) => k > 6).map(([x, y], k) => `${k ? "L" : "M"}${x} ${(y - 5).toFixed(1)}`).join("")}
                fill="none"
                stroke="rgb(255 91 46)"
                strokeWidth={on("Lift chain") ? 2.4 : 1}
                strokeDasharray="3 4"
                opacity={on("Lift chain") ? 1 : 0.45}
                style={{ transition: "all .4s" }}
              />
              {/* station + hydraulics glyph */}
              <g opacity={on("Hydraulics") ? 1 : 0.45} style={{ transition: "opacity .4s" }}>
                <rect x="34" y={H - 40} width="46" height="26" fill="none" stroke="rgb(255 91 46)" strokeWidth={on("Hydraulics") ? 1.8 : 1} />
                <line x1="44" y1={H - 34} x2="44" y2={H - 20} stroke="rgb(255 91 46)" />
                <line x1="44" y1={H - 27} x2="68" y2={H - 27} stroke="rgb(255 91 46)" strokeWidth="3" />
              </g>
              {/* train */}
              <g
                ref={(el) => { dots.current[i] = el; }}
                style={{ transition: "filter .3s" }}
                filter={on("Lap bars") || on("Shoulder restraints") ? "drop-shadow(0 0 6px rgb(255 91 46))" : undefined}
              >
                <rect x="-16" y="-9" width="32" height="8" rx="2" fill="rgb(236 231 219)" />
                <rect x="-10" y="-14" width="6" height="6" fill="rgb(255 91 46)" opacity={on("Shoulder restraints") ? 1 : 0.65} />
                <rect x="2" y="-14" width="6" height="6" fill="rgb(255 91 46)" opacity={on("Lap bars") ? 1 : 0.65} />
              </g>
              <text x="34" y="14" fill="rgb(236 231 219)" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="1.4">
                {p.name.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="mt-5 flex flex-wrap gap-2" aria-label="Diagnosed subsystems">
        {coasterSubsystems.map((s) => (
          <li key={s}>
            <button
              type="button"
              onMouseEnter={() => setHover(s)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s)}
              onBlur={() => setHover(null)}
              className={`chip transition-colors ${on(s) ? "!border-laser !text-laser" : ""}`}
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
