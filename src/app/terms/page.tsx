import type { Metadata } from "next";
import { MarketingPage } from "@/components/layout/MarketingPage";
export const metadata: Metadata = { title: "Terms" };
export default function TermsPage() { return <MarketingPage eyebrow="Policy placeholder" title="Terms of service" description="Listing, payment, moderation and cancellation terms will be legally reviewed and published here before paid submissions open." />; }
