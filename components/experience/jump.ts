import { scrollToTarget } from "@/lib/scroll";
import { beatIndex, beats, type BeatId } from "@/components/world/story";

/** Take the story to a stop (a little way into it, where the pose is held and the words are up). */
export function jumpToBeat(id: BeatId, duration = 2) {
  const track = document.querySelector<HTMLElement>("[data-track]");
  const stage = document.querySelector<HTMLElement>("[data-stage]");
  if (!track || !stage) return;
  const b = beats[beatIndex(id)];
  const u = b.u0 + (b.u1 - b.u0) * (b.hold > 0 ? 0.16 : 0.05);
  scrollToTarget(track.getBoundingClientRect().top + window.scrollY + u * (track.offsetHeight - stage.offsetHeight), { duration });
}
