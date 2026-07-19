import Link from "next/link";
import type { ReactNode } from "react";

export function MarketingPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return (
    <main className="marketing-main" id="main-content">
      <section className="marketing-hero">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {children ?? (
          <div className="marketing-actions">
            <Link href="/" className="button button-secondary">Browse the directory</Link>
            <Link href="/submit" className="button button-accent">List your website</Link>
          </div>
        )}
      </section>
    </main>
  );
}
