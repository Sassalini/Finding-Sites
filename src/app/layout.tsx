import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? (forwardedHost?.includes("localhost") ? "http" : "https");
  let origin = siteUrl;
  if (forwardedHost) {
    try {
      origin = new URL(`${forwardedProto}://${forwardedHost}`).origin;
    } catch {
      // Retain the configured canonical origin when forwarded headers are invalid.
    }
  }
  const socialImage = new URL("/og.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: { default: "Finding Sites — Discover useful independent websites", template: "%s | Finding Sites" },
    description: "A human-curated directory for discovering useful independent websites and businesses.",
    openGraph: {
      type: "website",
      locale: "en_GB",
      url: "/",
      siteName: "Finding Sites",
      title: "Finding Sites — Every website. A place to be found.",
      description: "Browse a clear, human-curated directory of useful independent websites.",
      images: [{ url: socialImage, width: 1734, height: 907, alt: "Finding Sites — a human-curated website directory" }],
    },
    twitter: { card: "summary_large_image", title: "Finding Sites", description: "A human-curated directory of useful independent websites.", images: [socialImage] },
  };
}

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
