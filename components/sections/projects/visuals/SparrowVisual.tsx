"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "@/lib/gsap";

type Kind = "lidar" | "stereo" | "mono";
const KINDS: { id: Kind; label: string; note: string }[] = [
  { id: "lidar", label: "LiDAR", note: "Planar 360° scan — ranging for navigation & landing" },
  { id: "stereo", label: "Stereo camera", note: "Two overlapping views — depth from disparity" },
  { id: "mono", label: "Monocular camera", note: "Single view — lightweight visual odometry" },
];

const CX = 330; // mast centre
const PLATE_Y = 176;

/** The sensor-agnostic mast interface: one plate, three interchangeable payloads. */
export default function SparrowVisual() {
  const root = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<Kind>("lidar");
  const auto = useRef(true);
  const prev = useRef<Kind | null>(null);

  /* swap animation */
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mod = (k: Kind) => svg.querySelector<SVGGElement>(`[data-module="${k}"]`)!;
    const fov = (k: Kind) => svg.querySelector<SVGGElement>(`[data-fov="${k}"]`)!;
    const from = prev.current;
    prev.current = active;

    if (reduced || !from) {
      (["lidar", "stereo", "mono"] as Kind[]).forEach((k) => {
        gsap.set(mod(k), { autoAlpha: k === active ? 1 : 0, y: 0 });
        gsap.set(fov(k), { autoAlpha: k === active ? 1 : 0 });
      });
      return;
    }
    const tl = gsap.timeline();
    tl.to(mod(from), { y: -46, autoAlpha: 0, duration: 0.42, ease: "power3.in" }, 0)
      .to(fov(from), { autoAlpha: 0, duration: 0.3 }, 0)
      .fromTo(mod(active), { y: -58, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.85, ease: "bounce.out" }, 0.4)
      .fromTo(fov(active), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0.75);
    return () => { tl.kill(); };
  }, [active]);

  /* gentle auto-cycle until the visitor takes control */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      if (!auto.current) return;
      setActive((a) => (a === "lidar" ? "stereo" : a === "stereo" ? "mono" : "lidar"));
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const pick = (k: Kind) => { auto.current = false; setActive(k); };
  const note = KINDS.find((k) => k.id === active)!.note;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative min-h-0 flex-1" data-cursor="default">
        <svg
          ref={root}
          viewBox="0 52 660 290"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="Side view of the Sparrow rover with a mast mount plate that accepts a LiDAR, a stereo camera or a monocular camera"
        >
          <defs>
            <linearGradient id="sp-fov" x1="0" x2="1">
              <stop offset="0" stopColor="rgb(255 91 46)" stopOpacity="0.4" />
              <stop offset="1" stopColor="rgb(255 91 46)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sp-fov2" x1="0" x2="1">
              <stop offset="0" stopColor="rgb(169 216 255)" stopOpacity="0.4" />
              <stop offset="1" stopColor="rgb(169 216 255)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* ground */}
          <line x1="20" y1="316" x2="640" y2="316" stroke="rgb(236 231 219)" strokeOpacity="0.3" />
          {Array.from({ length: 26 }).map((_, i) => (
            <line key={i} x1={28 + i * 24.5} y1="316" x2={20 + i * 24.5} y2="324" stroke="rgb(236 231 219)" strokeOpacity="0.18" />
          ))}

          {/* field of view (per sensor) */}
          <g data-fov="lidar" opacity="0">
            <ellipse cx={CX} cy={150} rx="290" ry="20" fill="url(#sp-fov)" stroke="rgb(255 91 46)" strokeOpacity="0.5" strokeDasharray="3 5" />
            {[-1, 1].map((s) => (
              <line key={s} x1={CX} y1={150} x2={CX + s * 290} y2={150 + (s > 0 ? 6 : 6)} stroke="rgb(255 91 46)" strokeOpacity="0.5" />
            ))}
            <text x={CX + 150} y={120} fill="rgb(255 91 46)" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1.5">360° PLANE</text>
          </g>
          <g data-fov="stereo" opacity="0">
            <polygon points={`${CX - 18},150 ${CX + 290},${150 - 150} ${CX + 290},${150 + 40}`} fill="url(#sp-fov2)" />
            <polygon points={`${CX + 18},150 ${CX + 290},${150 - 40} ${CX + 290},${150 + 150}`} fill="url(#sp-fov)" />
            <text x={CX + 150} y={110} fill="rgb(236 231 219)" fillOpacity="0.85" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1.5">OVERLAP → DEPTH</text>
          </g>
          <g data-fov="mono" opacity="0">
            <polygon points={`${CX},150 ${CX + 290},${150 - 110} ${CX + 290},${150 + 110}`} fill="url(#sp-fov)" />
            <text x={CX + 170} y={150} fill="rgb(236 231 219)" fillOpacity="0.85" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1.5">SINGLE VIEW</text>
          </g>

          {/* rover */}
          <g stroke="rgb(236 231 219)" strokeWidth="1.6" fill="none">
            {/* rocker arms */}
            <path d="M210 300 L250 268 L330 268 M450 300 L410 268 L330 268" strokeOpacity="0.55" />
            <rect x="196" y="248" width="268" height="34" rx="8" fill="rgb(11 13 19)" />
            <rect x="214" y="256" width="56" height="18" rx="3" strokeOpacity="0.5" />
            <rect x="388" y="256" width="56" height="18" rx="3" strokeOpacity="0.5" />
            {[210, 450].map((x) => (
              <g key={x}>
                <circle cx={x} cy={296} r="26" fill="rgb(11 13 19)" />
                <circle cx={x} cy={296} r="9" strokeOpacity="0.6" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <line key={i} x1={x + 10 * Math.cos((i * Math.PI) / 4)} y1={296 + 10 * Math.sin((i * Math.PI) / 4)} x2={x + 25 * Math.cos((i * Math.PI) / 4)} y2={296 + 25 * Math.sin((i * Math.PI) / 4)} strokeOpacity="0.35" />
                ))}
              </g>
            ))}
            {/* mast */}
            <line x1={CX} y1="248" x2={CX} y2={PLATE_Y} strokeWidth="3" />
            {/* the standard interface plate */}
            <rect x={CX - 40} y={PLATE_Y} width="80" height="8" fill="rgb(236 231 219)" />
            {[-30, -10, 10, 30].map((dx) => (
              <circle key={dx} cx={CX + dx} cy={PLATE_Y + 4} r="1.6" fill="rgb(11 13 19)" stroke="none" />
            ))}
          </g>

          {/* interface callout */}
          <g fontFamily="var(--font-mono)" fontSize="9.5" letterSpacing="1.4" fill="rgb(163 160 148)">
            <line x1={CX + 44} y1={PLATE_Y + 4} x2={CX + 100} y2={PLATE_Y + 26} stroke="rgb(163 160 148)" strokeOpacity="0.6" />
            <text x={CX + 104} y={PLATE_Y + 32}>COMMON MOUNT PLATE</text>
            <text x={CX + 104} y={PLATE_Y + 45}>+ CONNECTOR · NO REWORK</text>
          </g>

          {/* swappable modules (all share one origin at the plate) */}
          <g data-module="lidar" opacity="0">
            <rect x={CX - 32} y={PLATE_Y - 52} width="64" height="52" rx="8" fill="rgb(236 231 219)" />
            <rect x={CX - 32} y={PLATE_Y - 34} width="64" height="8" fill="rgb(11 13 19)" fillOpacity="0.85" />
            <ellipse cx={CX} cy={PLATE_Y - 52} rx="32" ry="6" fill="rgb(255 91 46)" />
            <circle cx={CX} cy={PLATE_Y - 26} r="3" fill="rgb(255 91 46)" />
          </g>
          <g data-module="stereo" opacity="0">
            <rect x={CX - 56} y={PLATE_Y - 40} width="112" height="40" rx="6" fill="rgb(236 231 219)" />
            {[-28, 28].map((dx) => (
              <g key={dx}>
                <circle cx={CX + dx} cy={PLATE_Y - 22} r="11" fill="rgb(11 13 19)" />
                <circle cx={CX + dx} cy={PLATE_Y - 22} r="5" fill="rgb(255 91 46)" />
              </g>
            ))}
          </g>
          <g data-module="mono" opacity="0">
            <rect x={CX - 30} y={PLATE_Y - 40} width="60" height="40" rx="6" fill="rgb(236 231 219)" />
            <circle cx={CX} cy={PLATE_Y - 22} r="12" fill="rgb(11 13 19)" />
            <circle cx={CX} cy={PLATE_Y - 22} r="5.5" fill="rgb(255 91 46)" />
          </g>

          <text x="20" y="76" fill="rgb(163 160 148)" fontFamily="var(--font-mono)" fontSize="10" letterSpacing="1.6">SPARROW · 1:10 SCALE · WHEELED</text>
        </svg>
      </div>

      <div className="border-t border-bone/10 p-4 md:p-5">
        <div role="group" aria-label="Choose a sensor module" className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={active === k.id}
              onClick={() => pick(k.id)}
              className={`label border px-3.5 py-2 transition-colors ${active === k.id ? "border-laser bg-laser/10 !text-bone" : "border-bone/20 hover:border-bone/60"}`}
            >
              {k.label}
            </button>
          ))}
          <p className="label ml-auto hidden !normal-case !tracking-normal md:block" aria-live="polite">{note}</p>
        </div>

        {/* cost — schematic, deliberately not to scale */}
        <div className="mt-5 space-y-3">
          <div>
            <p className="label mb-1.5 flex justify-between"><span>Sparrow · target build cost</span><span className="label-strong">≈ $1,500</span></p>
            <span className="relative block h-2 bg-bone/10"><span className="absolute inset-y-0 left-0 w-[7%] bg-laser" /></span>
          </div>
          <div>
            <p className="label mb-1.5 flex justify-between"><span>Commercial platforms, e.g. Warthog</span><span className="label-strong">many times more</span></p>
            <span className="relative block h-2 bg-bone/10">
              <span className="absolute inset-y-0 left-0 right-[14%] bg-bone/55" />
              <svg className="absolute right-[10%] top-1/2 h-4 w-4 -translate-y-1/2 text-ink" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 -2 L9 8 L3 18" fill="none" stroke="rgb(6 7 11)" strokeWidth="5" />
                <path d="M3 -2 L9 8 L3 18" fill="none" stroke="rgb(236 231 219)" strokeOpacity="0.6" strokeWidth="1" />
              </svg>
            </span>
          </div>
          <p className="label !normal-case !tracking-normal !text-bone/55">Not to scale · 9 engineers across mechanical, software &amp; electrical</p>
        </div>
      </div>
    </div>
  );
}
