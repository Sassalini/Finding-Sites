import type { Metadata } from "next";
import { MarketingPage } from "@/components/layout/MarketingPage";
export const metadata: Metadata = { title: "Cookie Policy" };
export default function CookiesPage() { return <MarketingPage eyebrow="Policy placeholder" title="Cookie policy" description="Finding Sites will document essential authentication cookies and any consent-controlled analytics here before public launch." />; }
