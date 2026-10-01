import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Serif, Fragment_Mono } from "next/font/google";
import "./globals.css";
import { profile } from "@/data/profile";
import Providers from "@/components/core/Providers";
import { siteUrl } from "@/lib/site";

const display = Archivo({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["wdth"],
});
const serif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});
const mono = Fragment_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Sarthak Sahai — I measure worlds",
    template: "%s — Sarthak Sahai",
  },
  description: profile.description,
  applicationName: "Sarthak Sahai",
  authors: [{ name: profile.name, url: profile.linkedin }],
  keywords: [
    "Sarthak Sahai",
    "space engineering",
    "systems engineering",
    "Canadian Space Agency",
    "LiDAR",
    "York University",
    "mission design",
    "portfolio",
  ],
  openGraph: {
    title: "Sarthak Sahai — I measure worlds",
    description: profile.description,
    type: "website",
    siteName: "Sarthak Sahai",
    locale: "en_CA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sarthak Sahai — I measure worlds",
    description: profile.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#06070B",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: profile.name,
  jobTitle: profile.role,
  worksFor: { "@type": "Organization", name: profile.org },
  alumniOf: { "@type": "CollegeOrUniversity", name: profile.school },
  email: `mailto:${profile.email}`,
  sameAs: [profile.linkedin],
  knowsAbout: ["Systems engineering", "Space engineering", "LiDAR", "Mission design", "Payload design"],
};

/** Runs before first paint: returning visitors / reduced-motion skip the boot sequence without a flash. */
const bootScript = `try{var d=document.documentElement;if(sessionStorage.getItem('ss_booted')==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches){d.dataset.booted='1'}else{d.classList.add('is-booting');setTimeout(function(){d.classList.remove('is-booting')},9000)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        <noscript>
          <style>{`.preloader{display:none!important}.sr-boot{visibility:visible!important;animation:none!important}`}</style>
        </noscript>
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
