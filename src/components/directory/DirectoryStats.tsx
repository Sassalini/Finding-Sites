import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { getDirectoryStats } from "@/lib/directory/stats";

const numberFormatter = new Intl.NumberFormat("en-GB");

export async function DirectoryStats() {
  const stats = await getDirectoryStats();
  const items = [
    { label: stats.websiteCount === 1 ? "Website Listed" : "Websites Listed", value: stats.websiteCount, icon: "folder" },
    { label: stats.categoryCount === 1 ? "Category" : "Categories", value: stats.categoryCount, icon: "briefcase" },
    { label: "Searches Today", value: stats.searchesToday, icon: "search" },
  ];

  return (
    <section className="stats-strip" aria-label="Directory statistics">
      <div className="stats-items">
        {items.map((stat) => (
          <div className="stat" key={stat.label}>
            <Icon name={stat.icon} />
            <strong aria-label={stat.value === null ? "Unavailable" : undefined}>{stat.value === null ? "—" : numberFormatter.format(stat.value)}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
      {stats.popularSearches.length > 0 && <div className="popular-searches">
        <span>Popular searches:</span>
        <div>
          {stats.popularSearches.map((search) => <Link href={`/search?q=${encodeURIComponent(search.query)}`} key={search.query}>{search.query}</Link>)}
        </div>
      </div>}
    </section>
  );
}
