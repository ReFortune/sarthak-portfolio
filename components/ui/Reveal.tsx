"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

type Props = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
  start?: string;
  /** Reveal matching descendants one by one instead of the wrapper. */
  selector?: string;
  stagger?: number;
  id?: string;
};

/** Fade + rise on scroll. Uses opacity (not visibility) so keyboard focus can always reach content. */
export default function Reveal({
  as: Tag = "div",
  children,
  className,
  delay = 0,
  y = 40,
  duration = 1.2,
  start = "top 90%",
  selector,
  stagger = 0.09,
  id,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useGsap(ref, ({ motion }) => {
    const el = ref.current!;
    if (!motion) return;
    const targets = selector ? el.querySelectorAll(selector) : el;
    gsap.from(targets, {
      opacity: 0,
      y,
      duration,
      delay,
      stagger: selector ? stagger : 0,
      ease: "expo.out",
      scrollTrigger: { trigger: el, start, once: true },
    });
  }, []);

  return (
    <Tag ref={ref} id={id} className={className}>
      {children}
    </Tag>
  );
}
