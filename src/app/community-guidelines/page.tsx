import type { Metadata } from "next";
import { MarketingPage } from "@/components/layout/MarketingPage";
export const metadata: Metadata = { title: "Community Guidelines" };
export default function CommunityGuidelinesPage() { return <MarketingPage eyebrow="Directory standards" title="Useful, honest and safe websites belong here" description="Listings should describe a working website accurately, use a safe HTTPS address, fit their chosen category and avoid deceptive, hateful, unlawful or spam content." />; }
