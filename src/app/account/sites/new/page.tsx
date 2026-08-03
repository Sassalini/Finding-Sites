import { newSiteMetadata, renderNewSitePage } from "@/app/submit/NewSitePage";

export const metadata = newSiteMetadata;
export const dynamic = "force-dynamic";

export default function NewAccountSitePage() {
  return renderNewSitePage({ returnTo: "/account/sites/new", logPrefix: "[new-site]" });
}
