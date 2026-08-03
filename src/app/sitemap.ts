import type { MetadataRoute } from "next";
import { getDirectoryCategories } from "@/lib/directory/repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const categories = await getDirectoryCategories();
  const routes = ["", "/categories", "/how-it-works", "/submit", "/about", "/contact", "/privacy", "/terms", "/cookies", "/community-guidelines"];
  return [
    ...routes.map((route) => ({ url: `${baseUrl}${route}`, lastModified: new Date(), changeFrequency: route === "" ? "daily" as const : "monthly" as const, priority: route === "" ? 1 : 0.6 })),
    ...categories.map((category) => ({ url: `${baseUrl}/category/${category.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
