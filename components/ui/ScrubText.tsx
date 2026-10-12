"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap, SplitText } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

/**
 * Words brighten one by one as the block scrolls through the viewport (scrubbed, reversible).
 * Unread words start at 72 % opacity — comfortably readable before the highlight reaches them.
 */
export default function ScrubText({
  as: Tag = "p",
  children,
  className = "",
  from = 0.72,
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  from?: number;
}) {
  const ref = useRef<HTMLElement>(null);

  useGsap(ref, ({ motion }) => {
    const el = ref.current!;
    if (!motion) return;
    const split = SplitText.create(el, {
      type: "words",
      autoSplit: true,
      aria: "none", // keep the real text in the DOM; aria-label on a <p> is invalid ARIA
      onSplit: (self: SplitText) => {
        return gsap.fromTo(
          self.words,
          { opacity: from },
          {
            opacity: 1,
            ease: "none",
            stagger: 0.12,
            scrollTrigger: { trigger: el, start: "top 90%", end: "bottom 60%", scrub: 0.6 },
          }
        );
      },
    });
    return () => split.revert();
  }, []);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
