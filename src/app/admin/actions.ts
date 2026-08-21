"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";

export async function moderateListingAction(formData: FormData) {
  const { supabase } = await requireAdmin("/admin/reviews");
  const listingId = String(formData.get("listingId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!listingId || !["approve_new_category", "assign_existing", "request_changes", "reject"].includes(intent)) {
    redirect("/admin/reviews?error=review");
  }
  const { error } = await supabase.rpc("admin_moderate_category_listing", {
    candidate_listing_id: listingId,
    moderation_action: intent,
    selected_category_id: categoryId,
    moderation_reason: reason,
  });
  if (error) {
    console.error("[admin-moderation]", { code: error.code, message: error.message });
    if (error.message.includes("CATEGORY_DUPLICATE")) redirect("/admin/reviews?error=duplicate");
    if (error.message.includes("CATEGORY_NOT_ACTIVE")) redirect("/admin/reviews?error=category");
    if (error.message.includes("REASON_REQUIRED")) redirect("/admin/reviews?error=reason");
    redirect("/admin/reviews?error=review");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/categories");
  revalidatePath("/account");
  revalidatePath("/");
  redirect("/admin/reviews?success=1");
}

export async function moderateRevisionAction(formData: FormData) {
  const { supabase, user } = await requireAdmin("/admin/reviews");
  const revisionId = String(formData.get("revisionId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const { data: revision } = await supabase.from("listing_revisions").select("id,listing_id,category_id,category_request_id,name,url,normalized_domain,short_description,contact_email,status").eq("id", revisionId).eq("status", "pending_review").maybeSingle();
  if (!revision) redirect("/admin/reviews?error=revision");
  const now = new Date().toISOString();
  if (intent === "approve") {
    const categoryId = revision.category_id ?? String(formData.get("categoryId") ?? "");
    if (!categoryId) redirect("/admin/reviews?error=category");
    const { error: listingError } = await supabase.from("website_listings").update({ category_id: categoryId, category_request_id: null, name: revision.name, url: revision.url, normalized_domain: revision.normalized_domain, short_description: revision.short_description, contact_email: revision.contact_email, updated_at: now }).eq("id", revision.listing_id).in("status", ["approved", "subscription_inactive"]);
    if (listingError) redirect("/admin/reviews?error=revision");
    await supabase.from("listing_revisions").update({ status: "approved", reviewed_at: now, reviewed_by: user.id, review_notes: "Approved" }).eq("id", revision.id);
  } else {
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 5) redirect("/admin/reviews?error=reason");
    await supabase.from("listing_revisions").update({ status: "rejected", rejection_reason: reason, reviewed_at: now, reviewed_by: user.id, review_notes: reason }).eq("id", revision.id);
  }
  revalidatePath("/admin"); revalidatePath("/admin/reviews"); revalidatePath("/account"); revalidatePath("/");
}
