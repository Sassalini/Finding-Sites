import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export function EmptyDirectoryState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <section className="empty-directory" aria-live="polite">
      <span><Icon name="search" /></span>
      <h2>{hasQuery ? "No websites match that search" : "This category is waiting for its first listing"}</h2>
      <p>{hasQuery ? "Try a broader word, clear the search, or browse another category." : "Know a useful independent website that belongs here? Send it our way."}</p>
      <div>
        {hasQuery && <Link href="/" className="button button-secondary">Clear search</Link>}
        <Link href="/submit" className="button button-accent">Submit a Website</Link>
      </div>
    </section>
  );
}
