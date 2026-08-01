"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function NewSiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[new-site] route error boundary", {
      name: error.name,
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <main className="account-shell account-shell-narrow" id="main-content">
      <section className="form-card confirmation-card" role="alert">
        <span className="eyebrow">Website submission</span>
        <h1>We couldn’t load the website submission form.</h1>
        <p>Please try again. If the problem continues, return to your account and contact the directory team.</p>
        <div className="form-actions">
          <button className="button button-accent" type="button" onClick={reset}>Try again</button>
          <Link href="/account" className="button button-secondary">Back to account</Link>
        </div>
      </section>
    </main>
  );
}
