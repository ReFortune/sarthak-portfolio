# Sarthak Sahai — Space Engineering Portfolio

A portfolio built as one scroll-driven journey, around one idea: **I map worlds & plan the path.** The home page is a single continuous WebGL
world drawn in LiDAR points: scrolling moves a camera along a path of vermilion gates across a procedural planetary plain, through a ring of
six instruments (one for each project), up into a sky of three set pieces (a bridge being built, a planet crossing its star, a chart of skills),
and down a corridor of year gates to a sunrise. The words appear over it, a few at a time; the depth (every record, date and figure) opens in a
dossier drawer. The previous long-form page, with its interactive instruments (a pushbroom-LiDAR simulator, a Mars coverage globe, a transit-photometry lab,
a rover route-planning demo), is kept whole at **`/archive`**.
The headline lives in one place (`profile.hook` in `data/profile.ts`) and feeds the opening beat, the page title and the social-card text.

Content is sourced from the **September 2026 résumé** (`public/resume.pdf`) and the project reports in `public/assets/`.
The one addition is **MPT (Mission Planning Tool)**, a second project of my CSA internship. It is not on that résumé yet and is described in general terms only. It appears as its own project inside the CSA entry under Experience (findings, the live planner, a link onward) and as a card with a case study under Projects; the interactive planner is an original demo on synthetic terrain, not CSA software or data.

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
npm run verify:route     # checks the hero's route planner against an independent Dijkstra (~1 s)
```

## Where things live

```
app/
  layout.tsx              fonts, metadata, JSON-LD, persistent chrome (Providers)
  page.tsx                the home page: <Experience />, the scroll-driven journey
  archive/                the long-form page (Hero → … → Contact), kept whole
  projects/[slug]/        case studies (NOVA, ROUTE-M, MPT, CHIRON) — statically generated
  icon.svg, apple-icon.png            favicon (bold SVG) + touch icon
  opengraph-image.jpg, twitter-image.jpg   social card — a screenshot of the real hero (see below)
  sitemap.ts, robots.ts, not-found.tsx
components/
  experience/             the home page's DOM: Experience (track, stage, beats), Threshold (opening), content (the words of each beat),
                          Labels (tags the world draws), Rail, Dossier + records (the drawer)
  world/                  the home page's WebGL: world.ts (renderer, camera, frame loop), story.ts (the beat table), layout.ts (where everything is),
                          rig.ts (camera as a function of scroll), kit/ (terrain, rover, gates, post, sculptures…), acts/ (ring, sky, finale)
  core/                   Providers, SmoothScroll, Preloader, Header + menu, Hud, Cursor, Transition
  hero/                   Hero, TerrainCanvas (React shell), terrainScene.ts (three.js), routePlanner.ts (the planner behind the route)
  sections/               one file per home-page section
    lab/                  pushbroom-LiDAR simulator (PushbroomLab + pushbroomScene)
    traverse/             the scroll-scrubbed traverse's three.js scene (traverseScene.ts)
    projects/             sticky project stack, its jump index, and the six interactive "instruments"
      visuals/planner*    the route-planning demo: plannerEngine (terrain, sunlight, searches), plannerRender (canvas), PlannerVisual (UI)
    research/             TransitLab (HAT-P-18 b)
    leadership/           TrussBridge, TeamGrowth
  case/                   case-study pages + charts + figure lightbox
  ui/                     Reveal, SplitReveal, ScrubText, ScanFrame, CountUp, Marquee, Magnetic…
data/                     ALL content — edit these, not components (about.ts and constellation.ts are shared by the archive and the home page)
scripts/                  verify-planner.mjs, verify-route.mjs — correctness checks for the route-planning demo's engine and the hero's route planner
lib/                      terrain.ts (procedural planet), gsap.ts, scroll.ts, store.ts, hooks.ts, math.ts
public/
  resume.pdf              the September 2026 résumé
  assets/                 figures, reports, video (paths are referenced from data/ and components/case/)
