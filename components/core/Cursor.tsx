"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";
import { cursorReadout, useStore } from "@/lib/store";

/**
 * Custom cursor (fine pointers only).
 *   default        dot + lagging ring
 *   data-cursor="link"   ring grows (auto for a / button)
 *   data-cursor="view"   solid bubble with a label (data-cursor-label)
 *   data-cursor="drag"   bubble labelled DRAG
 *   data-cursor="scan"   LiDAR reticle with a live range readout
 *   data-cursor="hide"   cursor disappears
 */
export default function Cursor() {
  const root = useRef<HTMLDivElement>(null);
  const tag = useStore(cursorReadout);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = root.current;
    if (!fine || !el) return;

    document.documentElement.classList.add("has-cursor");
    const q = (s: string) => el.querySelector<HTMLElement>(s)!;
    const dot = q(".c-dot"), ring = q(".c-ring"), bubble = q(".c-bubble"), cross = q(".c-cross"), tagEl = q(".c-tag");
    const bubbleLabel = q(".c-bubble i");

    const dur = reduced ? 0 : 1;
    const mk = (target: HTMLElement, d: number) => ({
      x: gsap.quickTo(target, "x", { duration: d * dur, ease: "power3" }),
      y: gsap.quickTo(target, "y", { duration: d * dur, ease: "power3" }),
    });
    const dotQ = mk(dot, 0.05), ringQ = mk(ring, 0.34), bubbleQ = mk(bubble, 0.22), crossQ = mk(cross, 0.05), tagQ = mk(tagEl, 0.16);

    let shown = false;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const { clientX: x, clientY: y } = e;
      dotQ.x(x); dotQ.y(y); ringQ.x(x); ringQ.y(y); bubbleQ.x(x); bubbleQ.y(y); crossQ.x(x); crossQ.y(y);
      tagQ.x(x + 22); tagQ.y(y + 22);
      if (!shown) {
        shown = true;
        el.dataset.visible = "1";
        // snap on first move so nothing streaks in from the corner
        [dot, ring, bubble, cross].forEach((n) => gsap.set(n, { x, y }));
        gsap.set(tagEl, { x: x + 22, y: y + 22 });
      }
    };

    // Walk up from the target: the deepest element that opts in (data-cursor) or is
    // natively interactive wins — so a button inside a "scan" region still reads as a link.
    const INTERACTIVE = "a, button, [role='button'], summary, label, input[type='range']";
    const FORM = "input:not([type='range']), textarea, select, video[controls]";
    const setState = (t: EventTarget | null) => {
      let node = t as HTMLElement | null;
      while (node && node !== document.body) {
        const s = node.dataset?.cursor;
        if (s) {
          el.dataset.state = s;
          if (s === "view" || s === "drag") bubbleLabel.textContent = node.dataset.cursorLabel ?? (s === "drag" ? "Drag" : "View");
          return;
        }
        if (node.matches?.(FORM)) { el.dataset.state = "hide"; return; }
        if (node.matches?.(INTERACTIVE)) { el.dataset.state = "link"; return; }
        node = node.parentElement;
      }
      el.dataset.state = "default";
    };
    const over = (e: PointerEvent) => e.pointerType === "mouse" && setState(e.target);
    const down = () => (el.dataset.pressed = "1");
    const up = () => delete el.dataset.pressed;
    const leave = () => delete el.dataset.visible, enter = () => shown && (el.dataset.visible = "1");

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerover", over, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    document.documentElement.addEventListener("pointerenter", enter);

    return () => {
      document.documentElement.classList.remove("has-cursor");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.documentElement.removeEventListener("pointerenter", enter);
    };
  }, []);

  return (
    <div ref={root} className="cursor" data-state="default" aria-hidden="true">
      <div className="c-part c-ring"><i /></div>
      <div className="c-part c-dot"><i /></div>
      <div className="c-part c-bubble"><i>View</i></div>
      <div className="c-part c-cross">
        <svg width="34" height="34" viewBox="-17 -17 34 34" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M-16 0H-5M5 0H16M0 -16V-5M0 5V16" />
          <circle r="9" strokeDasharray="2 3" />
        </svg>
      </div>
      <div className="c-part c-tag"><span>{tag || "NO RETURN"}</span></div>
    </div>
  );
}
