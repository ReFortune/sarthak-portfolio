"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { getLenis, scrollToTarget } from "@/lib/scroll";

type Ctx = { go: (href: string, label?: string) => void };
const TransitionCtx = createContext<Ctx>({ go: () => {} });
export const useTransition = () => useContext(TransitionCtx);

const COLS = 5;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const done = (tl: gsap.core.Timeline) => new Promise<void>((r) => tl.eventCallback("onComplete", () => r()));

/**
 * Route transitions: a five-column curtain with a laser leading edge sweeps up over the
 * page, the router swaps underneath, then it sweeps away. Reduced motion → instant.
 */
export function TransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const busy = useRef(false);
  const arrived = useRef<null | (() => void)>(null);

  useEffect(() => {
    arrived.current?.();
  }, [pathname]);

  const go = useCallback(
    async (href: string, label?: string) => {
      if (busy.current) return;
      const url = new URL(href, window.location.href);
      const samePath = url.pathname === window.location.pathname;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (samePath) {
        scrollToTarget(url.hash || 0, { duration: 1.6 });
        if (url.hash) history.replaceState(null, "", url.hash);
        return;
      }
      if (reduced || !root.current) {
        router.push(href);
        return;
      }

      busy.current = true;
      const el = root.current;
      const cols = el.querySelectorAll(".tcol");
      getLenis()?.stop();
      if (labelRef.current) labelRef.current.textContent = label ?? "";
      gsap.set(el, { display: "flex", pointerEvents: "auto" });

      const cover = gsap.timeline();
      cover
        .fromTo(cols, { scaleY: 0 }, { scaleY: 1, duration: 0.8, ease: "expo.inOut", stagger: 0.06, transformOrigin: "50% 100%" })
        .fromTo(labelRef.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5 }, 0.35);
      await done(cover);

      const arrival = new Promise<void>((res) => (arrived.current = res));
      router.push(href);
      await Promise.race([arrival, sleep(5000)]);
      arrived.current = null;

      window.scrollTo(0, 0);
      getLenis()?.scrollTo(0, { immediate: true, force: true });
      ScrollTrigger.refresh();
      await sleep(140);
      if (url.hash) scrollToTarget(url.hash, { immediate: true, force: true });

      const reveal = gsap.timeline();
      reveal
        .to(labelRef.current, { autoAlpha: 0, y: -14, duration: 0.3 }, 0)
        .to(cols, { scaleY: 0, duration: 0.85, ease: "expo.inOut", stagger: 0.06, transformOrigin: "50% 0%" }, 0.05);
      await done(reveal);

      gsap.set(el, { display: "none", pointerEvents: "none" });
      getLenis()?.start();
      busy.current = false;
    },
    [router]
  );

  return (
    <TransitionCtx.Provider value={{ go }}>
      {children}
      <div
        ref={root}
        aria-hidden="true"
        className="fixed inset-0 z-[95] hidden pointer-events-none"
        style={{ display: "none" }}
      >
        {Array.from({ length: COLS }).map((_, i) => (
          <div key={i} className="tcol relative h-full flex-1 scale-y-0 bg-ink-2 will-change-transform">
            <span className="absolute inset-x-0 top-0 h-px bg-laser" />
            <span className="absolute inset-y-0 left-0 w-px bg-bone/10" />
          </div>
        ))}
        <span
          ref={labelRef}
          className="label label-strong absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0"
        />
      </div>
    </TransitionCtx.Provider>
  );
}

type TLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  label?: string;
  children: ReactNode;
};

/** Internal link that plays the route transition. */
export function TLink({ href, label, children, onClick, ...rest }: TLinkProps) {
  const { go } = useTransition();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href, label);
      }}
    >
      {children}
    </Link>
  );
}
