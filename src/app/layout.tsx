import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Finding Sites — Discover useful independent websites", template: "%s | Finding Sites" },
  description: "A human-curated directory for discovering useful independent websites and businesses.",
  openGraph: {
    type: "website",
    locale: "en_GB",
    url: "/",
    siteName: "Finding Sites",
    title: "Finding Sites — Every Website. A Place to Be Found.",
    description: "Browse a clear, human-curated directory of useful independent websites.",
  },
  twitter: { card: "summary", title: "Finding Sites", description: "A human-curated directory of useful independent websites." },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Finding Sites",
  url: siteUrl,
  description: "A human-curated website and business directory.",
  potentialAction: {
    "@type": "SearchAction",
    target: `${siteUrl}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-GB" data-scroll-behavior="smooth">
      <body>
        <a href="#main-content" className="skip-link">Skip to directory</a>
        <SiteHeader />
        {children}
        <SiteFooter />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c") }} />
      </body>
    </html>
  );
}
