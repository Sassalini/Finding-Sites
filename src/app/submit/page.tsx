import { newSiteMetadata, renderNewSitePage } from "@/app/submit/NewSitePage";

export const metadata = newSiteMetadata;

export default function SubmitPage() {
  return renderNewSitePage({ returnTo: "/submit", logPrefix: "[submit]" });
}
