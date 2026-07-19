import type { Metadata } from "next";
import { MarketingPage } from "@/components/layout/MarketingPage";
export const metadata: Metadata = { title: "Privacy" };
export default function PrivacyPage() { return <MarketingPage eyebrow="Policy placeholder" title="Privacy policy" description="A reviewed privacy notice covering accounts, submissions, analytics and data-retention periods will replace this placeholder before public launch." />; }
