"use client";

import { useRef, useState } from "react";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

/* ═══ NOVA · random-vibration PSD profile (Table 3 of the report) ═══════════════════════════ */

const PSD: [number, number][] = [
  [0, 0.01], [20, 0.01], [40, 0.02], [80, 0.04], [160, 0.04], [320, 0.04], [500, 0.04], [1000, 0.03], [2000, 0.01],
];
/** Trapezoidal integration of the table (linear in f) → overall g_rms. */
const GRMS = Math.sqrt(PSD.slice(1).reduce((s, [f, p], i) => s + ((PSD[i][1] + p) / 2) * (f - PSD[i][0]), 0));

export function PsdChart() {
  const root = useRef<SVGSVGElement>(null);
  const W = 720, H = 330, L = 62, R = 18, T = 22, B = 46;
  const x = (f: number) => L + (f / 2000) * (W - L - R);
  const y = (v: number) => T + (1 - v / 0.05) * (H - T - B);
  const line = PSD.map(([f, p], i) => `${i ? "L" : "M"}${x(f).toFixed(1)} ${y(p).toFixed(1)}`).join("");
  const area = `${line}L${x(2000).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z`;

  useGsap(root as never, ({ motion }) => {
    if (!motion) return;
    const path = root.current!.querySelector("[data-line]");
    const fill = root.current!.querySelector("[data-fill]");
    const dots = root.current!.querySelectorAll("[data-pt]");
    gsap.set(path, { drawSVG: "0%" });
    gsap.set(fill, { opacity: 0 });
    gsap.set(dots, { scale: 0, transformOrigin: "50% 50%" });
    gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 78%", once: true } })
      .to(path, { drawSVG: "100%", duration: 1.8, ease: "power2.inOut" })
      .to(fill, { opacity: 1, duration: 1 }, "-=0.8")
      .to(dots, { scale: 1, duration: 0.5, stagger: 0.06, ease: "back.out(2)" }, "-=1.4");
  }, []);

  return (
    <figure>
      <svg ref={root} viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Power spectral density against frequency from 0 to 2000 hertz, peaking at 0.04 g squared per hertz between 80 and 500 hertz">
        <defs>
          <linearGradient id="psd-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(255 91 46)" stopOpacity="0.35" />
            <stop offset="1" stopColor="rgb(255 91 46)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.01, 0.02, 0.03, 0.04, 0.05].map((v) => (
          <g key={v}>
            <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke="rgb(236 231 219)" strokeOpacity={v === 0 ? 0.35 : 0.08} />
            <text x={L - 10} y={y(v) + 3.5} textAnchor="end" fill="rgb(163 160 148)" fontFamily="var(--font-mono)" fontSize="10.5">{v.toFixed(2)}</text>
          </g>
        ))}
        {[0, 500, 1000, 1500, 2000].map((f) => (
          <g key={f}>
            <line x1={x(f)} y1={T} x2={x(f)} y2={H - B} stroke="rgb(236 231 219)" strokeOpacity="0.06" />
            <text x={x(f)} y={H - B + 18} textAnchor="middle" fill="rgb(163 160 148)" fontFamily="var(--font-mono)" fontSize="10.5">{f}</text>
          </g>
        ))}
        <text x={W - R} y={H - 8} textAnchor="end" fill="rgb(163 160 148)" fontFamily="var(--font-mono)" fontSize="10.5" letterSpacing="1">FREQUENCY (Hz)</text>
        <text x={12} y={T - 6} fill="rgb(163 160 148)" fontFamily="var(--font-mono)" fontSize="10.5" letterSpacing="1">PSD (g²/Hz)</text>
        <path data-fill d={area} fill="url(#psd-fill)" />
        <path data-line d={line} fill="none" stroke="rgb(255 120 80)" strokeWidth="2.2" strokeLinejoin="round" />
        {PSD.map(([f, p]) => (
          <circle key={f} data-pt cx={x(f)} cy={y(p)} r="3.6" fill="rgb(11 13 19)" stroke="rgb(255 120 80)" strokeWidth="1.6" />
        ))}
        <g fontFamily="var(--font-mono)" fontSize="10.5" fill="rgb(236 231 219)">
          <line x1={x(80)} y1={y(0.04) - 10} x2={x(500)} y2={y(0.04) - 10} stroke="rgb(236 231 219)" strokeOpacity="0.6" />
          <text x={(x(80) + x(500)) / 2} y={y(0.04) - 18} textAnchor="middle" letterSpacing="1">PLATEAU 0.04 g²/Hz · 80–500 Hz</text>
        </g>
      </svg>
      <figcaption className="label mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 !normal-case !tracking-normal">
        <span>The report’s table: 0–2000 Hz profile, applied with a 10 G load case.</span>
        <span className="tnum">≈ {GRMS.toFixed(1)} g RMS overall (trapezoidal integration of the table)</span>
      </figcaption>
    </figure>
  );
}

/* ═══ NOVA · power budget ═══════════════════════════════════════════════════════════════════ */

