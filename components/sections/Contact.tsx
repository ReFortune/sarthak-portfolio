import SectionHead from "../ui/SectionHead";
import Reveal from "../ui/Reveal";
import FitText from "../ui/FitText";
import Magnetic from "../ui/Magnetic";
import CopyEmail from "./CopyEmail";
import { profile } from "@/data/profile";

export default function Contact() {
  return (
    <section id="contact" data-section="contact" className="relative pt-28 md:pt-44">
      <div className="wrap">
        <SectionHead
          n="09"
          label="Contact"
          title={
            <>
              Let’s build something that <span className="serif">leaves Earth.</span>
            </>
          }
          lede={profile.seeking}
        />

        <Reveal selector="[data-c]" stagger={0.1} className="space-y-12">
          <div data-c>
            <CopyEmail email={profile.email} />
          </div>
          <div data-c className="flex flex-wrap items-center gap-3">
            <Magnetic strength={0.22}>
              <a href={`mailto:${profile.email}?subject=Hello%20Sarthak`} className="btn btn--solid">
                Write me <span aria-hidden="true" className="arrow">↗</span>
              </a>
            </Magnetic>
            <Magnetic strength={0.22}>
              <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="btn">
                LinkedIn <span aria-hidden="true" className="arrow">↗</span>
              </a>
            </Magnetic>
            <Magnetic strength={0.22}>
              <a href={profile.resume.href} download={profile.resume.filename} className="btn">
                Résumé <span aria-hidden="true" className="arrow">↓</span>
              </a>
            </Magnetic>
          </div>
        </Reveal>

        <dl className="mt-20 grid gap-px bg-bone/10 sm:grid-cols-3 md:mt-28">
          {[
            ["Currently", `${profile.role}, ${profile.org}`],
            ["Studying", `${profile.program}, ${profile.school} · ${profile.graduation}`],
            ["Résumé", `${profile.resume.edition} · PDF`],
          ].map(([k, v], i) => (
            <div key={k} className="bg-ink p-6">
              <dt className="label mb-3">{k}</dt>
              <dd className="text-[0.98rem] leading-snug text-bone">
                {i === 2 ? (
                  <a href={profile.resume.href} download={profile.resume.filename} className="link">{v} ↓</a>
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── footer ── */}
      <footer className="relative mt-24 overflow-hidden border-t border-bone/10 pb-6 pt-8 md:mt-32">
        <div className="wrap">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
            <p className="label">© {new Date().getFullYear()} {profile.name} · Space engineering</p>
            <p className="label hidden md:block">Next.js · Three.js · GSAP · Lenis — designed &amp; built by hand</p>
            <a href="#top" className="label link !text-bone">Back to top ↑</a>
          </div>
          <FitText className="footer-word h-display !leading-[0.82]" fill={0.995}>
            SARTHAK SAHAI
          </FitText>
        </div>
      </footer>
    </section>
  );
}
