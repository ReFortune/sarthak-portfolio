import SectionHead from "../ui/SectionHead";
import ProjectStack from "./projects/ProjectStack";
import ProjectCard from "./projects/ProjectCard";
import { projects } from "@/data/projects";

export default function Projects() {
  return (
    <section id="projects" data-section="projects" className="relative py-28 md:py-44">
      <div className="wrap">
        <SectionHead
          n="03"
          label="Projects"
          title={
            <>
              Selected <span className="serif">missions</span>
            </>
          }
          lede="Five projects I scoped, led and verified — from a balloon-borne sky photometer to a Mars orbiter, an ocean spectrometer, a research rover and a hospital robot."
        />
        <ProjectStack>
          {projects.map((p, i) => (
            <ProjectCard key={p.slug} p={p} index={i} />
          ))}
        </ProjectStack>
      </div>
    </section>
  );
}
