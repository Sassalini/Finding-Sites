import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectoryPage } from "@/components/directory/DirectoryPage";
import { getCategory } from "@/data/categories";
import { parseDirectoryFilters, type SearchParamRecord } from "@/lib/directory/urls";

type CategoryPageProps = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParamRecord> };

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategory(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: category.name,
    description: `${category.description} Browse approved listings in Finding Sites.`,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

export function generateStaticParams() {
  return [];
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = getCategory(slug);
  if (!category) notFound();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Directory", item: siteUrl },
      { "@type": "ListItem", position: 2, name: category.name, item: `${siteUrl}/category/${category.slug}` },
    ],
  };
  return (
    <>
      <DirectoryPage filters={parseDirectoryFilters(query, category.slug)} pathname={`/category/${category.slug}`} category={category} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd).replace(/</g, "\\u003c") }} />
    </>
  );
}
