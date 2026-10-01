import { TLink } from "@/components/core/Transition";

export const metadata = { title: "Signal lost" };

export default function NotFound() {
  return (
    <main id="main" className="relative grid min-h-[100svh] place-items-center overflow-hidden px-[var(--gutter)] py-32">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,rgb(var(--laser)/0.09),transparent_70%)]" />
      <div className="relative text-center">
        <p className="label mb-8 flex items-center justify-center gap-3">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1s_infinite]" />
          Error 404 · No return
        </p>
        <h1 className="h-display text-[clamp(4rem,17vw,16rem)] !leading-[0.82]">
          Signal <span className="serif">lost</span>
        </h1>
        <p className="lede mx-auto mt-8 max-w-md">
          The scan line reached the edge of the map — there is nothing at this address. Let’s get you back to known terrain.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <TLink href="/" label="Home" className="btn btn--solid">
            Back to base <span aria-hidden="true" className="arrow">↗</span>
          </TLink>
          <TLink href="/#projects" label="Projects" className="btn">
            See the projects
          </TLink>
        </div>
      </div>
    </main>
  );
}
