"use client";

import { useRef } from "react";
import Image from "next/image";
import { gsap } from "@/lib/gsap";
import { profile } from "@/data/profile";

/** The résumé as a physical two-page document that tilts toward the pointer. */
export default function ResumeDeck() {
  const stage = useRef<HTMLAnchorElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = stage.current!.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(tilt.current, { rotateY: px * 14, rotateX: -py * 10, duration: 0.8, ease: "power3.out" });
    gsap.to(back.current, { x: 28 + px * 22, y: 10 + py * 10, rotate: 4 + px * 3, duration: 0.9, ease: "power3.out" });
  };
  const onLeave = () => {
    gsap.to(tilt.current, { rotateY: 0, rotateX: 0, duration: 1.1, ease: "expo.out" });
    gsap.to(back.current, { x: 26, y: 10, rotate: 4, duration: 1.1, ease: "expo.out" });
  };

  return (
    <a
      ref={stage}
      href={profile.resume.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open the résumé (${profile.resume.edition}) as a PDF in a new tab`}
      data-cursor="view"
      data-cursor-label="Open"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className="group relative mx-auto block w-[min(88%,25rem)] [perspective:1400px]"
    >
      <div ref={tilt} className="relative [transform-style:preserve-3d]">
        <div ref={back} className="absolute inset-0 translate-x-[26px] translate-y-[10px] rotate-[4deg] overflow-hidden rounded-[3px] bg-paper opacity-90 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.7)]">
          <Image src="/assets/resume/page-2.webp" alt="" fill sizes="25rem" className="object-cover" />
        </div>
        <div className="relative aspect-[8.5/11] overflow-hidden rounded-[3px] bg-paper shadow-[0_40px_80px_-24px_rgb(0_0_0/0.8)] ring-1 ring-bone/10">
          <Image
            src="/assets/resume/page-1.webp"
            alt={`Page one of ${profile.name}'s résumé, ${profile.resume.edition}`}
            fill
            sizes="25rem"
            className="object-cover"
          />
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/10 opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
        </div>
      </div>
    </a>
  );
}