```

## Updating content

Everything textual lives in `data/`:

- `profile.ts` — name, role, links, hero copy, ticker figures, menu
- `experience.ts`, `projects.ts`, `leadership.ts`, `research.ts`, `skills.ts`, `education.ts` — one source of truth each
- A role that spans more than one project (the CSA internship) sets `primary` (an intro for its main `findings`) and `streams` (further projects, each with its own heading, findings, optional demo and link) in `experience.ts`
- `timeline.ts` is **derived** from the files above, so the Gantt can never drift from the rest of the site
- A new résumé → replace `public/resume.pdf`, re-render `public/assets/resume/page-{1,2}.webp`, update `profile.resume`

Only projects with `caseStudy: true` get a `/projects/<slug>` page (and a matching component in `components/case/`).
Prose counts ("Six projects…") and the case-study header ("Case study 05 / 06") are derived from `projects`, so adding a project keeps them right.

## The home page, briefly

**One canvas, one scroll.** `components/experience/Experience.tsx` lays a tall track (`TOTAL_SVH`, about 27 screens) with a sticky stage in it. The stage holds a
single WebGL canvas and, over it, the words of whichever beat the story is in. Scroll position is the only input: it becomes a progress `u` (0–1), and
`world.ts` draws the frame for `u`. The menu's ten sections are anchors laid along the track, so the header, the HUD and every `/#projects`-style link still work.

**The story is one table.** `world/story.ts` lists the twenty beats (their length in screens and how long each holds its pose). The DOM and the world both read it:
the DOM fades each beat's words in and out; the camera holds a pose for the first part of a beat, then moves to the next beat's pose.
`layout.ts` builds the route (chained planner windows over the same height field as the hero, so the ground and the plan are the real thing), then places the gates,
the ring, the sky stations and the finale along it, and gives every beat a camera pose; `rig.ts` blends them (rotation as quaternions, the ring as an orbit,
terrain clearance, off-centre framing so the subject sits clear of the words).

**Acts** (`world/acts/`) are the set pieces; each owns a group, shows itself when the story is near it and animates with it:

