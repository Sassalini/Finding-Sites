import type { Category } from "@/types/directory";

export const categories: Category[] = [
  { id: "01", name: "Business & Services", slug: "business-services", description: "Professional services and practical support for organisations.", iconKey: "briefcase", approvedCount: 8 },
  { id: "02", name: "Computers & Internet", slug: "computers-internet", description: "Software, hosting, technology and the open web.", iconKey: "monitor", approvedCount: 2 },
  { id: "03", name: "Education", slug: "education", description: "Courses, resources and learning communities.", iconKey: "book", approvedCount: 2 },
  { id: "04", name: "Entertainment", slug: "entertainment", description: "Independent entertainment, games and creative culture.", iconKey: "spark", approvedCount: 2 },
  { id: "05", name: "Finance", slug: "finance", description: "Independent financial tools, advice and services.", iconKey: "pound", approvedCount: 1 },
  { id: "06", name: "Health & Fitness", slug: "health-fitness", description: "Wellbeing, activity and healthcare information.", iconKey: "heart", approvedCount: 1 },
  { id: "07", name: "Hobbies & Interests", slug: "hobbies-interests", description: "Specialist communities, guides and supplies.", iconKey: "compass", approvedCount: 2 },
  { id: "08", name: "Home & Garden", slug: "home-garden", description: "Homes, interiors, gardening and maintenance.", iconKey: "home", approvedCount: 1 },
  { id: "09", name: "Life & Style", slug: "life-style", description: "Independent style, living and personal interests.", iconKey: "leaf", approvedCount: 1 },
  { id: "10", name: "News & Media", slug: "news-media", description: "Publishers, newsletters and independent reporting.", iconKey: "news", approvedCount: 1 },
  { id: "11", name: "Pets & Animals", slug: "pets-animals", description: "Animal care, welfare and pet services.", iconKey: "paw", approvedCount: 1 },
  { id: "12", name: "Shopping", slug: "shopping", description: "Independent shops and specialist retailers.", iconKey: "bag", approvedCount: 4 },
  { id: "13", name: "Society & Culture", slug: "society-culture", description: "Communities, culture and public-interest projects.", iconKey: "people", approvedCount: 1 },
  { id: "14", name: "Sports & Recreation", slug: "sports-recreation", description: "Clubs, activities, coaching and outdoor pursuits.", iconKey: "activity", approvedCount: 2 },
  { id: "15", name: "Travel & Tourism", slug: "travel-tourism", description: "Independent travel resources and local experiences.", iconKey: "map", approvedCount: 1 },
];

export function getCategory(slug: string) {
  return categories.find((category) => category.slug === slug);
}
