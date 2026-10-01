"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/lib/gsap";
import { menuStore, sectionStore, useStore } from "@/lib/store";
import { profile, sections } from "@/data/profile";
import { scrollToTarget, startScroll, stopScroll } from "@/lib/scroll";
import { TLink, useTransition } from "./Transition";
import Magnetic from "../ui/Magnetic";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Fixed header + full-screen menu. The bar uses `mix-blend-mode: difference`
 * so it stays legible over the terrain, dark sections and cream figures alike.
 */
export default function Header() {
  const open = useStore(menuStore);
  const section = useStore(sectionStore);
  const pathname = usePathname();
  const isHome = pathname === "/";
  const { go } = useTransition();

  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const first = useRef(true);

  const close = useCallback(() => menuStore.set(false), []);

  /* open / close choreography */
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const rows = el.querySelectorAll("[data-menu-row]");
    const fades = el.querySelectorAll("[data-menu-fade]");
    gsap.killTweensOf([el, rows, fades]);
    if (open) {
      stopScroll();
      gsap.set(el, { display: "block", visibility: "visible" });
      gsap
        .timeline()
        .fromTo(el, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.95, ease: "expo.inOut" })
        .fromTo(rows, { yPercent: 108 }, { yPercent: 0, duration: 1.1, stagger: 0.055, ease: "expo.out" }, 0.28)
        .fromTo(fades, { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.07 }, 0.5);
      window.setTimeout(() => el.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true }), 520);
    } else {
      gsap
        .timeline({
          onComplete: () => {
            gsap.set(el, { display: "none", visibility: "hidden" });
            startScroll();
          },
        })
        .to(fades, { autoAlpha: 0, duration: 0.25 }, 0)
        .to(el, { clipPath: "inset(0 0 100% 0)", duration: 0.75, ease: "expo.inOut" }, 0.05);
      toggle.current?.focus({ preventScroll: true });
    }
  }, [open]);

  /* keyboard: Esc closes, Tab stays inside the dialog */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (!f.length) return;
        const firstEl = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // a route change always closes the menu
  useEffect(() => { menuStore.set(false); }, [pathname]);

  const choose = (id: string) => {
    close();
    window.setTimeout(() => {
      if (isHome) {
        // Opening the menu froze Lenis, and the close animation only thaws it once it has finished
        // (~0.8 s). Lenis ignores scrollTo() while frozen, and a start() landing mid-glide would cancel
        // it — so thaw it here first (start() is a no-op when already running).
        startScroll();
        scrollToTarget(id === "top" ? 0 : `#${id}`, { duration: 1.8 });
      } else {
        go(id === "top" ? "/" : `/#${id}`, sections.find((s) => s.id === id)?.label);
      }
    }, 520);
  };

  const current = isHome ? sections.find((s) => s.id === section.id) : undefined;

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[75] text-white mix-blend-difference">
        <div className="wrap flex items-center justify-between py-5 md:py-6">
          <TLink
            href="/"
            label="Home"
            aria-label="Sarthak Sahai — home"
            className="pointer-events-auto group flex items-baseline gap-2 leading-none"
          >
            <span className="h-display text-[0.95rem] tracking-[-0.01em] md:text-[1.05rem]">Sarthak</span>
            <span className="serif text-[1.2rem] md:text-[1.35rem]">Sahai</span>
          </TLink>

          <p className="label hidden !text-white/80 md:block" aria-live="polite">
            {current && current.id !== "top" ? (
              <>
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-white align-middle" />
                {current.n} — {current.label}
              </>
            ) : isHome ? (
              <>
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-white align-middle [animation:blink_1.6s_infinite]" />
                Scan active
              </>
            ) : (
              "Case study"
            )}
          </p>

          <div className="pointer-events-auto flex items-center gap-5 md:gap-7">
            <a
              href={profile.resume.href}
              download={profile.resume.filename}
              className="label link hidden !text-white sm:inline"
            >
              Résumé ↓
            </a>
            <Magnetic strength={0.25}>
              <button
                ref={toggle}
                onClick={() => menuStore.set(!open)}
                aria-expanded={open}
                aria-controls="site-menu"
                className="group flex items-center gap-3"
              >
                <span className="label !text-white">{open ? "Close" : "Menu"}</span>
                <span aria-hidden="true" className="relative block h-2.5 w-7">
                  <span
                    className={`absolute left-0 top-0 h-px w-full bg-white transition-transform duration-500 ease-out ${open ? "translate-y-[5px] rotate-45" : ""}`}
                  />
                  <span
                    className={`absolute bottom-0 left-0 h-px bg-white transition-all duration-500 ease-out ${open ? "w-full -translate-y-[4px] -rotate-45" : "w-4 group-hover:w-full"}`}
                  />
                </span>
              </button>
            </Magnetic>
          </div>
        </div>
      </header>

      {/* ── MENU OVERLAY ─────────────────────────────────────────────── */}
      <div
        id="site-menu"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        aria-hidden={!open}
        className="fixed inset-0 z-[70] overflow-y-auto bg-ink"
        style={{ display: "none", visibility: "hidden", clipPath: "inset(0 0 100% 0)" }}
        data-lenis-prevent
      >
        <div className="wrap grid min-h-full gap-10 pb-10 pt-28 lg:grid-cols-[1.5fr_1fr] lg:pt-32">
          <nav aria-label="Primary" className="self-center">
            <ol className="space-y-0.5 md:space-y-1">
              {sections.map((s) => (
                <li key={s.id} className="overflow-hidden" onMouseEnter={(e) => scrambleHint(e.currentTarget, s.hint)}>
                  <div data-menu-row>
                    <a
                      href={s.id === "top" ? "/" : `/#${s.id}`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        choose(s.id);
                      }}
                      className="menu-link group flex items-baseline gap-4 py-1.5 md:gap-6"
                      aria-current={current?.id === s.id ? "true" : undefined}
                    >
                      <span className="label w-7 shrink-0 tnum">{s.n}</span>
                      <span className="h-display text-[clamp(2.1rem,7.2vw,6.5rem)] leading-[0.95] transition-[padding,color] duration-500 ease-out group-hover:pl-4 group-hover:text-laser md:group-hover:pl-8">
                        {s.label}
                      </span>
                      <span className="menu-hint label ml-auto hidden max-w-[16rem] text-right opacity-0 transition-opacity duration-300 group-hover:opacity-100 xl:block">
                        {s.hint}
                      </span>
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          </nav>

          <aside className="flex flex-col justify-end gap-10 lg:pb-2">
            <div data-menu-fade className="space-y-2">
              <p className="label">Open to opportunities</p>
              <p className="lede max-w-sm !text-bone">{profile.seeking}</p>
            </div>
            <div data-menu-fade className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <p className="label mb-1.5">Email</p>
                <a href={`mailto:${profile.email}`} className="link text-lg">{profile.email}</a>
              </div>
              <div>
                <p className="label mb-1.5">LinkedIn</p>
                <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="link text-lg">
                  {profile.linkedinHandle} ↗
                </a>
              </div>
              <div>
                <p className="label mb-1.5">Résumé · {profile.resume.edition}</p>
                <a href={profile.resume.href} download={profile.resume.filename} className="link text-lg">Download PDF ↓</a>
              </div>
            </div>
            <p data-menu-fade className="label">
              {profile.name} ({profile.pronouns}) · {profile.program}, {profile.school}
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}

/** Small flourish: the hovered row's hint text decodes itself. */
function scrambleHint(li: HTMLElement, text: string) {
  const hint = li.querySelector<HTMLElement>(".menu-hint");
  if (!hint || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  gsap.killTweensOf(hint);
  gsap.to(hint, { duration: 0.55, ease: "none", scrambleText: { text, chars: "01·/—", speed: 0.9, revealDelay: 0.05 } });
}
