export const SUBMISSION_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  descriptionMin: 20,
  descriptionMax: 240,
  requestedCategoryMin: 2,
  requestedCategoryMax: 80,
} as const;

export type SubmissionField = "name" | "url" | "category" | "requestedCategory" | "description" | "contactEmail" | "ownership" | "terms" | "form";
export type SubmissionErrors = Partial<Record<SubmissionField, string>>;

export type NormalizedWebsiteUrl = {
  url: string;
  domain: string;
};

function isForbiddenHostname(hostname: string) {
  const value = hostname.toLowerCase();
  return value === "localhost"
    || value.endsWith(".localhost")
    || value === "0.0.0.0"
    || value === "127.0.0.1"
    || value === "::1"
    || value.endsWith(".local");
}

export function normalizeWebsiteUrl(input: string): NormalizedWebsiteUrl | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: "Enter the website URL." };

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { error: "Enter a valid website URL, such as https://example.com." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only HTTP and HTTPS website URLs are allowed." };
  }
  if (parsed.username || parsed.password) {
    return { error: "Website URLs cannot contain a username or password." };
  }
  if (!parsed.hostname.includes(".") || isForbiddenHostname(parsed.hostname)) {
    return { error: "Enter a public website address rather than a local address." };
  }

  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }
  if (parsed.pathname === "/" && !parsed.search) parsed.pathname = "";

  const domain = parsed.hostname.replace(/^www\./, "");
  return { url: parsed.toString(), domain };
}

export function slugifyName(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || "website";
}
