"use client";

import { useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import { gsap, SplitText } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";
import { bootStore } from "@/lib/store";

type Props = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  split?: "lines" | "words" | "chars";
  /** ScrollTrigger start position. */
  start?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
  yPercent?: number;
  /** Hold the reveal until the preloader has lifted (above-the-fold hero text). */
  afterBoot?: boolean;
  id?: string;
};

/**
 * Masked line / word / character reveal. Uses GSAP SplitText with autoSplit so it re-flows
 * correctly when web fonts load or the viewport resizes. Text stays fully accessible
 * (SplitText adds aria-label) and renders plainly for reduced-motion users.
 */
export default function SplitReveal({
  as: Tag = "div",
  children,
  className,
  style,
  split = "lines",
  start = "top 88%",
  delay = 0,
  stagger,
  duration = 1.25,
  yPercent = 112,
  afterBoot = false,
  id,
}: Props) {
  const ref = useRef<HTMLElement>(null);

  useGsap(ref, ({ motion }) => {
    const el = ref.current!;
    if (!motion) {
      el.style.visibility = "visible";
      return;
    }
    const type = split === "chars" ? "words,chars" : split;
    const key = split === "chars" ? "chars" : split === "words" ? "words" : "lines";
    const step = stagger ?? (split === "chars" ? 0.028 : split === "words" ? 0.06 : 0.1);

    let unsub: (() => void) | undefined;
    const inst = SplitText.create(el, {
      type,
      mask: key,
      autoSplit: true,
      aria: "none",
      onSplit: (self: SplitText) => {
        el.style.visibility = "visible";
        const targets = self[key];
        const tween = gsap.from(targets, {
          yPercent,
          duration,
          delay,
          stagger: step,
          ease: "expo.out",
          paused: true,
        });
        if (afterBoot) {
          const play = () => bootStore.get().done && tween.play();
          play();
          unsub = bootStore.subscribe(play);
        } else {
          ScrollTriggerOnce(el, start, () => tween.play());
        }
        return tween;
      },
    });
    return () => {
      unsub?.();
      inst.revert();
    };
  }, []);

  return (
    <Tag ref={ref} id={id} className={`sr-boot ${className ?? ""}`} style={style}>
      {children}
    </Tag>
  );
}

import { ScrollTrigger } from "@/lib/gsap";
function ScrollTriggerOnce(el: Element, start: string, cb: () => void) {
  ScrollTrigger.create({ trigger: el, start, once: true, onEnter: cb });
}
