import type { Metadata } from "next";
import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = { title: "About", description: "Why Finding Sites is building a clearer directory for the independent web." };
export default function AboutPage() { return <MarketingPage eyebrow="About Finding Sites" title="Useful websites deserve a place to be discovered" description="Finding Sites is an early-stage, human-curated directory built to make the independent web easier to browse. No fabricated ratings, hidden listings or confusing ranking auctions." />; }
