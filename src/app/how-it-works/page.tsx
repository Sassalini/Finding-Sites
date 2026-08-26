import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = { title: "How It Works", description: "How Finding Sites reviews, organises and publishes useful websites." };

export default function HowItWorksPage() {
  return <MarketingPage eyebrow="" title="A Directory specifically for finding websites you’ve probably never heard of!" description="If you’re a site owner, simply sign up for an account, then submit your website to be added to the directory. We will check it to ensure it passes basic spam/scam checks and then it will be listed for visitors to find. We charge a £2 monthly fee. With this, you can list 2 separate URLs."><div className="process-grid"><div><strong>1</strong><h2>Submit</h2><p>Tell us what your website offers and where it fits.</p></div><div><strong>2</strong><h2>Validate</h2><p>We ensure that only legitimate websites are listed in our directory.</p></div><div><strong>3</strong><h2>Get found</h2><p>Your live listing becomes searchable and browseable.</p></div></div><Link href="/submit" className="button button-accent">Submit your website</Link></MarketingPage>;
}
