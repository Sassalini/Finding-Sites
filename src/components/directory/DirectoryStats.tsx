import { Icon } from "@/components/ui/Icon";
import Link from "next/link";

const stats = [
  { label: "Websites Listed", value: "30", icon: "folder" },
  { label: "Categories", value: "15", icon: "briefcase" },
  { label: "Searches Today", value: "86", icon: "search" },
];

const popularSearches = ["plumbers", "marketing", "independent shops", "web hosting", "antiques"];

export function DirectoryStats() {
  return (
    <section className="stats-strip" aria-label="Directory statistics">
      <div className="stats-items">
        {stats.map((stat) => (
          <div className="stat" key={stat.label}>
            <Icon name={stat.icon} />
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="popular-searches">
        <span>Popular searches:</span>
        <div>
          {popularSearches.map((search) => <Link href={`/search?q=${encodeURIComponent(search)}`} key={search}>{search}</Link>)}
        </div>
      </div>
    </section>
  );
}
