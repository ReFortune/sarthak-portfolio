"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ScrollTrigger } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";
import { clamp, smoothstep } from "@/lib/math";
import { scrollToTarget } from "@/lib/scroll";
import { TLink } from "../core/Transition";
import type { Telemetry, TraverseScene } from "./traverse/traverseScene";

/**
 * Traverse — the hero's LiDAR terrain and route planner, scrubbed by scroll. The rover drives one planned route and each
 * stage of the work (survey, plan, build, arrive) is a stretch of it. While the stage is pinned, scroll moves the rover.
 */

const STAGES = ["Survey", "Plan", "Build", "Arrive"] as const;
const LETTERS = ["A", "B", "C", "D"] as const;

type Beat = {
  title: ReactNode;
  body: string;
  stat: string;
  statLabel: string;
  cta: { href: string; label: string; text: string };
};

const beats: Beat[] = [
  {
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
    title: (
      <>
        Then <span className="serif">the path</span> across it.
      </>
    ),
    body: "On this made-up terrain, a planner searches for the cheapest way across and keeps clear of ground steeper than its limit. At the CSA I built the front end of a rover mission-planning tool and explored new ways to plan paths.",
    stat: "MPT",
    statLabel: "Mission Planning Tool, CSA",
    cta: { href: "/projects/mission-planning-tool", label: "MPT", text: "Read the case study" },
  },
  {
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
];

export default function Traverse() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const beatEls = useRef<(HTMLDivElement | null)[]>([]);
  const sceneRef = useRef<TraverseScene | null>(null);
  const progress = useRef(0);
  const roverY = useRef<number | undefined>(undefined);
  const cache = useRef<{ els: Map<string, HTMLElement[]>; last: Map<string, string> }>({ els: new Map(), last: new Map() });

  /* readouts: DOM writes only, so a scroll tick never re-renders React */
  const set = (key: string, text: string) => {
    const c = cache.current;
    if (c.last.get(key) === text) return;
    c.last.set(key, text);
    let els = c.els.get(key);
    if (!els) {
      els = Array.from(stage.current?.querySelectorAll<HTMLElement>(`[data-k="${key}"]`) ?? []);
      c.els.set(key, els);
    }
    for (const el of els) el.textContent = text;
  };
  const paint = (t: Telemetry) => {
    set("stage", `${LETTERS[t.stage]} · ${STAGES[t.stage]}`);
    set("distance", `${Math.round(t.distance)} m`);
    set("elevation", `${t.elevation >= 0 ? "+" : "−"}${Math.abs(t.elevation).toFixed(1)} m`);
    set("slope", `${Math.round(t.slope)}°`);
    set("points", Math.floor(t.points).toLocaleString("en-US"));
    set("next", t.nextWaypoint == null ? "reached" : `${Math.round(t.nextWaypoint)} m`);
    const plan = t.stage >= 1 ? t.plan : null; // the plan is made up front, but it is the second stage's to show
    set("route", plan ? `${Math.round(plan.length)} m` : "—");
    set("steep", plan ? `${Math.round(plan.maxSlope)}° · limit ${plan.limit}°` : "—");
    set("ms", plan ? `${plan.ms < 10 ? plan.ms.toFixed(1) : Math.round(plan.ms)} ms` : "—");
    stage.current?.querySelectorAll<HTMLElement>("[data-bar]").forEach((b) => {
      const on = Number(b.dataset.bar) <= t.stage;
      b.classList.toggle("bg-laser", on);
      b.classList.toggle("bg-bone/20", !on);
    });
  };

  /* the beats cross-fade as the rover moves from one stage to the next */
  const apply = (p: number) => {
    progress.current = p;
    sceneRef.current?.setProgress(p);
    if (p > 0) sceneRef.current?.intro(); // (a no-op once it has started: this just makes sure it has)
    beats.forEach((_, i) => {
      const el = beatEls.current[i];
      if (!el) return;
      // one stage out, then the next in: they never overlap
      const rise = i === 0 ? 1 : smoothstep(i / 4 + 0.004, i / 4 + 0.04, p);
      const fall = i === beats.length - 1 ? 1 : 1 - smoothstep((i + 1) / 4 - 0.04, (i + 1) / 4 - 0.004, p);
      const o = rise * fall;
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate3d(0, ${((p - (i + 0.5) / 4) * -48).toFixed(1)}px, 0)`;
      el.style.pointerEvents = o > 0.5 ? "auto" : "none";
    });
  };

  /* Tab into a stage that is not the current one: bring the rover to it, so what has focus is always on screen. */
  const focusBeat = (i: number) => {
    const sec = root.current, st = stage.current;
    if (!sec || !st) return;
    const centre = (i + 0.5) / 4;
    if (Math.abs(progress.current - centre) < 0.125) return;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    scrollToTarget(top + centre * (sec.offsetHeight - st.offsetHeight), { immediate: true, force: true });
  };

  /* scroll → progress (motion only; reduced-motion visitors get a still frame and the stages as cards) */
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

  /* portrait: the copy owns the top of the screen, so the rover sits in the band under it */
  useEffect(() => {
    const st = stage.current, c = copy.current;
    if (!st || !c) return;
    const update = () => {
      const h = st.clientHeight, w = st.clientWidth;
      if (!h || w / h >= 0.85) {
        roverY.current = undefined;
      } else {
        const bottom = c.getBoundingClientRect().bottom - st.getBoundingClientRect().top;
        roverY.current = clamp((bottom + (h - 84)) / 2 / h, 0.5, 0.84);
      }
      sceneRef.current?.resize();
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(st);
    ro.observe(c);
    document.fonts?.ready.then(update);
    return () => ro.disconnect();
  }, []);

  /* the WebGL world: made when the section is near, paused when it is off-screen */
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let scene: TraverseScene | null = null;
    const cleanups: Array<() => void> = [];

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const lowPower = coarse || window.innerWidth < 820 || (navigator.hardwareConcurrency ?? 8) <= 4;

    // A fresh canvas per mount keeps StrictMode remounts safe (a force-lost context can't be reused).
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "absolute inset-0 h-full w-full opacity-0 transition-opacity duration-700";
    el.appendChild(canvas);

    const boot = async () => {
      let mod: typeof import("./traverse/traverseScene");
      try {
        mod = await import("./traverse/traverseScene");
      } catch {
        return;
      }
      if (disposed) return;
      try {
        scene = mod.createTraverseScene(canvas, {
          reduced,
          lowPower,
          getRoverY: () => roverY.current,
          onTelemetry: paint,
          onReady: () => {
            canvas.style.opacity = "1";
          },
        });
      } catch (err) {
        // No WebGL: the gradient behind the canvas stays.
        console.warn("Traverse scene unavailable:", err);
        return;
      }
      sceneRef.current = scene;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __traverse?: TraverseScene }).__traverse = scene;
      scene.setProgress(reduced ? 0.6 : progress.current);

      // (a busy main thread can deliver several entries at once: the last is the current state)
      const io = new IntersectionObserver(
        (entries) => {
          const on = entries[entries.length - 1].isIntersecting;
          scene?.setVisible(on);
          if (on) scene?.intro();
        },
        { rootMargin: "80px" }
      );
      io.observe(el);
      cleanups.push(() => io.disconnect());
      const ro = new ResizeObserver(() => scene?.resize());
      ro.observe(el);
      cleanups.push(() => ro.disconnect());

      if (reduced) return;
      /* pointer → NDC within the stage (listening on window so the copy never blocks it) */
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) return scene?.setPointer(0, 0, false);
        scene?.setPointer(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), true);
      };
      const onLeave = () => scene?.setPointer(0, 0, false);
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        window.removeEventListener("pointermove", onMove);
        document.documentElement.removeEventListener("pointerleave", onLeave);
      });
    };

    // Build it a little before it is needed (not at page load, while the hero is starting), so the ground is filled in when the section arrives.
    let started = false;
    const near = new IntersectionObserver(
      (entries) => {
        if (started || !entries[entries.length - 1].isIntersecting) return;
        started = true;
        near.disconnect();
        boot();
      },
      { rootMargin: "450px 0px" }
    );
    near.observe(el);

    return () => {
      disposed = true;
      near.disconnect();
      cleanups.forEach((fn) => fn());
      scene?.dispose();
      sceneRef.current = null;
      canvas.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      ref={root}
      id="traverse"
      aria-labelledby="traverse-title"
      className="relative border-t border-bone/15 motion-safe:h-[520svh]"
    >
      <div
        ref={stage}
        className="relative min-h-[100svh] overflow-hidden bg-ink motion-safe:sticky motion-safe:top-0 motion-safe:h-[100svh]"
      >
        {/* static fallback: only visible if WebGL is unavailable (the terrain canvas is opaque) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(90%_60%_at_60%_78%,rgb(var(--ice)/0.16),transparent_62%),radial-gradient(60%_40%_at_70%_82%,rgb(var(--laser)/0.12),transparent_70%)]"
        />
        <div ref={host} className="absolute inset-0" />

        {/* legibility scrims, as on the hero: light, so the terrain stays luminous */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink/80 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(60%_72%_at_10%_40%,rgb(var(--ink)/0.78)_0%,rgb(var(--ink)/0.45)_48%,transparent_80%)] lg:block" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[68%] bg-gradient-to-b from-ink/85 via-ink/60 to-transparent lg:hidden" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink to-transparent" />

        <div className="wrap relative z-10 flex h-full min-h-[inherit] flex-col pb-[clamp(4.5rem,9vh,6rem)] pt-[clamp(6rem,13vh,8.5rem)]">
          <div className="flex items-center justify-between gap-6">
            <h2 id="traverse-title" className="label label-strong flex items-center gap-2.5 !text-[0.8rem] sm:!text-[0.85rem]">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-laser [animation:blink_1.4s_infinite]" />
              Traverse
              <span className="hidden text-bone-mute sm:inline">·</span>
              <span className="hidden !normal-case !tracking-[0.04em] text-bone-dim sm:inline">survey, plan, build, arrive</span>
            </h2>
            <p className="label tnum lg:hidden" aria-hidden="true">
              <span data-k="stage" className="text-bone">A · Survey</span>
              <span className="mx-2 text-bone-mute">·</span>
              <span data-k="distance">0 m</span>
            </p>
          </div>

          <div ref={copy} className="mt-8 grid items-start gap-10 sm:mt-10 lg:grid-cols-12">
            {/* the stages: one at a time while pinned, all four (as cards, below) with reduced motion */}
            <div className="grid lg:col-span-6 xl:col-span-5 motion-reduce:hidden">
              {beats.map((b, i) => (
                <div
                  key={STAGES[i]}
                  ref={(el) => {
                    beatEls.current[i] = el;
                  }}
                  onFocusCapture={() => focusBeat(i)}
                  className={`will-change-[opacity,transform] [grid-area:1/1] ${i === 0 ? "" : "pointer-events-none opacity-0"}`}
                >
                  <p className="label label-strong mb-5 flex items-center gap-3">
                    <span className="text-laser">{LETTERS[i]}</span>
                    <span aria-hidden="true">—</span>
                    {STAGES[i]}
                  </p>
                  <h3 className="h-display text-d-sm">{b.title}</h3>
                  <p className="lede mt-6 max-w-lg">{b.body}</p>
                  <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-5">
                    <p className="flex items-baseline gap-3">
                      <span className="h-display whitespace-nowrap text-[clamp(2rem,3.6vw,3.2rem)] text-bone">{b.stat}</span>
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

            <ReadoutPanel className="hidden lg:col-span-4 lg:col-start-9 lg:block xl:col-span-4 xl:col-start-9" />
          </div>
        </div>
      </div>

      {/* reduced motion: the same four stages, as cards */}
      <div className="wrap py-16 motion-safe:hidden">
        <div className="grid gap-px border border-bone/10 bg-bone/10 sm:grid-cols-2 xl:grid-cols-4">
          {beats.map((b, i) => (
            <div key={STAGES[i]} className="flex min-h-[19rem] flex-col justify-between gap-8 bg-ink p-6 md:p-8">
              <div>
                <p className="label label-strong mb-5 flex items-center gap-3">
                  <span className="text-laser">{LETTERS[i]}</span>
                  <span aria-hidden="true">—</span>
                  {STAGES[i]}
                </p>
                <h3 className="h-display text-[clamp(1.6rem,2.6vw,2.4rem)]">{b.title}</h3>
                <p className="body mt-4">{b.body}</p>
              </div>
              <div className="flex flex-col gap-4">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="h-display whitespace-nowrap text-[clamp(1.8rem,3vw,2.6rem)] text-bone">{b.stat}</span>
                  <span className="label max-w-[10rem] !leading-snug">{b.statLabel}</span>
                </p>
                <TLink href={b.cta.href} label={b.cta.label} className="label link inline-flex min-h-11 items-center self-start !text-bone-dim hover:!text-bone">
                  {b.cta.text} →
                </TLink>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── live instrument readout, in the hero's panel style ─────────────────── */

const ROWS: [label: string, key: string, tone?: string][] = [
  ["Stage", "stage"],
  ["Distance", "distance"],
  ["Elevation", "elevation"],
  ["Slope", "slope"],
  ["Points acquired", "points", "text-laser"],
  ["Next waypoint", "next"],
];
const ROUTE_ROWS: [label: string, key: string][] = [
  ["Route", "route"],
  ["Steepest cell", "steep"],
  ["Planned in", "ms"],
];
const START: Record<string, string> = { stage: "A · Survey", distance: "0 m", elevation: "—", slope: "—", points: "0", next: "—", route: "—", steep: "—", ms: "—" };

function ReadoutPanel({ className = "" }: { className?: string }) {
  const row = "flex items-baseline justify-between gap-6 border-b border-bone/10 pb-2.5 last:border-0 last:pb-0 [@media(max-height:820px)]:pb-1.5";
  return (
    <div className={`ticks border border-bone/15 bg-ink/40 p-5 backdrop-blur-[2px] ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="label label-strong flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1.2s_infinite]" />
          Traverse · live
        </p>
        <div className="flex gap-1.5" role="img" aria-label="Four stages: survey, plan, build, arrive">
          {STAGES.map((s, i) => (
            <span key={s} data-bar={i} className={`h-1.5 w-4 transition-colors duration-500 ${i === 0 ? "bg-laser" : "bg-bone/20"}`} />
          ))}
        </div>
      </div>
      <dl className="space-y-2.5 [@media(max-height:820px)]:space-y-1.5">
        {ROWS.map(([label, key, tone]) => (
          <div key={key} className={row}>
            <dt className="label">{label}</dt>
            <dd className={`mono tnum text-[0.8rem] tracking-wide ${tone ?? "text-bone"}`} data-k={key}>
              {START[key]}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 border-t border-bone/15 pt-4 [@media(max-height:820px)]:mt-3.5 [@media(max-height:820px)]:pt-3">
        <p className="label label-strong mb-3 flex items-center gap-2 [@media(max-height:820px)]:mb-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ice [animation:blink_1.6s_infinite]" />
          Route planner · live
        </p>
        <dl className="space-y-2 [@media(max-height:820px)]:space-y-1.5">
          {ROUTE_ROWS.map(([label, key]) => (
            <div key={key} className="flex items-baseline justify-between gap-6 border-b border-bone/10 pb-2 last:border-0 last:pb-0 [@media(max-height:820px)]:pb-1.5">
              <dt className="label">{label}</dt>
              <dd className="mono tnum text-[0.8rem] tracking-wide text-bone" data-k={key}>
                {START[key]}
              </dd>
            </div>
          ))}
        </dl>
        <a href="#mission-planner" className="label link mt-4 inline-block !text-bone-dim hover:!text-bone [@media(max-height:820px)]:mt-3">
          Try the planner →
        </a>
      </div>
    </div>
  );
}
