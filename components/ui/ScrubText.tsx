"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap, SplitText } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

/**
 * Words brighten one by one as the block scrolls through the viewport (scrubbed, reversible).
 * Unread words start at 42 % opacity — still ≥ 3:1 against the page for large type.
 */
export default function ScrubText({
  as: Tag = "p",
  children,
  className = "",
  from = 0.42,
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
            scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 52%", scrub: 0.6 },
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
