# Sarthak Sahai — Space Engineering Portfolio

A scroll-driven portfolio built around one idea: **I measure worlds.** The hero is a live LiDAR point cloud of a procedural
planetary surface that you can paint with your cursor; every section after it is an interactive instrument built from real
project data — a pushbroom-LiDAR simulator, a Mars coverage globe, an ascent profile, a transit-photometry lab, a rover route-planning demo and more.

Content is sourced from the **September 2026 résumé** (`public/resume.pdf`) and the project reports in `public/assets/`.
The one addition is **MPT (Mission Planning Tool)**, from my CSA internship. It is not on that résumé yet and is described in general terms only; the interactive planner next to it is an original demo on synthetic terrain, not CSA software or data.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS 3 + a CSS-variable design system (`app/globals.css`) |
| 3D | three.js (raw WebGL, custom point-cloud shaders) — **no React renderer**; loaded lazily per section |
| Motion | GSAP 3.13 (ScrollTrigger, SplitText, ScrambleText, DrawSVG) + Lenis smooth scroll |
| Type | Archivo (variable width/weight), Instrument Serif, Fragment Mono — self-hosted via `next/font` |

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run verify:planner   # checks the route-planning demo's engine against an independent reference (~20 s)
```

## Where things live

```
app/
  layout.tsx              fonts, metadata, JSON-LD, persistent chrome (Providers)
  page.tsx                the home page: Hero → … → Contact
  projects/[slug]/        case studies (NOVA, ROUTE-M, MPT, CHIRON) — statically generated
  icon.svg, apple-icon.png            favicon (bold SVG) + touch icon
  opengraph-image.jpg, twitter-image.jpg   social card — a screenshot of the real hero (see below)
  sitemap.ts, robots.ts, not-found.tsx
components/
  core/                   Providers, SmoothScroll, Preloader, Header + menu, Hud, Cursor, Transition
  hero/                   Hero, TerrainCanvas (React shell), terrainScene.ts (three.js)
  sections/               one file per home-page section
    lab/                  pushbroom-LiDAR simulator (PushbroomLab + pushbroomScene)
    projects/             sticky project stack, its jump index, and the six interactive "instruments"
      visuals/planner*    the route-planning demo: plannerEngine (terrain, sunlight, searches), plannerRender (canvas), PlannerVisual (UI)
    research/             TransitLab (HAT-P-18 b)
    leadership/           TrussBridge, TeamGrowth
  case/                   case-study pages + charts + figure lightbox
  ui/                     Reveal, SplitReveal, ScrubText, ScanFrame, CountUp, Marquee, Magnetic…
data/                     ALL content — edit these, not components
scripts/                  verify-planner.mjs — correctness checks for the route-planning demo's engine
lib/                      terrain.ts (procedural planet), gsap.ts, scroll.ts, store.ts, hooks.ts, math.ts
public/
  resume.pdf              the September 2026 résumé
  assets/                 figures, reports, video (paths are referenced from data/ and components/case/)
