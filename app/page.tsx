import Hero from "@/components/hero/Hero";
import Ticker from "@/components/sections/Ticker";
import Profile from "@/components/sections/Profile";
import Experience from "@/components/sections/Experience";
import Projects from "@/components/sections/Projects";
import Leadership from "@/components/sections/Leadership";
import Research from "@/components/sections/Research";
import Toolkit from "@/components/sections/Toolkit";
import Timeline from "@/components/sections/Timeline";
import Resume from "@/components/sections/Resume";
import Contact from "@/components/sections/Contact";

export default function Home() {
  return (
    <main id="main">
      <Hero />
      <Ticker />
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
