"use client";

import { useMemo, useState } from "react";
import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import { skillClusters } from "@/data/skills";
import PointerText from "@/components/ui/PointerText";
import { EDGES, STARS, type Align, type Star } from "@/data/constellation";

const byId = Object.fromEntries(STARS.map((s) => [s.id, s]));
const dust = Array.from({ length: 140 }, (_, i) => {
  const h = (n: number) => { let x = (i * 374761393 + n * 668265263) >>> 0; x = ((x ^ (x >>> 13)) * 1274126177) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  return { x: Math.round(h(1) * 10000) / 10, y: Math.round(h(2) * 6000) / 10, r: Math.round((0.5 + h(3) * 1.1) * 10) / 10, o: Math.round((0.12 + h(4) * 0.4) * 100) / 100 };
});

const labelPos: Record<Align, string> = {
  r: "translate(12px,-50%)",
  l: "translate(calc(-100% - 12px),-50%)",
  t: "translate(-50%,calc(-100% - 10px))",
  b: "translate(-50%,10px)",
};

export default function Toolkit() {
  const [cluster, setCluster] = useState<string | null>(null);
  const [skill, setSkill] = useState<string | null>(null);

  const lit = (clusters: string[]) => !cluster || clusters.includes(cluster);
  const edgeLit = (a: Star, b: Star) => !cluster || a.clusters.includes(cluster) && b.clusters.includes(cluster);

  const clusterOf = useMemo(() => Object.fromEntries(skillClusters.map((c) => [c.id, c])), []);

  return (
    <section id="toolkit" data-section="toolkit" className="relative py-16 md:py-36">
      <div className="wrap">
        <SectionHead
          n="06"
          label="Skills"
          title={
            <>
              Four disciplines, <span className="serif">one system</span>
            </>
          }
          lede="The tools I reach for, grouped the way a spacecraft is: model it, build it, process its data, and keep every requirement honest. STK sits in two of them."
        />

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          {/* ── cards ── */}
          <Reveal className="space-y-px bg-bone/10 lg:col-span-4" selector="[data-card]" stagger={0.08}>
            {skillClusters.map((c) => (
              <div
                key={c.id}
                data-card
                onMouseEnter={() => setCluster(c.id)}
                onMouseLeave={() => { setCluster(null); setSkill(null); }}
                onFocus={() => setCluster(c.id)}
                onBlur={() => setCluster(null)}
                className={`bg-ink p-5 transition-colors duration-500 ${cluster === c.id ? "!bg-ink-3" : ""}`}
              >
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <h3 className="h-title text-[1.25rem]">{c.name}</h3>
                  <span className="label tnum text-laser">{String(c.skills.length).padStart(2, "0")}</span>
                </div>
                <p className="serif mb-4 text-[1.05rem] leading-tight text-bone-dim">{c.blurb}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onMouseEnter={() => setSkill(s)}
                        onMouseLeave={() => setSkill(null)}
                        onFocus={() => setSkill(s)}
                        onBlur={() => setSkill(null)}
                        className={`chip transition-colors ${skill === s ? "!border-laser !text-laser" : ""}`}
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Reveal>

          {/* ── constellation ── */}
          <Reveal className="hidden lg:col-span-8 lg:block" y={50}>
            <div
              className="window ticks relative aspect-[5/3] select-none"
              aria-hidden="true"
              onMouseLeave={() => { setCluster(null); setSkill(null); }}
            >
              <svg viewBox="0 0 1000 600" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <defs>
                  <radialGradient id="tk-neb1" cx="0.25" cy="0.3" r="0.45">
                    <stop offset="0" stopColor="rgb(169 216 255)" stopOpacity="0.07" /><stop offset="1" stopColor="rgb(169 216 255)" stopOpacity="0" />
                  </radialGradient>
                  <radialGradient id="tk-neb2" cx="0.78" cy="0.72" r="0.45">
                    <stop offset="0" stopColor="rgb(255 91 46)" stopOpacity="0.06" /><stop offset="1" stopColor="rgb(255 91 46)" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="1000" height="600" fill="url(#tk-neb1)" />
                <rect width="1000" height="600" fill="url(#tk-neb2)" />
                {dust.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="rgb(207 230 255)" opacity={d.o} />)}

                {EDGES.map(([a, b]) => {
                  const A = byId[a], B = byId[b];
                  const on = edgeLit(A, B);
                  const hot = cluster && on;
                  return (
                    <line
                      key={a + b}
                      x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                      stroke={hot ? "rgb(255 91 46)" : "rgb(236 231 219)"}
                      strokeOpacity={on ? (hot ? 0.75 : 0.3) : 0.07}
                      strokeWidth={hot ? 1.4 : 1}
                      style={{ transition: "all .5s" }}
                    />
                  );
                })}

                {STARS.map((s, i) => {
                  const on = lit(s.clusters);
                  const focus = skill === s.id;
                  const shared = s.clusters.length > 1;
                  return (
                    <g key={s.id} style={{ transition: "opacity .5s", opacity: on ? 1 : 0.22 }}>
                      <circle cx={s.x} cy={s.y} r={focus ? 22 : shared ? 15 : 11} fill="rgb(255 91 46)" opacity={focus ? 0.28 : cluster && on ? 0.14 : 0.06} style={{ transition: "all .4s" }} />
                      <circle
                        cx={s.x} cy={s.y} r={focus ? 5.2 : shared ? 4.6 : 3.4}
                        fill={focus || (cluster && on) ? "rgb(255 120 80)" : "rgb(236 231 219)"}
                        className="tk-star"
                        style={{ animationDelay: `${(i % 9) * 0.41}s`, transition: "all .4s" }}
                      />
                      {shared && <circle cx={s.x} cy={s.y} r="9" fill="none" stroke="rgb(236 231 219)" strokeOpacity="0.5" strokeDasharray="2 3" />}
                    </g>
                  );
                })}
              </svg>

              {STARS.map((s) => {
                const on = lit(s.clusters);
                return (
                  <span
                    key={s.id}
                    className="absolute whitespace-nowrap font-mono text-[0.7rem] uppercase tracking-[0.08em] transition-[color,opacity] duration-500 xl:text-[0.72rem]"
                    style={{
                      left: `${s.x / 10}%`,
                      top: `${s.y / 6}%`,
                      transform: labelPos[s.a],
                      opacity: on ? 1 : 0.22,
                      color: skill === s.id || (cluster && on) ? "rgb(236 231 219)" : "rgb(163 160 148)",
                    }}
                  >
                    {s.label}
                  </span>
                );
              })}

              {/* cluster names */}
              {[
                { id: "sim", x: 4, y: 6, t: "01 · Simulation & CAD" },
                { id: "sw", x: 62, y: 6, t: "03 · Software & Analysis" },
                { id: "hw", x: 4, y: 57, t: "02 · Hardware & Fabrication" },
                { id: "sys", x: 62, y: 57, t: "04 · Systems Engineering" },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setCluster(c.id)}
                  className={`absolute font-mono text-[0.7rem] uppercase tracking-[0.12em] transition-colors ${cluster === c.id ? "text-laser" : "text-bone-mute"}`}
                  style={{ left: `${c.x}%`, top: `${c.y}%`, transform: "translateY(-50%)" }}
                >
                  {c.t}
                </button>
              ))}
            </div>
            <p className="label mt-3 flex justify-between gap-4">
              <span>{cluster ? `${clusterOf[cluster].name} — ${clusterOf[cluster].skills.length} skills` : <PointerText fine="Hover a constellation or a skill" coarse="Tap a constellation or a skill" />}</span>
              <span className="hidden xl:inline">Dashed ring = appears in two groups</span>
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
