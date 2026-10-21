import type { Metadata } from "next";
import Hero from "@/components/hero/Hero";
import Ticker from "@/components/sections/Ticker";
import Proof from "@/components/sections/Proof";
import Traverse from "@/components/sections/Traverse";
import Profile from "@/components/sections/Profile";
import Experience from "@/components/sections/Experience";
import Projects from "@/components/sections/Projects";
import Leadership from "@/components/sections/Leadership";
import Research from "@/components/sections/Research";
import Toolkit from "@/components/sections/Toolkit";
import Timeline from "@/components/sections/Timeline";
import Resume from "@/components/sections/Resume";
import Contact from "@/components/sections/Contact";

export const metadata: Metadata = {
  title: "Archive",
  description: "The long-form version of the portfolio: every project, instrument, figure and date in one scroll.",
  alternates: { canonical: "/archive" },
};

export default function Archive() {
  return (
    <main id="main">
      <Hero />
      <Ticker />
      <Proof />
      <Traverse />
      <Profile />
      <Experience />
      <Projects />
      <Leadership />
      <Research />
      <Toolkit />
      <Timeline />
      <Resume />
      <Contact />
    </main>
  );
}
