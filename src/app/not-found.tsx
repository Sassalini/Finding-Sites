import Link from "next/link";

export default function NotFound() {
  return <main className="error-page" id="main-content"><span>404</span><h1>That page couldn’t be found</h1><p>The website or category may have moved, or the address may be incomplete.</p><Link href="/" className="button button-accent">Browse Finding Sites</Link></main>;
}
