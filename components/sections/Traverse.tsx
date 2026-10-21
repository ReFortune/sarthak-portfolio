"use client";

import { useEffect, useRef } from "react";
import { ScrollTrigger } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";
import { clamp, smoothstep } from "@/lib/math";
import { TLink } from "../core/Transition";
import type { TraverseScene } from "./traverse/traverseScene";

/* Scroll progress at which the rover reaches each waypoint (matches WAYPOINTS in the scene). */
const STOPS = [0.1, 0.4, 0.7, 1] as const;

const beats = [
  {
    tag: "Survey",
    title: (
      <>
        Every route starts as <span className="serif">a surface.</span>
      </>
    ),
    body: "At the Canadian Space Agency I characterised a LiDAR to 1 cm ranging accuracy, then traded four pushbroom configurations for Artemis 4 surface mapping.",
    stat: "1 cm",
    statLabel: "LiDAR ranging accuracy characterised",
    cta: { href: "/#trade-study", label: "Trade study", text: "Run the trade study" },
  },
  {
    tag: "Plan",
    title: (
      <>
        Then <span className="serif">the path</span> across it.
      </>
    ),
    body: "Over the same kind of terrain, a planner finds the way across and keeps clear of steep crater walls. It is the route being drawn at the top of this page.",
    stat: "MPT",
    statLabel: "Mission Planning Tool, CSA",
    cta: { href: "/projects/mission-planning-tool", label: "MPT", text: "Read the case study" },
  },
  {
    tag: "Build",
    title: (
      <>
        A rover <span className="serif">to drive it.</span>
      </>
    ),
    body: "I lead a 9-person team building Sparrow, a reconfigurable 1:10-scale wheeled rover test platform for the Canadian Space Agency.",
    stat: "≈ $1,500",
    statLabel: "Sparrow target build cost",
    cta: { href: "/#projects", label: "Projects", text: "See the projects" },
  },
  {
    tag: "Arrive",
    title: (
      <>
        Waypoint <span className="serif">reached.</span>
      </>
    ),
    body: "From a 40 km balloon flight to a Mars orbiter design, the work is the same: measure carefully, then plan the way.",
    stat: "40 km",
    statLabel: "NOVA payload flight altitude",
    cta: { href: "/#contact", label: "Contact", text: "Say hello" },
  },
] as const;