```

## Updating content

Everything textual lives in `data/`:

- `profile.ts` — name, role, links, hero copy, ticker figures, menu
- `experience.ts`, `projects.ts`, `leadership.ts`, `research.ts`, `skills.ts`, `education.ts` — one source of truth each
- `timeline.ts` is **derived** from the files above, so the Gantt can never drift from the rest of the site
- A new résumé → replace `public/resume.pdf`, re-render `public/assets/resume/page-{1,2}.webp`, update `profile.resume`

Only projects with `caseStudy: true` get a `/projects/<slug>` page (and a matching component in `components/case/`).
Prose counts ("Six projects…") and the case-study header ("Case study 05 / 06") are derived from `projects`, so adding a project keeps them right.

## The hero, briefly

`lib/terrain.ts` is a deterministic height field (fBm + three scales of craters + ridged mountains). `terrainScene.ts` streams
four density tiers of points past a rover-mounted camera — rows that fall behind are regenerated at the far end, so the GPU only
ever draws ~120k static points. A pushbroom scan plane colours points as they are "scanned"; the pointer paints light into the
terrain (world-space trail) and a click sends a ranging ping. The same height function drives the scan-fan ray hits, the camera's
terrain-following and the cursor's live range/elevation readout.

## Performance

- Initial JS ≈ **295 KB gzipped**. three.js is *not* in it — every 3D scene is dynamically imported when its section nears the viewport.
- Every render loop pauses off-screen (`IntersectionObserver`) and when the tab is hidden.
- Point clouds are updated with partial buffer ranges; `dpr` is capped (1.5 on touch / low-core devices, 2 elsewhere) and point counts scale down on small screens.
- Images are `next/image` (AVIF/WebP); figures were extracted from the reports and re-encoded as WebP (≈1.7 MB total).
- The 2:13 intro video is click-to-play with a poster, so its 11 MB (720p) never loads unprompted.

## The route-planning demo

`components/sections/projects/visuals/` holds a small route-planning demo written for this site: a procedural patch of cratered terrain with slope classes (Safe, Caution, No-Go), keep-out zones, a Fastest and a Safest objective, sunlight that changes over time, and a search that can wait for the light. A* and Dijkstra return identical routes; the search wavefront is the real expansion order.

What it is **not**: the terrain is synthetic and the parameters are illustrative, so it says nothing about any real tool or dataset; the patch is about a kilometre across; the sun swings far faster than a real one so a short drive shows what takes hours; and there is no battery model. The page says so. `npm run verify:planner` re-checks the engine against an independent reference (optimal costs to 1e-9 across all mode combinations, every sunlit-only arrival actually lit, the shadow mask against brute-force ray marching).

## Accessibility

- Semantic landmarks, a skip link, and a focus-trapped menu and lightbox (Esc closes; focus returns to the trigger)
- `prefers-reduced-motion`: no preloader, no smooth-scroll hijack, no scroll-linked animation; the hero renders a single still frame and every
  instrument shows its settled state
- Every interactive instrument has text equivalents (`aria-label`s, live readouts) and works from the keyboard (sliders, buttons). In the route planner the A/B pins move with the arrow keys (Shift = 5 cells), the drive scrubber is a real slider, and every plan is announced in a live region
- Custom cursor is enabled for fine pointers only; the native cursor is untouched on touch devices and inside form controls
- If WebGL is unavailable the hero falls back to a static gradient and each 3D instrument shows a short notice; all readouts keep working

## Notes on the interactive models

The simulators are **illustrative**, built from the project numbers rather than flight data, and are labelled as such on the page:

- *Pushbroom lab* — a 270° scanner over a patch of ground; along-track spacing v ÷ f, across-track ≈ H·Δθ ÷ sin β · (1 + (x·sin β ÷ H)²).
- *Mars globe* — real altitude/period (300 km, ≈113.4 min) and inclinations (~93° / ~45°); swath and time are exaggerated.
- *Transit lab* — the flux values are **digitised from Figure 6.1 of the HAT-P-18 b report** (validated: mean in-transit flux 0.9828 vs the paper's 0.98296).

## Regenerating the social card

`app/opengraph-image.jpg` (and its `twitter-image.jpg` copy) is a real screenshot of the hero so it uses the site's actual fonts and
terrain. If the hero changes: run the site, open it at **1440 × 756**, hide the header / HUD, screenshot it, and save it as a
1200 × 630 JPEG (≈ 180 KB) over both files.

## Deploy

Static export-friendly; deploy on Vercel with no configuration. Set `NEXT_PUBLIC_SITE_URL` to your real domain (e.g. `https://yourname.com`) so the sitemap and
Open Graph metadata carry the right absolute URLs. On Vercel it falls back to the project's production URL automatically;
locally it is `http://localhost:3000`.
