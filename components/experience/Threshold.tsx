"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";
import { bootStore, useStore } from "@/lib/store";
import { profile } from "@/data/profile";
import { lerp, smoothstep } from "@/lib/math";
import Magnetic from "../ui/Magnetic";
import SplitReveal from "../ui/SplitReveal";
import { TLink } from "../core/Transition";

const NAME_WORDS = ["SARTHAK", "SAHAI"];

/** The first beat: who this is, and the name set large at the bottom of the frame, as on the hero. */
export default function Threshold() {
  const root = useRef<HTMLDivElement>(null);
  const nameWrap = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const boot = useStore(bootStore);

  /* fit the name to the container, then the cursor-proximity width effect */
  useEffect(() => {
    const wrap = nameWrap.current;
    const name = nameRef.current;
    if (!wrap || !name) return;
    const chars = Array.from(name.querySelectorAll<HTMLElement>(".ch"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const BASE_W = 112;
    const BASE_WGHT = 650;

    const fit = () => {
      const held = chars.map((c) => [c.style.getPropertyValue("--w"), c.style.getPropertyValue("--g")] as const);
      for (const c of chars) {
        c.style.setProperty("--w", String(BASE_W));
        c.style.setProperty("--g", String(BASE_WGHT));
      }
      name.style.fontSize = "100px";
      const w = name.getBoundingClientRect().width;
      if (w > 0) name.style.fontSize = `${(100 * wrap.clientWidth * 0.972) / w}px`;
      chars.forEach((c, i) => {
        for (const [k, v] of [["--w", held[i][0]], ["--g", held[i][1]]] as const) {
          if (v) c.style.setProperty(k, v);
          else c.style.removeProperty(k);
        }
      });
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

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
    <div ref={root} className="wrap relative flex h-full flex-col-reverse justify-between pb-[clamp(2.75rem,5vw,4.25rem)] pt-[clamp(6rem,13vh,8.5rem)]">
      {/* the name: first in the DOM for semantics, drawn at the bottom of the frame */}
      <div ref={nameWrap} className="[pointer-events:var(--pe,auto)] w-full overflow-hidden pb-[0.04em] pt-2">
        <h1 ref={nameRef} aria-label={profile.name} className="name h-display inline-block whitespace-nowrap text-bone" style={{ letterSpacing: "-0.04em", lineHeight: 0.86 }}>
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

      <div className="max-w-[44rem]">
        <div className="hero-fade mb-6 space-y-2 sm:mb-8">
          <p className="label label-strong text-balance !text-[0.8rem] !leading-relaxed !text-bone sm:!text-[0.85rem]">
            <span className="mr-3 inline-block h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full bg-laser [animation:blink_1.4s_infinite]" />
            {profile.role}
            <span className="mx-2 hidden text-bone-mute sm:inline">·</span>
            <br className="sm:hidden" />
            {profile.org}
          </p>
          <p className="label !text-[0.75rem] !normal-case !tracking-[0.04em] sm:!text-[0.8rem]">
            {profile.program}, {profile.school} <span className="text-bone-mute">·</span> {profile.graduation}
          </p>
        </div>

        <SplitReveal as="h2" split="lines" afterBoot stagger={0.12} className="h-display text-[clamp(2.1rem,5.5vw,5.9rem)] !leading-[0.92]">
          {profile.hook.lead}
          <br />
          <span className="serif text-[1.08em] normal-case tracking-[-0.02em]">
            {profile.hook.accent}
            <span className="text-laser">.</span>
          </span>
        </SplitReveal>

        <p className="hero-fade lede mt-6 max-w-[34rem] sm:mt-8">{profile.tagline}</p>

        <div className="[pointer-events:var(--pe,auto)] hero-fade mt-8 flex flex-wrap items-center gap-3 sm:mt-10">
          <Magnetic strength={0.22}>
            <a href="#profile" className="btn btn--solid">
              Begin <span aria-hidden="true" className="arrow">↓</span>
            </a>
          </Magnetic>
          <Magnetic strength={0.22}>
            <a href={profile.resume.href} download={profile.resume.filename} className="btn">
              Résumé <span aria-hidden="true" className="arrow">↓</span>
            </a>
          </Magnetic>
          <TLink href="/archive" label="Archive" className="label link inline-flex min-h-11 items-center !text-bone">
            Archive →
          </TLink>
        </div>
      </div>
    </div>
  );
}
