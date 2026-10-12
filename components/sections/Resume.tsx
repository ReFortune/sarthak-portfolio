import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import ResumeDeck from "./ResumeDeck";
import { profile } from "@/data/profile";
import PointerText from "@/components/ui/PointerText";

export default function Resume() {
  return (
    <section id="resume" data-section="resume" className="relative py-16 md:py-32">
      <div className="wrap">
        <SectionHead
          n="08"
          label="Résumé"
          title={
            <>
              The <span className="serif">short</span> version
            </>
          }
        />
        <div className="grid items-center gap-16 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Reveal selector="[data-r]" stagger={0.1}>
              <p data-r className="label mb-5">Edition · {profile.resume.edition} · {profile.resume.pages} pages · PDF</p>
              <p data-r className="lede max-w-xl !text-bone">
                The short version in {profile.resume.pages} pages — roles, projects, dates and numbers — in the format recruiters and review boards expect.
              </p>
              <div data-r className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
                <a href={profile.resume.href} download={profile.resume.filename} className="btn btn--solid">
                  Download PDF <span aria-hidden="true" className="arrow">↓</span>
                </a>
                <p className="label !normal-case !tracking-normal"><PointerText fine="Click the preview to open it in a new tab." coarse="Tap the preview to open it in a new tab." /></p>
              </div>
            </Reveal>
          </div>
          <Reveal className="lg:col-span-6" y={60}>
            <ResumeDeck />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
