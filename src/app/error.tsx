"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="error-page" id="main-content"><span>!</span><h1>We couldn’t load the directory</h1><p>Please try again. If the problem continues, the directory may be undergoing maintenance.</p><button className="button button-accent" onClick={reset}>Try again</button></main>;
}
