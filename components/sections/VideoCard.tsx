"use client";

import { useState } from "react";
import Image from "next/image";

/** Click-to-play video: a poster until asked for, so the ~11 MB file never loads unprompted. */
export default function VideoCard({
  src,
  poster,
  title,
  caption,
  duration,
}: {
  src: string;
  poster: string;
  title: string;
  caption: string;
  duration: string;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <figure>
      <div
        className="ticks relative aspect-video overflow-hidden bg-ink-3"
        data-cursor={playing ? undefined : "view"}
        data-cursor-label="Play"
      >
        {playing ? (
          <video
            src={src}
            poster={poster}
            controls
            autoPlay
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${title}`}
            className="group absolute inset-0 block h-full w-full text-left"
          >
            <Image
              src={poster}
              alt=""
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover object-[30%_30%] [filter:saturate(0.85)_contrast(1.05)] transition-transform duration-[1400ms] ease-out group-hover:scale-[1.035]"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-ink/30" />
            <span className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-6">
              <span className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-full border border-bone/60 transition-colors duration-500 group-hover:border-laser group-hover:bg-laser">
                  <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true" className="ml-0.5 fill-bone transition-colors group-hover:fill-ink">
                    <path d="M1 1l14 8-14 8z" />
                  </svg>
                </span>
                <span className="label label-strong">{title}</span>
              </span>
              <span className="label tnum">{duration}</span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="label mt-3 flex justify-between gap-6">
        <span>{caption}</span>
        <span className="hidden sm:inline">{duration}</span>
      </figcaption>
    </figure>
  );
}
