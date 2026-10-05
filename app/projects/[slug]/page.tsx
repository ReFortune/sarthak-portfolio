import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { projects, getProject } from "@/data/projects";
import NovaCase from "@/components/case/NovaCase";
import RouteCase from "@/components/case/RouteCase";
import ChironCase from "@/components/case/ChironCase";
import MissionPlanningToolCase from "@/components/case/MissionPlanningToolCase";

type Params = { slug: string };

/** Only projects backed by documents get a case-study page. */
export function generateStaticParams(): Params[] {
  return projects.filter((p) => p.caseStudy).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getProject(slug);
  if (!p || !p.caseStudy) return { title: "Project not found" };
  return {
    title: `${p.code} — ${p.name}`,
    description: p.summary,
    openGraph: { title: `${p.code} — ${p.name} · Sarthak Sahai`, description: p.summary, type: "article" },
  };
}

const CASES: Record<string, () => React.JSX.Element> = {
  "nova-payload": NovaCase,
  "route-m": RouteCase,
  "mission-planning-tool": MissionPlanningToolCase,
  "hospital-dispensing-robot": ChironCase,
};

export default async function CaseStudyPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const p = getProject(slug);
  const Case = CASES[slug];
  if (!p || !p.caseStudy || !Case) notFound();

  return (
    <main id="main">
      <Case />
    </main>
  );
}