export function PowerBudget() {
  const root = useRef<HTMLDivElement>(null);
  const BUDGET = 4;
  const parts = [
    { k: "BeagleBone Black Industrial", w: 2.3, c: "bg-ice" },
    { k: "ZWO ASI120MM Mini camera", w: 1.5, c: "bg-bone/80" },
  ];
  useGsap(root, ({ motion }) => {
    if (!motion) return;
    gsap.from(root.current!.querySelectorAll("[data-seg]"), {
      scaleX: 0, transformOrigin: "0% 50%", duration: 1.4, stagger: 0.18, ease: "expo.out",
      scrollTrigger: { trigger: root.current, start: "top 82%", once: true },
    });
  }, []);
  return (
    <div ref={root}>
      <div className="relative h-14 bg-bone/[0.07]">
        <div className="absolute inset-y-0 left-0 flex" style={{ width: `${((parts[0].w + parts[1].w) / BUDGET) * 100}%` }}>
          {parts.map((p) => (
            <span key={p.k} data-seg className={`${p.c} block h-full`} style={{ width: `${(p.w / (parts[0].w + parts[1].w)) * 100}%` }} />
          ))}
        </div>
        {/* 3.7 W held peak */}
        <span className="absolute inset-y-[-10px] w-px bg-laser" style={{ left: `${(3.7 / BUDGET) * 100}%` }}>
          <span className="label absolute -top-6 left-2 whitespace-nowrap !text-laser">3.7 W held peak</span>
        </span>
        {/* 4 W budget */}
        <span className="absolute inset-y-[-10px] right-0 w-px bg-bone">
          <span className="label absolute -top-6 right-0 whitespace-nowrap !text-bone">4 W budget</span>
        </span>
      </div>
      <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-2">
        {parts.map((p) => (
          <li key={p.k} className="label flex items-center gap-2.5">
            <span className={`inline-block h-2.5 w-2.5 ${p.c}`} />
            {p.k} · ≈ {p.w} W
          </li>
        ))}
      </ul>
      <p className="label mt-4 !normal-case !tracking-normal">
        Design estimate from datasheets (report): ≈ 3.8 W. Final: disabling unused BeagleBone peripherals and retuning exposure
        rates held the peak at 3.7 W on a 5 V rail over more than 15 hours of continuous operation, with zero image-data loss.
      </p>
    </div>
  );
}

/* ═══ ROUTE-M · cost breakdown ($750M theoretical budget, Table 12) ═══════════════════════ */

const COSTS = [
  { k: "Payload · HiRISE-derived imager ×2", v: 120, c: "rgb(255 91 46)" },
  { k: "Contingency / margin (~20%)", v: 120, c: "rgb(110 109 103)" },
  { k: "Spacecraft bus · orbiter 1", v: 115, c: "rgb(236 231 219)" },
  { k: "Spacecraft bus · orbiter 2", v: 100, c: "rgb(190 186 174)" },
  { k: "Propulsion ×2", v: 60, c: "rgb(169 216 255)" },
  { k: "Integration, test & QA", v: 60, c: "rgb(140 172 204)" },
  { k: "Project management & SE", v: 55, c: "rgb(236 231 219 / 0.55)" },
  { k: "Communications ×2", v: 45, c: "rgb(105 138 168)" },
  { k: "Mission operations (cruise + 7-yr mapping)", v: 30, c: "rgb(163 160 148)" },
  { k: "Onboard data handling ×2", v: 25, c: "rgb(90 110 130)" },
  { k: "Ground segment & data pipeline", v: 20, c: "rgb(130 128 120)" },
] as const;
const TOTAL = COSTS.reduce((s, c) => s + c.v, 0); // 750

export function CostDonut() {
  const root = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const R = 92, C = 2 * Math.PI * R;
  let acc = 0;

  useGsap(root, ({ motion }) => {
    if (!motion) return;
    gsap.from(root.current!.querySelectorAll("[data-arc]"), {
      strokeDasharray: (i: number, el: SVGElement) => `0 ${C}`,
      duration: 1.6, stagger: 0.07, ease: "expo.out",
      scrollTrigger: { trigger: root.current, start: "top 78%", once: true },
    });
  }, []);

  return (
    <div ref={root} className="grid items-center gap-10 md:grid-cols-[minmax(0,19rem)_1fr] md:gap-16">
      <div className="relative mx-auto aspect-square w-full max-w-[19rem]">
        <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90" role="img" aria-label="Donut chart of the 750 million dollar mission cost breakdown">
          {COSTS.map((c, i) => {
            const len = (c.v / TOTAL) * C;
            const el = (
              <circle
                key={c.k}
                data-arc
                cx="120" cy="120" r={R}
                fill="none"
                stroke={c.c}
                strokeWidth={hover === i ? 30 : 24}
                strokeDasharray={`${Math.max(0, len - 1.6)} ${C}`}
                strokeDashoffset={-acc}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: "stroke-width .3s", opacity: hover === null || hover === i ? 1 : 0.35 }}
              />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="label">{hover === null ? "Mission budget" : COSTS[hover].k.split(" ·")[0].replace(" ×2", "")}</p>
            <p className="h-display mt-2 text-[2.4rem] leading-none tnum">
              ${hover === null ? TOTAL : COSTS[hover].v}<span className="serif text-[0.5em] normal-case text-bone-dim">M</span>
            </p>
            {hover !== null && <p className="label mt-1.5 tnum">{((COSTS[hover].v / TOTAL) * 100).toFixed(1)}%</p>}
          </div>
        </div>
      </div>
      <ul className="divide-y divide-bone/10 border-y border-bone/10">
        {COSTS.map((c, i) => (
          <li
            key={c.k}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center justify-between gap-4 py-2.5 transition-opacity ${hover !== null && hover !== i ? "opacity-40" : ""}`}
          >
            <span className="flex items-center gap-3 text-[0.92rem] leading-tight">
              <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: c.c }} />
              {c.k}
            </span>
            <span className="mono tnum text-[0.85rem]">${c.v}M</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 py-3">
          <span className="label label-strong">Total · remaining budget $0M</span>
          <span className="mono tnum text-[0.85rem] text-laser">${TOTAL}M</span>
        </li>
      </ul>
    </div>
  );
}