export default function Traverse() {
  const root = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TraverseScene | null>(null);
  const beatEls = useRef<(HTMLDivElement | null)[]>([]);
  const legRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const progress = useRef(0);

  /* paint the beats + HUD for a progress value; no React re-render per scroll tick */
  const apply = (p: number) => {
    progress.current = p;
    sceneRef.current?.setProgress(p);
    beats.forEach((_, i) => {
      const el = beatEls.current[i];
      if (!el) return;
      const d = p < STOPS[i] && i === 0 ? 0 : p > STOPS[i] && i === beats.length - 1 ? 0 : Math.abs(p - STOPS[i]);
      const o = 1 - smoothstep(0.05, 0.17, d);
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${((p - STOPS[i]) * -60).toFixed(1)}px, 0)`;
      el.style.visibility = o < 0.02 ? "hidden" : "visible";
      el.style.pointerEvents = o > 0.5 ? "auto" : "none";
    });
    const leg = clamp(Math.round(p / 0.3) + 1, 1, beats.length);
    if (legRef.current) legRef.current.textContent = `${leg} / ${beats.length}`;
    barRef.current?.style.setProperty("--p", p.toFixed(3));
  };

  /* scroll → progress (motion only; reduced-motion visitors get the stacked, static layout) */
  useGsap(root, ({ motion }) => {
    if (!motion) return;
    apply(0);
    ScrollTrigger.create({
      trigger: root.current,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => apply(self.progress),
    });
  }, []);

  /* the WebGL world, loaded lazily and paused off-screen */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let scene: TraverseScene | null = null;
    const cleanups: Array<() => void> = [];

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const lowPower = coarse || window.innerWidth < 820 || (navigator.hardwareConcurrency ?? 8) <= 4;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700";
    el.appendChild(canvas);

    (async () => {
      let mod: typeof import("./traverse/traverseScene");
      try {
        mod = await import("./traverse/traverseScene");
      } catch {
        return;
      }
      if (disposed) return;
      try {
        scene = mod.createTraverseScene(canvas, { reduced, lowPower });
      } catch (err) {
        // No WebGL: the CSS gradient behind the canvas stays visible.
        console.warn("Traverse scene unavailable:", err);
        return;
      }
      sceneRef.current = scene;
      canvas.style.opacity = "1";
      scene.setProgress(reduced ? 0.55 : progress.current);

      const io = new IntersectionObserver(([e]) => scene?.setVisible(e.isIntersecting), { rootMargin: "120px" });
      io.observe(el);
      cleanups.push(() => io.disconnect());
      const ro = new ResizeObserver(() => scene?.resize());
      ro.observe(el);
      cleanups.push(() => ro.disconnect());

      if (reduced) return;
      const onMove = (e: PointerEvent) => scene?.setPointer(e.clientX / window.innerWidth - 0.5, e.clientY / window.innerHeight - 0.5);
      window.addEventListener("pointermove", onMove, { passive: true });
      cleanups.push(() => window.removeEventListener("pointermove", onMove));
    })();

    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
      scene?.dispose();
      sceneRef.current = null;
      canvas.remove();
    };
  }, []);

  return (
    <section
      ref={root}
      id="traverse"
      aria-labelledby="traverse-title"
      className="relative border-t border-bone/15 motion-safe:h-[480svh]"
    >
      <div className="relative min-h-[100svh] overflow-hidden bg-ink motion-safe:sticky motion-safe:top-0 motion-safe:h-[100svh]">
        {/* CSS fallback + the WebGL canvas */}
        <div
          ref={host}
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 80% at 72% 18%, rgb(var(--ink-4)) 0%, rgb(var(--ink)) 70%)" }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden md:block"
          style={{
            background:
              "linear-gradient(to right, rgb(var(--ink) / 0.82) 0%, rgb(var(--ink) / 0.35) 45%, transparent 70%), radial-gradient(ellipse at 60% 45%, transparent 45%, rgb(var(--ink) / 0.7) 100%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 md:hidden"
          style={{ background: "linear-gradient(to bottom, rgb(var(--ink) / 0.88) 0%, rgb(var(--ink) / 0.7) 50%, transparent 78%)" }}
        />

        <div className="wrap relative flex min-h-[100svh] flex-col py-24 md:py-28">
          <div className="flex items-start justify-between gap-6">
            <h2 id="traverse-title" className="label label-strong flex items-center gap-3">
              <span className="text-laser" aria-hidden="true">✦</span>
              Traverse
              <span className="hidden sm:inline text-bone-dim">· survey → plan → build → arrive</span>
            </h2>
            <p className="label tnum hidden sm:block">
              Waypoint <span ref={legRef} className="text-bone">1 / {beats.length}</span>
            </p>
          </div>

          <div className="relative mb-auto mt-10 max-w-xl motion-safe:min-h-[24rem] motion-reduce:flex motion-reduce:flex-col motion-reduce:gap-14 md:max-w-2xl">
            {beats.map((b, i) => (
              <div
                key={b.tag}
                ref={(el) => {
                  beatEls.current[i] = el;
                }}
                className="will-change-[opacity,transform] motion-safe:absolute motion-safe:inset-x-0 motion-safe:top-0"
              >
                <p className="label label-strong mb-5 flex items-center gap-3">
                  <span className="text-laser tnum">{String(i + 1).padStart(2, "0")}</span>
                  <span aria-hidden="true">—</span>
                  {b.tag}
                </p>
                <h3 className="h-display text-d-sm">{b.title}</h3>
                <p className="lede mt-6 max-w-lg">{b.body}</p>
                <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-5">
                  <p className="flex items-baseline gap-3">
                    <span className="h-display text-[clamp(2rem,3.6vw,3.2rem)] text-bone">{b.stat}</span>
                    <span className="label max-w-[12rem] !leading-snug">{b.statLabel}</span>
                  </p>
                  <TLink href={b.cta.href} label={b.cta.label} className={`btn btn--sm ${i === beats.length - 1 ? "btn--solid" : ""}`}>
                    {b.cta.text}
                    <span className="arrow" aria-hidden="true">↗</span>
                  </TLink>
                </div>
              </div>
            ))}
          </div>

          <div className="label tnum flex items-center gap-4 motion-reduce:hidden" aria-hidden="true">
            <span>Route</span>
            <span
              ref={barRef}
              className="relative block h-px w-24 bg-bone/20 after:absolute after:inset-y-0 after:left-0 after:bg-laser after:content-[''] after:w-[calc(var(--p,0)*100%)]"
            />
            <span className="hidden sm:inline">Scroll to drive</span>
          </div>
        </div>
      </div>
    </section>
  );
}
