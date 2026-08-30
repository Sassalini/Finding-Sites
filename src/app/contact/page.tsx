import type { Metadata } from "next";
import { MarketingPage } from "@/components/layout/MarketingPage";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <MarketingPage eyebrow="Contact" title="We’d like to hear from you" description="Get in touch with Finding Sites.">
      <p className={styles.email}>
        Email us at <a href="mailto:CentrumDisce@gmail.com">CentrumDisce@gmail.com</a>
      </p>
    </MarketingPage>
  );
}
