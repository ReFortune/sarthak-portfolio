"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";
import { smoothstep } from "@/lib/math";
import { hash2 } from "@/lib/terrain";

const STARS = Array.from({ length: 110 }, (_, i) => ({
  x: Math.round(hash2(i, 1, 5) * 3000) / 10,
  y: Math.round(hash2(i, 2, 5) * 5200) / 10,
  r: Math.round((0.5 + hash2(i, 3, 5) * 1.1) * 10) / 10,
  a: Math.round((0.3 + hash2(i, 4, 5) * 0.7) * 100) / 100,
}));

const Y0 = 600; // ground level in viewBox units
const Y1 = 96; // 40 km

/** Altitude column (scroll-linked) + power gauge + the real FEM & CAD figures. */
export default function NovaVisual() {
  const root = useRef<HTMLDivElement>(null);
  const balloon = useRef<SVGGElement>(null);
  const stars = useRef<SVGGElement>(null);
  const glow = useRef<SVGEllipseElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const cursorLine = useRef<SVGGElement>(null);

  useGsap(root, ({ motion }) => {
    const card = root.current!.closest<HTMLElement>("[data-stack-card]");
    const apply = (p: number) => {
      const y = Y0 - p * (Y0 - Y1);
      const scale = 0.78 + 0.5 * p; // the envelope expands as ambient pressure drops
      balloon.current?.setAttribute("transform", `translate(150 ${y}) scale(${scale})`);
      cursorLine.current?.setAttribute("transform", `translate(0 ${y})`);
      stars.current?.setAttribute("opacity", String(smoothstep(0.06, 0.7, p)));
      glow.current?.setAttribute("opacity", String(0.85 * (1 - smoothstep(0, 0.65, p))));
      glow.current?.setAttribute("transform", `translate(0 ${p * 150})`);
      if (readout.current) readout.current.textContent = `${(p * 40).toFixed(1)} km`;
    };
    apply(motion ? 0 : 1);
    if (ring.current) {
      const C = 2 * Math.PI * 62;
      ring.current.style.strokeDasharray = `${C}`;
      ring.current.style.strokeDashoffset = `${motion ? C : C * (1 - 3.7 / 4)}`;
    }
    if (!motion) return;

    const o = { p: 0 };
    if (!card) {
      // Standalone (case-study hero): loop the ascent on a timer instead of tying it to scroll.
      const g = gsap.to(ring.current, { strokeDashoffset: 2 * Math.PI * 62 * (1 - 3.7 / 4), duration: 2, ease: "expo.out", delay: 0.6 });
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 1.8 });
      loop.to(o, { p: 1, duration: 11, ease: "power1.inOut", onUpdate: () => apply(o.p) });
      return () => { g.kill(); loop.kill(); };
    }

    const st = gsap.to(o, {
      p: 1,
      ease: "none",
      onUpdate: () => apply(o.p),
      scrollTrigger: { trigger: card, start: "top 82%", end: "top 12%", scrub: 0.8 },
    });
    const g = gsap.to(ring.current, {
      strokeDashoffset: 2 * Math.PI * 62 * (1 - 3.7 / 4),
      duration: 2,
      ease: "expo.out",
      scrollTrigger: { trigger: card, start: "top 70%", once: true },
    });
    return () => { st.kill(); g.kill(); };
  }, []);

  return (
    <div ref={root} className="grid h-full grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
      {/* ── altitude column ── */}
      <div className="relative border-r border-bone/10">
        <svg viewBox="0 0 300 700" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" role="img" aria-label="Balloon ascending from the ground to 40 kilometres; the sky darkens and stars appear with altitude">
          <defs>
            <linearGradient id="nv-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#020308" />
              <stop offset="0.62" stopColor="#070a14" />
              <stop offset="1" stopColor="#131524" />
            </linearGradient>
            <radialGradient id="nv-glow">
              <stop offset="0" stopColor="#ff8a5a" stopOpacity="0.55" />
              <stop offset="0.5" stopColor="#c2604a" stopOpacity="0.2" />
              <stop offset="1" stopColor="#c2604a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="300" height="700" fill="url(#nv-sky)" />
          <g ref={stars} opacity="0">
            {STARS.map((s, i) => (
              <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfe6ff" opacity={s.a} />
            ))}
          </g>
          {/* city-glow on the horizon — fades with altitude */}
          <ellipse ref={glow} cx="150" cy="690" rx="290" ry="150" fill="url(#nv-glow)" />
          {/* ground */}
          <rect x="0" y="648" width="300" height="52" fill="#06070b" />
          <line x1="0" y1="648" x2="300" y2="648" stroke="rgb(236 231 219)" strokeOpacity="0.3" />

          {/* altitude ruler */}
          {[0, 10, 20, 30, 40].map((k) => {
            const y = Y0 - (k / 40) * (Y0 - Y1);
            return (
              <g key={k}>
                <line x1="18" y1={y} x2="34" y2={y} stroke="rgb(236 231 219)" strokeOpacity="0.5" />
                <text x="42" y={y + 3.5} fill="rgb(236 231 219)" fillOpacity="0.6" fontSize="10" fontFamily="var(--font-mono)" letterSpacing="1">
                  {k} km
                </text>
              </g>
            );
          })}
          {[5, 15, 25, 35].map((k) => {
            const y = Y0 - (k / 40) * (Y0 - Y1);
            return <line key={k} x1="18" y1={y} x2="26" y2={y} stroke="rgb(236 231 219)" strokeOpacity="0.25" />;
          })}
          <line x1="18" y1={Y1 - 20} x2="18" y2={Y0 + 6} stroke="rgb(236 231 219)" strokeOpacity="0.25" />

          {/* altitude cursor */}
          <g ref={cursorLine}>
            <line x1="18" y1="0" x2="282" y2="0" stroke="rgb(255 91 46)" strokeOpacity="0.45" strokeDasharray="2 5" />
          </g>

          {/* balloon + payload */}
          <g ref={balloon} transform={`translate(150 ${Y0})`}>
            <path d="M0 -62 C-30 -62 -44 -36 -44 -14 C-44 16 -20 38 0 50 C20 38 44 16 44 -14 C44 -36 30 -62 0 -62Z" fill="rgb(236 231 219)" fillOpacity="0.92" />
            <path d="M-16 -50 C-30 -38 -34 -20 -30 -6" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
            <line x1="0" y1="50" x2="0" y2="84" stroke="rgb(236 231 219)" strokeOpacity="0.6" />
            <rect x="-9" y="84" width="18" height="13" fill="rgb(255 91 46)" />
            <rect x="-9" y="84" width="18" height="13" fill="none" stroke="#fff" strokeOpacity="0.5" />
          </g>
        </svg>
        <div className="pointer-events-none absolute bottom-10 left-4">
          <p className="label">Altitude</p>
          <p className="h-display mt-1 text-[clamp(1.6rem,2.6vw,2.4rem)] normal-case">
            <span ref={readout} className="tnum">0.0 km</span>
          </p>
        </div>
        <p className="label pointer-events-none absolute bottom-3 left-4 right-4 !normal-case !tracking-normal !text-bone/70">
          Stratospheric balloon · RSOnar III
        </p>
      </div>

      {/* ── instruments ── */}
      <div className="flex min-h-0 flex-col">
        <div className="grid grid-cols-[auto_1fr] items-center gap-5 border-b border-bone/10 p-4 md:gap-7 md:p-6">
          <div className="relative h-[8.5rem] w-[8.5rem] shrink-0 md:h-40 md:w-40">
            <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" role="img" aria-label="Average peak power 3.7 watts against a 4 watt budget">
              <circle cx="80" cy="80" r="62" fill="none" stroke="rgb(236 231 219)" strokeOpacity="0.12" strokeWidth="9" />
              <circle ref={ring} cx="80" cy="80" r="62" fill="none" stroke="rgb(255 91 46)" strokeWidth="9" strokeLinecap="butt" />
              {/* budget tick at 4 W */}
              <line x1="80" y1="6" x2="80" y2="22" stroke="rgb(236 231 219)" strokeWidth="2" />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="h-display text-[1.9rem] leading-none md:text-[2.2rem]">3.7<span className="serif text-[0.5em] text-bone-dim"> W</span></p>
                <p className="label mt-1.5">of 4 W</p>
              </div>
            </div>
          </div>
          <div>
            <p className="label mb-2">Avionics power · peak</p>
            <p className="text-[0.88rem] leading-snug text-bone-dim">
              5 V rail, held under budget by disabling unused BeagleBone Black Industrial peripherals and retuning exposure rates. &gt;15 h continuous, zero image-data loss.
            </p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-px bg-bone/10">
          <Fig src="/assets/projects/nova/fem-displacement.webp" alt="Finite-element displacement plot of the camera mount under a 10 G load" cap="FEM · 10 G · < 0.1 mm" />
          <Fig src="/assets/projects/nova/cad-side.webp" alt="CAD side view of the payload: a camera on a 45 degree aluminium bracket beside the BeagleBone Black" cap="CAD · 45° camera mount" />
          <Fig src="/assets/projects/nova/machined-mount.webp" alt="The machined aluminium camera mount, photographed in hand" cap="Machined Al 6061 mount" cover />
          <Fig src="/assets/projects/nova/power-architecture.webp" alt="Power and data architecture block diagram: gondola supply, DC/DC converters, PDU and payload rails" cap="Power architecture · 5 V" />
        </div>
      </div>
    </div>
  );
}

function Fig({ src, alt, cap, cover = false }: { src: string; alt: string; cap: string; cover?: boolean }) {
  return (
    <figure className="flex min-h-0 flex-col bg-ink p-2 md:p-2.5">
      <div className="paper-fig relative min-h-0 flex-1">
        <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 22vw, 45vw" className={cover ? "object-cover" : "object-contain p-1.5"} />
      </div>
      <figcaption className="label mt-1.5 truncate !leading-snug">{cap}</figcaption>
    </figure>
  );
}
