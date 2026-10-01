"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "@/lib/gsap";

/* Corridor geometry (top-down). The robot starts at the bottom and works toward the nursing station. */
const MAIN_X = 70;
const Y_START = 286;
const Y_END = 34;
const ROOMS = [
  { y: 222, tint: "#ff5b2e", code: "RED", action: "DISPENSE TYPE A" },
  { y: 142, tint: "#6fa8ff", code: "BLUE", action: "DISPENSE TYPE B" },
  { y: 62, tint: "#ece7db", code: "NONE", action: "SKIP · NO DISPENSE" },
] as const;
const BRANCH_X = 230;

export default function ChironVisual() {
  const root = useRef<HTMLDivElement>(null);
  const robot = useRef<SVGGElement>(null);
  const state = useRef<HTMLSpanElement>(null);
  const decision = useRef<HTMLSpanElement>(null);
  const pills = useRef<(SVGRectElement | null)[]>([]);
  const inds = useRef<(SVGRectElement | null)[]>([]);

  useEffect(() => {
    const el = root.current, bot = robot.current;
    if (!el || !bot) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The pose is tweened as a plain object and written to the SVG transform directly —
    // deterministic, and immune to GSAP's SVG transform-origin heuristics.
    const pose = { x: MAIN_X, y: Y_START, rot: -90 };
    const apply = () => bot.setAttribute("transform", `translate(${pose.x.toFixed(1)} ${pose.y.toFixed(1)}) rotate(${pose.rot.toFixed(1)})`);
    apply();

    const set = (s: string, d?: string) => () => {
      if (state.current) state.current.textContent = s;
      if (d !== undefined && decision.current) decision.current.textContent = d;
    };
    if (reduced) { set("FOLLOW HALLWAY", "—")(); return; }

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2, paused: true });
    const go = (vars: gsap.TweenVars) => tl.to(pose, { ...vars, onUpdate: apply });
    tl.call(set("FOLLOW HALLWAY", "—"));
    let y = Y_START;
    ROOMS.forEach((r, i) => {
      go({ y: r.y + 26, x: MAIN_X, rot: -90, duration: Math.max(0.6, (y - r.y - 26) / 90), ease: "none" });
      tl.call(set("DETECT BRANCH", "—"));
      tl.to({}, { duration: 0.35 });
      tl.call(set("SLOW + ALIGN"));
      go({ y: r.y, duration: 0.5, ease: "power2.out" });
      tl.call(set("TURN INTO BRANCH"));
      go({ rot: 0, duration: 0.45, ease: "power2.inOut" });
      tl.call(set("FOLLOW BRANCH LINE"));
      go({ x: BRANCH_X - 12, duration: 1.1, ease: "none" });
      tl.call(set("STOP · DELIVERY ZONE"));
      tl.to({}, { duration: 0.35 });
      tl.call(set(`READ COLOUR · ${r.code}`, r.action));
      tl.fromTo(inds.current[i], { attr: { "stroke-width": 1 } }, { attr: { "stroke-width": 4 }, duration: 0.3, yoyo: true, repeat: 3 });
      if (r.code !== "NONE") {
        tl.fromTo(pills.current[i], { attr: { y: r.y - 2 }, opacity: 1 }, { attr: { y: r.y + 26 }, duration: 0.6, ease: "bounce.out" });
      }
      tl.to({}, { duration: 0.45 });
      tl.call(set("EXIT ROOM · REQUIRE LINE", "—"));
      go({ x: MAIN_X, duration: 1.0, ease: "none" });
      go({ rot: -90, duration: 0.4, ease: "power2.inOut" });
      tl.call(set("FOLLOW MAIN CORRIDOR"));
      y = r.y;
    });
    go({ y: Y_END, duration: 0.6, ease: "none" });
    tl.call(set("END STATION · LOOP", "—"));
    tl.to({}, { duration: 0.6 });
    tl.eventCallback("onRepeat", () => {
      pills.current.forEach((p) => p && gsap.set(p, { opacity: 0 }));
      pose.x = MAIN_X; pose.y = Y_START; pose.rot = -90; apply();
    });

    pills.current.forEach((p) => p && gsap.set(p, { opacity: 0 }));
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? tl.play() : tl.pause()), { rootMargin: "60px" });
    io.observe(el);
    return () => { io.disconnect(); tl.kill(); };
  }, []);

  return (
    <div ref={root} className="absolute inset-0 grid grid-cols-1 sm:grid-cols-[1.18fr_1fr]">
      {/* ── the real prototype + budget ── */}
      <div className="flex min-h-0 flex-col border-b border-bone/10 bg-ink sm:border-b-0 sm:border-r">
        <figure className="p-3 md:p-4">
          <div className="paper-fig relative aspect-[1362/1000] w-full">
            <Image
              src="/assets/projects/dispensing-robot/prototype-annotated.webp"
              alt="The CHIRON prototype: a tracked robot with a lug-conveyor dispenser, annotated with its ESP32, track sprocket, drive wheel, track adjustor and chassis"
              fill
              sizes="(min-width: 1024px) 34vw, 90vw"
              className="object-cover"
            />
          </div>
          <figcaption className="label mt-2.5 flex justify-between gap-4 !leading-snug">
            <span>Final prototype · lug conveyor · ESP32</span>
            <span className="hidden md:inline">Redlined photo</span>
          </figcaption>
        </figure>
        <dl className="mx-3 mt-1 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-bone/10 py-3.5 md:mx-4">
          {[
            ["Drive", "Differential · 2 DC motors"],
            ["Dispenser", "Servo-driven lug conveyor"],
            ["Controller", "ESP32"],
            ["Sensing", "IR line · RGB colour · ultrasonic"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="label">{k}</dt>
              <dd className="mt-0.5 text-[0.8rem] leading-snug text-bone">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto space-y-3 border-t border-bone/10 p-3 md:p-4">
          <p className="label flex justify-between gap-3"><span>Budget cap · $300</span><span className="label-strong">Final BOM ≈ $200 CAD</span></p>
          <span className="relative block h-2 bg-bone/10"><span className="absolute inset-y-0 left-0 w-[67%] bg-laser" /></span>
          <p className="label !normal-case !tracking-normal !text-bone/55">
            From the project’s final report · 3 people · I led the chassis, drivetrain and lug-conveyor dispenser
          </p>
        </div>
      </div>

      {/* ── navigation logic ── */}
      <div className="flex min-h-0 flex-col bg-ink">
        <div className="relative min-h-[17rem] flex-1 p-3 md:p-4" data-cursor="default">
          <p className="label label-strong">Corridor logic · from the flowchart</p>
          <svg
            viewBox="0 0 330 322"
            className="absolute inset-x-2 bottom-1 top-9 h-[calc(100%-2.5rem)] w-[calc(100%-1rem)]"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Top-down animation of a line-following robot taking three room branches and dispensing according to a colour indicator"
          >
            <line x1={MAIN_X} y1={Y_START + 14} x2={MAIN_X} y2={Y_END - 12} stroke="rgb(236 231 219)" strokeOpacity="0.5" strokeWidth="6" strokeLinecap="round" />
            <line x1={MAIN_X} y1={Y_START + 14} x2={MAIN_X} y2={Y_END - 12} stroke="rgb(6 7 11)" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
            <text x={MAIN_X - 6} y={Y_START + 34} fill="rgb(163 160 148)" fontFamily="var(--font-mono)" fontSize="8" letterSpacing="1.4">START · PHARMACY</text>
            <text x={MAIN_X - 6} y={Y_END - 22} fill="rgb(163 160 148)" fontFamily="var(--font-mono)" fontSize="8" letterSpacing="1.4">NURSING STATION</text>
            {ROOMS.map((r, i) => (
              <g key={r.y}>
                <line x1={MAIN_X} y1={r.y} x2={BRANCH_X} y2={r.y} stroke="rgb(236 231 219)" strokeOpacity="0.5" strokeWidth="6" />
                <line x1={MAIN_X} y1={r.y} x2={BRANCH_X} y2={r.y} stroke="rgb(6 7 11)" strokeWidth="2" strokeDasharray="1 7" />
                <rect ref={(n) => { inds.current[i] = n; }} x={BRANCH_X + 6} y={r.y - 11} width="22" height="22" fill={r.tint} fillOpacity={r.code === "NONE" ? 0.12 : 0.9} stroke={r.tint} strokeWidth="1" />
                <text x={BRANCH_X + 36} y={r.y + 3} fill="rgb(163 160 148)" fontFamily="var(--font-mono)" fontSize="8" letterSpacing="1.2">ROOM {i + 1}</text>
                <rect ref={(n) => { pills.current[i] = n; }} x={BRANCH_X - 6} y={r.y - 2} width="9" height="9" fill="rgb(236 231 219)" opacity="0" />
              </g>
            ))}
            <g ref={robot} transform={`translate(${MAIN_X} ${Y_START}) rotate(-90)`}>
              <rect x="-13" y="-8" width="26" height="16" rx="3" fill="rgb(236 231 219)" />
              <rect x="-13" y="-8" width="8" height="16" fill="rgb(255 91 46)" />
              <circle cx="9" cy="0" r="2.6" fill="rgb(6 7 11)" />
              <path d="M16 -5 L24 0 L16 5" fill="none" stroke="rgb(255 91 46)" strokeWidth="1.4" />
            </g>
          </svg>
        </div>

        <dl className="grid grid-cols-2 gap-px border-t border-bone/10 bg-bone/10">
          <div className="bg-ink p-3 md:p-4">
            <dt className="label">State</dt>
            <dd className="mono mt-1 min-h-[2.2em] text-[0.72rem] leading-tight tracking-wide text-laser"><span ref={state}>FOLLOW HALLWAY</span></dd>
          </div>
          <div className="bg-ink p-3 md:p-4">
            <dt className="label">Decision</dt>
            <dd className="mono mt-1 min-h-[2.2em] text-[0.72rem] leading-tight tracking-wide text-bone"><span ref={decision}>—</span></dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
