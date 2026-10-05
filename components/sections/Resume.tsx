import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import ResumeDeck from "./ResumeDeck";
import { profile } from "@/data/profile";

export default function Resume() {
  return (
    <section id="resume" data-section="resume" className="relative py-28 md:py-44">
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
                The same story in the format recruiters and review boards expect — with the numbers, the dates and the
                tools, nothing more.
              </p>
              <ul data-r className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-3 border-y border-bone/10 py-6">
                {[
                  ["Work", "CSA · Canada’s Wonderland"],
                  ["Projects", "NOVA · ROUTE-M · OSCAR · Sparrow · CHIRON"],
                  ["Teams", "Steel Bridge · GNCTR · LES"],
                  ["Research", "HAT-P-18 b transit"],
                ].map(([k, v]) => (
                  <li key={k}>
                    <p className="label">{k}</p>
                    <p className="mt-1 text-[0.9rem] leading-snug text-bone">{v}</p>
                  </li>
                ))}
              </ul>
              <div data-r className="mt-9 flex flex-wrap items-center gap-3">
                <a href={profile.resume.href} download={profile.resume.filename} className="btn btn--solid">
                  Download PDF <span aria-hidden="true" className="arrow">↓</span>
                </a>
                <a href={profile.resume.href} target="_blank" rel="noopener noreferrer" className="btn">
                  Open in browser <span aria-hidden="true" className="arrow">↗</span>
                </a>
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
