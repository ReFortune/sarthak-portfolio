"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

/**
 * "Scanned into existence": content is revealed behind a moving laser line.
 * Wrap any figure / image / panel. Reduced motion → shown immediately.
 */
export default function ScanFrame({
  children,
  className = "",
  delay = 0,
  start = "top 88%",
  direction = "down",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  start?: string;
  direction?: "down" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useGsap(ref, ({ motion }) => {
    if (!motion || !body.current || !line.current) return;
    const down = direction === "down";
    const axis = down ? "top" : "left";
    gsap.set(body.current, { clipPath: down ? "inset(0 0 100% 0)" : "inset(0 100% 0 0)" });
    gsap.set(line.current, { opacity: 1, [axis]: "0%" });

    const tl = gsap.timeline({
      paused: true,
      delay,
      onComplete: () => {
        gsap.set(body.current, { clearProps: "clipPath" });
      },
    });
    tl.to(body.current, { clipPath: "inset(0 0 0 0)", duration: 1.5, ease: "power3.inOut" }, 0)
      .to(line.current, { [axis]: "100%", duration: 1.5, ease: "power3.inOut" }, 0)
      .to(line.current, { opacity: 0, duration: 0.3 }, 1.35);

    const st = gsap.timeline({ scrollTrigger: { trigger: ref.current, start, once: true, onEnter: () => tl.play() } });
    return () => {
      st.kill();
      tl.kill();
    };
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div ref={body} className="h-full">
        {children}
      </div>
      <span
        ref={line}
        aria-hidden="true"
        className={`pointer-events-none absolute z-10 bg-laser opacity-0 shadow-[0_0_18px_2px_rgb(var(--laser)/0.6)] ${
          direction === "down" ? "inset-x-0 h-px" : "inset-y-0 w-px"
        }`}
      />
    </div>
  );
}