- *Threshold → Survey* (in `world.ts`): first person along the route, a rover that is a scan of itself, the pushbroom line, the planned route drawn out, gates scanned in by a climbing laser line.
- *The ring* (`acts/ring/`): six exhibits, each built from scan points: Sparrow's one interface for LiDAR, stereo and a single camera; MPT's table-top map (slopes classified, a search, the route); Chiron
  patrolling a corridor and stopping at each door; ROUTE-M's Mars and its stereo pair; OSCAR's spectrometer painting a swath across an ocean; NOVA's payload under a balloon. The one the camera is on is scanned in,
  the others wait as ghosts; the pointer finds them (a ray against each one's bounding sphere) and a click opens the project's dossier.
- *The sky* (`acts/sky/`): rings the camera climbs through, the planet's limb appearing as the ground falls away, then a steel bridge growing member by member while a crew of nodes grows from six to twenty, HAT-P-18 b
  crossing its star with the light curve drawn from the real 706 frames below it, and the skills as a star chart.
- *The path* (`acts/finale.ts`): a corridor of year gates with the timeline laid beside it (each study, job and project is a line from the day it began to the day it ended), then a dawn.

**The instruments.** The scroll is the picture; the *instruments* are how you take it apart. At every stop that has one, a panel (`experience/Panel.tsx`, the table in `experience/instruments.tsx`) comes on beside the world
with the live thing from the long-form site: the pushbroom trade study's sliders, the route planner, Sparrow's sensor switch, Route-M's globe, the ocean-colour spectrum, NOVA's ascent, CHIRON's corridor logic, the bridge and
team growth, the transit scrubber, the skills, the timeline. They are the archive's own components (a few take a `stacked`, `compact` or `narrow` prop to fit a narrower box), fetched when the story gets near their stop and
dropped when it moves on. `PANEL_DEFS` in `story.ts` says over which stretch each is on show. Three things tie them to the world: on a wide screen the picture *makes room* (`world.setDock`: a wider view, aimed high, shifted
so it is centred in what the panel leaves, with the words low on the left); pointing at something in the panel lights it up in the world (`world.setFocus`: a skills group's stars, a timeline row's line along the route); and the first
two stops show the rover's own readouts (`world.telemetry()`: distance, elevation, slope, the next gate, the points gathered, what the planner said). A panel can be folded away or opened large (in place: the same instrument, nothing lost); the second stop's panel is the About card. On a screen too narrow to dock it
(the `dock:` variant in `tailwind.config.ts` and `DOCK_QUERY` are the same query), a bar at the foot opens it as a sheet over the world, which pauses while it is open. Each stop's words carry a keyboard-only "Use the
instrument" button, since the panel sits apart from them in the page.

**Drawing.** Everything is additive point sprites (`kit/sculpt.ts` samples points over surfaces and shares one shader with the rover and the gates, whose "laser line builds it" effect is that shader's `uBuilt`). Solid things carry a dark
body so they hide what is behind them; the world sorts them far to near each frame. `kit/post.ts` composites the scene with a small bloom, chromatic aberration that grows with speed, a "tech displacement" that tears the image when you pass a gate,
and a warm grade toward the end. Long jumps (the menu, the rail) are cuts: a fade, a rescan of the ground, a fade back. The rover is never driven faster than the ground can be generated.

**The words that are tags on the world** (a callout on an instrument, a star's name, a year over its gate) are asked for by the acts and drawn by `experience/Labels.tsx` in the page's own type.
**The dossier** (`experience/Dossier.tsx`, `records.tsx`) is a drawer that renders one record (about, a project, experience, leadership, research, skills, the timeline) from the same `data/` files as the archive.

**Fallbacks.** `prefers-reduced-motion`: no smooth-scroll, no sway, no gate pulses; the camera cuts from each beat's held pose to the next (nothing travels). No WebGL: the story still reads, as words over a quiet gradient.
Phones and low-core devices get fewer points, no post-processing and a lower pixel ratio. All of the story is in the page for assistive tech, and tabbing into a beat that is off-screen takes the story to it.

**Scale of the work.** The frame costs about 1.5 ms of JavaScript on a laptop (the ground is regenerated a few rows at a time as the camera moves); roughly 90–100k points are drawn.

## The hero, briefly

(The hero now lives on `/archive`; the home page's opening beat is its first person view of the same ground.)

`lib/terrain.ts` is a deterministic height field (fBm + three scales of craters + ridged mountains). `terrainScene.ts` streams
four density tiers of points past a rover-mounted camera — rows that fall behind are regenerated at the far end, so the GPU only
ever draws ~120k static points. A pushbroom scan plane colours points as they are "scanned"; the pointer paints light into the
terrain (world-space trail) and a click sends a ranging ping. The same height function drives the scan-fan ray hits, the camera's
terrain-following and the cursor's live range/elevation readout.

`routePlanner.ts` plans over that same height field. Once a second it searches a 31 m × 110 m window of 1 m cells ahead of the rover for the
cheapest forward route (distance, multiplied up on slopes, with a margin around steep crater walls and a small pull towards the previous plan),
by dynamic programming — exact, because every move goes forward — then rounds the corners and resamples it onto the surface. The scene draws
the first ~76 m as a glowing ribbon with waypoint diamonds, glides between successive plans, and outlines the ground steeper than the 25° limit
in orange (marching squares over the same risk map). The readout beside the LiDAR panel shows the planner's latest plan, straight from the scene.
The terrain is synthetic and the limits are illustrative: it demonstrates the technique, and says nothing about any real mission or tool.

## The traverse, briefly

`Traverse.tsx` is the hero's world scrubbed by scroll: the same terrain, point shader, scan plane and route planner, seen from behind the rover
instead of from its mast. `traverseScene.ts` imports the hero's point-cloud `Layer`, scan-fan and star shaders from `terrainScene.ts` (they are
exported, not copied) and the planner from `routePlanner.ts`, so the two scenes cannot drift apart.

One plan covers the whole traverse (a 31 m-wide, ~196 m window, planned once, in about ten milliseconds), and scrolling drives the rover along it:

- **A, Survey** — the pushbroom line sweeps the ground (dense behind it, sparse ahead); the four waypoint diamonds are the survey's targets.
- **B, Plan** — the route draws itself out from the rover, with the ground steeper than the planner's 25° limit outlined in orange.
- **C, Build** — the rover, a LiDAR scan of itself (points sampled over its surfaces), is scanned into existence by a laser line from the wheels up.
- **D, Arrive** — the last diamond fills in and a ranging ping goes out.

The readout panel beside the copy is the hero's panel style, driven by the same field: distance, surface height, slope under and ahead of the rover,
points acquired (25 Hz × 541 points per scan at the hero rover's speed), distance to the next waypoint, and the planner's route length, steepest cell
and planning time. The terrain is synthetic and the figures are illustrative, as in the hero. The scene is built when the section is a screen or two
away and pauses off-screen; the scroll distance is `motion-safe:h-[520svh]` on the section.

## Performance

- The page's own JS is ≈ **295 KB gzipped**. three.js is *not* in it — every 3D scene is dynamically imported. On the home page the world (three.js and its engine, ≈ 185 KB gzipped) is imported right after first paint, while the preloader is up; on the archive each scene loads when its section nears the viewport.
- Every render loop pauses off-screen (`IntersectionObserver`) and when the tab is hidden.
- Point clouds are updated with partial buffer ranges; `dpr` is capped (1.5 on touch / low-core devices, 2 elsewhere) and point counts scale down on small screens.
- The hero's route planner takes about a millisecond per plan, once a second (terrain rows are cached a few at a time; the plan itself allocates almost nothing), and pauses with the scene when the hero is off-screen.
- Images are `next/image` (AVIF/WebP); figures were extracted from the reports and re-encoded as WebP (≈1.7 MB total).
- The 2:13 intro video is click-to-play with a poster, so its 11 MB (720p) never loads unprompted.

## The route-planning demo

`components/sections/projects/visuals/` holds a small route-planning demo written for this site: a procedural patch of cratered terrain with slope classes (Safe, Caution, No-Go), keep-out zones, a Fastest and a Safest objective, sunlight that changes over time, and a search that can wait for the light. A* and Dijkstra return identical routes; the search wavefront is the real expansion order.

What it is **not**: the terrain is synthetic and the parameters are illustrative, so it says nothing about any real tool or dataset; the patch is about a kilometre across; the sun swings far faster than a real one so a short drive shows what takes hours; and there is no battery model. The page says so. `npm run verify:planner` re-checks the engine against an independent reference (optimal costs to 1e-9 across all mode combinations, every sunlit-only arrival actually lit, the shadow mask against brute-force ray marching).

## Accessibility

- Semantic landmarks, a skip link, and focus-trapped menu, dossier and lightbox (Esc closes; focus returns to the trigger)
- On the home page every beat's words stay in the page whether or not they are on screen, in reading order; tabbing into one that is off-screen takes the story to it. Exhibits in the 3-D ring are also reachable from each beat's "Open dossier" button
- `prefers-reduced-motion`: no preloader, no smooth-scroll hijack, no scroll-linked animation; the hero renders a single still frame and every
  instrument shows its settled state; the traverse is a still frame too, and its four stages become cards below it
- The traverse keeps all four stages in the page for assistive tech, and tabbing into one of them moves the pinned scene to that stage
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
