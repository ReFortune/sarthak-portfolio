"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "@/lib/gsap";
import { chapterStore, menuStore, sectionStore, useStore } from "@/lib/store";
import { profile, sections } from "@/data/profile";
import { scrollToTarget, startScroll, stopScroll } from "@/lib/scroll";
import { TLink, useTransition } from "./Transition";
import Magnetic from "../ui/Magnetic";

/** Always-visible desktop shortcuts — plain words, one click to the three things a visitor most often wants. */
const quick = [
  { id: "projects", label: "Projects" },
  { id: "experience", label: "Experience" },
  { id: "contact", label: "Contact" },
] as const;

/**
 * Fixed header + full-screen menu. The bar uses `mix-blend-mode: difference`
 * so it stays legible over the terrain, dark sections and cream figures alike.
 */
export default function Header() {
  const open = useStore(menuStore);
  const section = useStore(sectionStore);
  const chapter = useStore(chapterStore);
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

  const jump = (id: string) => {
    if (isHome) scrollToTarget(`#${id}`, { duration: 1.6 });
    else go(`/#${id}`, sections.find((x) => x.id === id)?.label);
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
            className="pointer-events-auto group flex min-h-11 items-center gap-2 leading-none"
            onClick={(e) => {
              // The logo sits above the open menu; send it through the same close-then-go path as "Home".
              if (!open || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              choose("top");
            }}
          >
            <span className="h-display text-[0.95rem] tracking-[-0.01em] md:text-[1.05rem]">Sarthak</span>
            <span className="serif -translate-y-px text-[1.2rem] md:text-[1.35rem]">Sahai</span>
          </TLink>

          {/* desktop quick links — the active section is underlined, so the bar doubles as "where am I" */}
          <nav aria-label="Quick links" className="pointer-events-auto hidden items-center md:flex">
            {quick.map((q) => (
              <a
                key={q.id}
                href={isHome ? `#${q.id}` : `/#${q.id}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  jump(q.id);
                }}
                aria-current={current?.id === q.id ? "true" : undefined}
                className={`label relative inline-flex min-h-11 items-center px-4 !text-[0.78rem] transition-colors hover:!text-white lg:px-5 ${current?.id === q.id ? "!text-white" : "!text-white/75"}`}
              >
                {q.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-4 bottom-2.5 h-px origin-left bg-white transition-transform duration-500 ease-out lg:inset-x-5 ${current?.id === q.id ? "scale-x-100" : "scale-x-0"}`}
                />
              </a>
            ))}
            <a
              href={profile.resume.href}
              download={profile.resume.filename}
              className="label relative inline-flex min-h-11 items-center px-4 !text-[0.78rem] !text-white/75 transition-colors hover:!text-white lg:px-5"
            >
              Résumé ↓
            </a>
          </nav>

          <div className="pointer-events-auto flex items-center gap-5 md:gap-7">
            <a
              href={profile.resume.href}
              download={profile.resume.filename}
              className="label link hidden min-h-11 items-center !text-white sm:inline-flex md:!hidden"
            >
              Résumé ↓
            </a>
            <Magnetic strength={0.25}>
              <button
                ref={toggle}
                onClick={() => menuStore.set(!open)}
                aria-expanded={open}
                aria-controls="site-menu"
                className="group -mr-2 flex min-h-11 items-center gap-3 px-2"
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
        <div className="wrap grid min-h-full gap-10 pb-8 pt-24 sm:pb-10 sm:pt-28 lg:grid-cols-[1.5fr_1fr] lg:pt-32">
          <nav aria-label="Primary" className="self-center">
            <ol className="space-y-0 md:space-y-1">
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
                      className="menu-link group relative flex min-h-11 items-baseline gap-4 py-1 md:gap-6 md:py-1.5"
                      aria-current={current?.id === s.id ? "true" : undefined}
                    >
                      <span className="label w-7 shrink-0 tnum">{s.n}</span>
                      <span className="h-display text-[clamp(2.1rem,min(7.2vw,calc((100svh-340px)/9.5)),6.5rem)] leading-[0.95] transition-[padding,color] duration-500 ease-out group-hover:pl-4 group-hover:text-laser md:group-hover:pl-8">
                        {s.label}
                      </span>
                      <span className="menu-hint label ml-auto hidden max-w-[16rem] text-right opacity-0 transition-opacity duration-300 group-hover:opacity-100 xl:absolute xl:right-0 xl:top-1/2 xl:ml-0 xl:block xl:-translate-y-1/2">
                        {s.hint}
                      </span>
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          </nav>

          <aside className="flex flex-col justify-end gap-6 sm:gap-10 lg:pb-2">
            <div data-menu-fade className="hidden space-y-2 sm:block">
              <p className="label">Open to opportunities</p>
              <p className="lede max-w-sm !text-bone">{profile.seeking}</p>
            </div>
            <div data-menu-fade className="grid gap-x-6 gap-y-1 sm:grid-cols-2 sm:gap-y-5 lg:grid-cols-1">
              <div>
                <p className="label mb-0.5 sm:mb-1.5">Email</p>
                <a href={`mailto:${profile.email}`} className="link inline-flex min-h-11 items-center text-lg sm:min-h-0">{profile.email}</a>
              </div>
              <div>
                <p className="label mb-0.5 sm:mb-1.5">LinkedIn</p>
                <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-11 items-center text-lg sm:min-h-0">
                  {profile.linkedinHandle} ↗
                </a>
              </div>
              <div>
                <p className="label mb-0.5 sm:mb-1.5">Résumé · {profile.resume.edition}</p>
                <a href={profile.resume.href} download={profile.resume.filename} className="link inline-flex min-h-11 items-center text-lg sm:min-h-0">Download PDF ↓</a>
              </div>
            </div>
            <p data-menu-fade className="label hidden sm:block">
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
