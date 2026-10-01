"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";
import { bootStore, useStore } from "@/lib/store";
import { profile } from "@/data/profile";
import { lerp, smoothstep } from "@/lib/math";
import TerrainCanvas from "./TerrainCanvas";
import Magnetic from "../ui/Magnetic";
import SplitReveal from "../ui/SplitReveal";

/* The four pushbroom configurations from the CSA trade study (scan rate × angular increment). */
const MODES = [
  { rate: 50, inc: 0.25 },
  { rate: 25, inc: 0.5 },
  { rate: 50, inc: 0.5 },
  { rate: 25, inc: 0.25 },
] as const;
const pointsPerScan = (inc: number) => Math.round(270 / inc) + 1; // 270° field of view

const NAME_WORDS = ["SARTHAK", "SAHAI"];

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const nameWrap = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const progress = useRef(0);
  const boot = useStore(bootStore);

  /* scroll: parallax the canvas, lift + fade the copy, and pitch the terrain camera up */
  useGsap(root, ({ motion }) => {
    if (!motion) return;
    ScrollTrigger.create({
      trigger: root.current,
      start: "top top",
      end: "bottom top",
      scrub: true,
      onUpdate: (self) => (progress.current = self.progress),
    });
    gsap.to(canvasWrap.current, {
      yPercent: 14,
      ease: "none",
      scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
    });
    gsap.to(content.current, {
      yPercent: -10,
      opacity: 0,
      ease: "none",
      scrollTrigger: { trigger: root.current, start: "top top", end: "bottom 35%", scrub: true },
    });
  }, []);

  /* fit the name to the container, then run the intro + cursor-proximity width effect */
  useEffect(() => {
    const wrap = nameWrap.current;
    const name = nameRef.current;
    if (!wrap || !name) return;
    const chars = Array.from(name.querySelectorAll<HTMLElement>(".ch"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const fit = () => {
      name.style.fontSize = "100px";
      const w = name.getBoundingClientRect().width;
      if (w > 0) name.style.fontSize = `${(100 * wrap.clientWidth * 0.972) / w}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const BASE_W = 112;
    const BASE_WGHT = 650;
    const cur = chars.map(() => ({ w: BASE_W, g: BASE_WGHT }));
    const tgt = chars.map(() => ({ w: BASE_W, g: BASE_WGHT }));
    let active = false;

    const apply = (i: number) => {
      chars[i].style.setProperty("--w", cur[i].w.toFixed(1));
      chars[i].style.setProperty("--g", cur[i].g.toFixed(0));
    };
    const tick = () => {
      let moving = false;
      for (let i = 0; i < chars.length; i++) {
        const dw = tgt[i].w - cur[i].w;
        const dg = tgt[i].g - cur[i].g;
        if (Math.abs(dw) > 0.05 || Math.abs(dg) > 0.5) {
          cur[i].w += dw * 0.14;
          cur[i].g += dg * 0.14;
          apply(i);
          moving = true;
        }
      }
      if (!moving && !active) gsap.ticker.remove(tick);
    };

    const onMove = (e: PointerEvent) => {
      const r = name.getBoundingClientRect();
      const near = e.clientY > r.top - 260 && e.clientY < r.bottom + 120;
      active = near;
      for (let i = 0; i < chars.length; i++) {
        if (!near) { tgt[i].w = BASE_W; tgt[i].g = BASE_WGHT; continue; }
        const cr = chars[i].getBoundingClientRect();
        const dx = e.clientX - (cr.left + cr.width / 2);
        const dy = e.clientY - (cr.top + cr.height / 2);
        const t = 1 - smoothstep(0, 230, Math.hypot(dx, dy * 0.6));
        tgt[i].w = lerp(BASE_W, 125, t);
        tgt[i].g = lerp(BASE_WGHT, 820, t);
      }
      gsap.ticker.remove(tick);
      gsap.ticker.add(tick);
    };

    if (fine && !reduced) window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      gsap.ticker.remove(tick);
    };
  }, []);

  /* intro choreography (after the preloader lifts) */
  useEffect(() => {
    if (!boot.done || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const name = nameRef.current;
    if (!name) return;
    const chars = name.querySelectorAll(".ch");
    const ctx = gsap.context(() => {
      gsap.fromTo(chars, { yPercent: 118, "--w": 62 }, { yPercent: 0, "--w": 112, duration: 1.5, stagger: 0.045, ease: "expo.out", delay: 0.25 });
      gsap.from(".hero-fade", { opacity: 0, y: 22, duration: 1.3, stagger: 0.12, ease: "expo.out", delay: 0.7 });
    }, root);
    return () => ctx.revert();
  }, [boot.done]);

  return (
    <section
      ref={root}
      id="top"
      data-section="top"
      data-cursor="scan"
      aria-label="Introduction"
      className="relative h-[max(100svh,700px)] w-full overflow-hidden bg-ink"
    >
      {/* static fallback: only visible if WebGL is unavailable (the terrain canvas is opaque) */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(90%_60%_at_60%_78%,rgb(var(--ice)/0.16),transparent_62%),radial-gradient(60%_40%_at_70%_82%,rgb(var(--laser)/0.12),transparent_70%)]"
      />
      {/* the world */}
      <div ref={canvasWrap} className="absolute -inset-x-0 -top-[2%] h-[106%] will-change-transform">
        <TerrainCanvas scrollRef={progress} introReady={boot.done} className="absolute inset-0" />
      </div>

      {/* legibility scrims — kept deliberately light so the terrain stays luminous */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink/80 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_14%_36%,rgb(var(--ink)/0.55)_0%,rgb(var(--ink)/0.2)_45%,transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-ink via-ink/55 to-transparent" />

      <div ref={content} className="wrap relative z-10 flex h-full flex-col-reverse justify-between pb-[clamp(2.75rem,5vw,4.25rem)] pt-[clamp(6rem,13vh,8.5rem)]">
        {/* the name — first in DOM for semantics, visually anchored to the bottom */}
        <div ref={nameWrap} className="w-full overflow-hidden pb-[0.04em] pt-2">
          <h1
            ref={nameRef}
            aria-label={profile.name}
            className="name h-display inline-block whitespace-nowrap text-bone"
            style={{ letterSpacing: "-0.04em", lineHeight: 0.86 }}
          >
            {NAME_WORDS.map((word, wi) => (
              <span key={word} className="word block whitespace-nowrap sm:inline-block">
                {[...word].map((c, i) => (
                  <span key={i} aria-hidden="true" className="ch inline-block will-change-transform">
                    {c}
                  </span>
                ))}
                {wi === 0 && <span aria-hidden="true" className="hidden w-[0.22em] sm:inline-block">&nbsp;</span>}
              </span>
            ))}
          </h1>
        </div>

        <div className="grid items-start gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7 xl:col-span-6">
            <p className="hero-fade label mb-6 sm:mb-8">
              <span className="mr-3 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-laser align-middle [animation:blink_1.4s_infinite]" />
              {profile.role} <span className="text-bone-mute">·</span> {profile.org}
            </p>

            <SplitReveal as="p" split="lines" afterBoot stagger={0.12} className="h-display text-[clamp(2.5rem,6.4vw,6.75rem)] !leading-[0.92]">
              I measure<br />
              <span className="serif text-[1.08em] normal-case tracking-[-0.02em]">worlds<span className="text-laser">.</span></span>
            </SplitReveal>

            <p className="hero-fade lede mt-6 max-w-[34rem] sm:mt-8">{profile.tagline}</p>

            <div className="hero-fade mt-8 flex flex-wrap items-center gap-3 sm:mt-10">
              <Magnetic strength={0.22}>
                <a href="#projects" className="btn btn--solid">
                  See the work <span aria-hidden="true" className="arrow">↓</span>
                </a>
              </Magnetic>
              <Magnetic strength={0.22}>
                <a href={profile.resume.href} download={profile.resume.filename} className="btn">
                  Résumé <span aria-hidden="true" className="arrow">↓</span>
                </a>
              </Magnetic>
            </div>
          </div>

          <ScanPanel className="hero-fade hidden lg:col-span-5 lg:col-start-8 lg:block xl:col-span-4 xl:col-start-9" />
        </div>
      </div>

      {/* scroll cue — sits on the HUD baseline, centred */}
      <p aria-hidden="true" className="label pointer-events-none absolute bottom-[1.05rem] left-1/2 z-10 hidden -translate-x-1/2 !text-bone/60 md:block">
        Scroll <span className="inline-block [animation:nudge_1.8s_var(--ease-io)_infinite]">↓</span>
      </p>
    </section>
  );
}

/* ── live instrument readout ───────────────────────────────────────────── */

function ScanPanel({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState(0);
  const total = useRef<HTMLSpanElement>(null);
  const rateEl = useRef<HTMLSpanElement>(null);
  const incEl = useRef<HTMLSpanElement>(null);
  const count = useRef(1_204_331);
  const m = MODES[mode];

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const id = window.setInterval(() => setMode((x) => (x + 1) % MODES.length), 5600);
    return () => window.clearInterval(id);
  }, []);

  /* points counter */
  useEffect(() => {
    let last = performance.now();
    const pps = m.rate * pointsPerScan(m.inc);
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      count.current += pps * dt;
      if (total.current) total.current.textContent = Math.floor(count.current).toLocaleString("en-US");
    };
    gsap.ticker.add(tick as never);
    return () => gsap.ticker.remove(tick as never);
  }, [m.rate, m.inc]);

  /* decode the changing values */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (rateEl.current) gsap.to(rateEl.current, { duration: 0.6, scrambleText: { text: `${m.rate} Hz`, chars: "0123456789", speed: 0.9 } });
    if (incEl.current) gsap.to(incEl.current, { duration: 0.6, scrambleText: { text: `${m.inc.toFixed(2)}°`, chars: "0123456789", speed: 0.9 } });
  }, [m.rate, m.inc]);

  return (
    <div className={`ticks border border-bone/15 bg-ink/40 p-5 backdrop-blur-[2px] ${className}`} data-no-ping>
      <div className="mb-4 flex items-center justify-between">
        <p className="label label-strong flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1.2s_infinite]" />
          Pushbroom LiDAR · live
        </p>
        <div className="flex gap-1.5" role="img" aria-label={`Configuration ${mode + 1} of ${MODES.length}`}>
          {MODES.map((_, i) => (
            <span key={i} className={`h-1.5 w-4 transition-colors duration-500 ${i === mode ? "bg-laser" : "bg-bone/20"}`} />
          ))}
        </div>
      </div>
      <dl className="space-y-2.5">
        {[
          ["Scan rate", <span key="r" ref={rateEl}>{m.rate} Hz</span>],
          ["Angular increment", <span key="i" ref={incEl}>{m.inc.toFixed(2)}°</span>],
          ["Field of view", "270°"],
          ["Max range", "20.0 m"],
          ["Points acquired", <span key="p" ref={total} className="text-laser">1,204,331</span>],
        ].map(([k, v]) => (
          <div key={String(k)} className="flex items-baseline justify-between gap-6 border-b border-bone/10 pb-2.5 last:border-0 last:pb-0">
            <dt className="label">{k}</dt>
            <dd className="mono tnum text-[0.8rem] tracking-wide text-bone">{v}</dd>
          </div>
        ))}
      </dl>
      <a href="#experience" className="label link mt-4 inline-block !text-bone-dim hover:!text-bone">
        Run the trade study →
      </a>
    </div>
  );
}
