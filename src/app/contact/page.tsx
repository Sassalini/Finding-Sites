import type { Metadata } from "next";
import { MarketingPage } from "@/components/layout/MarketingPage";

export const metadata: Metadata = { title: "Contact" };
export default function ContactPage() { return <MarketingPage eyebrow="Contact" title="We’d like to hear from you" description="The contact inbox is not connected in this MVP. A verified support address and accessible contact form will be added before public launch." />; }
