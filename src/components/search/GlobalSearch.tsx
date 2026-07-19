import { Icon } from "@/components/ui/Icon";

export function GlobalSearch({ defaultValue = "", compact = false }: { defaultValue?: string; compact?: boolean }) {
  return (
    <form action="/search" method="get" role="search" className={compact ? "global-search global-search-mobile" : "global-search"}>
      <label className="sr-only" htmlFor={compact ? "mobile-global-search" : "global-search"}>Search the website directory</label>
      <Icon name="search" className="search-leading-icon" />
      <input id={compact ? "mobile-global-search" : "global-search"} name="q" defaultValue={defaultValue} placeholder="Search websites, services or keywords…" autoComplete="off" />
      <button type="submit" aria-label="Search"><Icon name="search" /></button>
    </form>
  );
}
