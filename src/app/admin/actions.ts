"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/login?next=/admin");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/account");
  return supabase;
}

export async function moderateListingAction(formData: FormData) {
  const supabase = await requireAdmin();
  const listingId = String(formData.get("listingId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  if (!listingId) return;

  if (intent === "approve") {
    const categoryId = String(formData.get("categoryId") ?? "");
    const categoryRequestId = String(formData.get("categoryRequestId") ?? "");
    const { data: listing } = await supabase
      .from("website_listings")
      .select("category_id")
      .eq("id", listingId)
      .eq("status", "pending_review")
      .maybeSingle();
    const approvedCategoryId = listing?.category_id ?? categoryId;
    if (!listing || !approvedCategoryId) redirect("/admin?error=category");

    const now = new Date().toISOString();
    const { error } = await supabase.from("website_listings").update({
      category_id: approvedCategoryId,
      category_request_id: null,
      status: "approved",
      rejection_reason: null,
      approved_at: now,
      published_at: now,
    }).eq("id", listingId).eq("status", "pending_review");
    if (error) redirect("/admin?error=approve");
    if (categoryRequestId) {
      await supabase.from("category_requests").update({ status: "approved", reviewed_at: now }).eq("id", categoryRequestId);
    }
  }

  if (intent === "reject") {
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 5 || reason.length > 1000) redirect("/admin?error=reason");
    const { error } = await supabase.from("website_listings").update({
      status: "changes_requested",
      rejection_reason: reason,
    }).eq("id", listingId).eq("status", "pending_review");
    if (error) redirect("/admin?error=reject");
  }

  revalidatePath("/admin");
  revalidatePath("/account");
  revalidatePath("/");
}

export async function moderateRevisionAction(formData: FormData) {
  const supabase = await requireAdmin();
  const revisionId = String(formData.get("revisionId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const { data: { user } } = await supabase.auth.getUser();
  const { data: revision } = await supabase.from("listing_revisions").select("id,listing_id,category_id,category_request_id,name,url,normalized_domain,short_description,contact_email,status").eq("id", revisionId).eq("status", "pending_review").maybeSingle();
  if (!revision || !user) redirect("/admin?error=revision");
  const now = new Date().toISOString();
  if (intent === "approve") {
    const categoryId = revision.category_id ?? String(formData.get("categoryId") ?? "");
    if (!categoryId) redirect("/admin?error=category");
    const { error: listingError } = await supabase.from("website_listings").update({ category_id: categoryId, category_request_id: null, name: revision.name, url: revision.url, normalized_domain: revision.normalized_domain, short_description: revision.short_description, contact_email: revision.contact_email, updated_at: now }).eq("id", revision.listing_id).in("status", ["approved", "subscription_inactive"]);
    if (listingError) redirect("/admin?error=revision");
    await supabase.from("listing_revisions").update({ status: "approved", reviewed_at: now, reviewed_by: user.id, review_notes: "Approved" }).eq("id", revision.id);
  } else {
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length < 5) redirect("/admin?error=reason");
    await supabase.from("listing_revisions").update({ status: "rejected", rejection_reason: reason, reviewed_at: now, reviewed_by: user.id, review_notes: reason }).eq("id", revision.id);
  }
  revalidatePath("/admin"); revalidatePath("/account"); revalidatePath("/");
}
