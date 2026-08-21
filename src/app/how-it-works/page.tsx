import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = { title: "How It Works", description: "How Finding Sites reviews, organises and publishes useful websites." };

export default function HowItWorksPage() {
  return <MarketingPage eyebrow="Clear by design" title="A directory shaped by people, not bidding wars" description="Validated listings publish into active categories after subscription entitlement. New category requests receive administrator review."><div className="process-grid"><div><strong>1</strong><h2>Submit</h2><p>Tell us what your website offers and where it fits.</p></div><div><strong>2</strong><h2>Validate</h2><p>Security, ownership, category and entitlement checks run before publication.</p></div><div><strong>3</strong><h2>Get found</h2><p>Your live listing becomes searchable and browseable.</p></div></div><Link href="/submit" className="button button-accent">Submit your website</Link></MarketingPage>;
}
