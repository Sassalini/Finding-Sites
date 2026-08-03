"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getListingEntitlement } from "@/lib/billing/subscription";
import { categoryChoiceError } from "@/lib/submissions/form";
import { safeServerError } from "@/lib/server-errors";
import { normalizeWebsiteUrl, slugifyName, SUBMISSION_LIMITS, type SubmissionErrors } from "@/lib/submissions/validation";
import type { ListingStatus } from "@/types/database";

export type SubmissionValues = {
  name: string;
  url: string;
  categoryMode: "existing" | "request";
  categoryId: string;
  requestedCategory: string;
  requestedCategoryDescription: string;
  description: string;
  contactEmail: string;
  ownershipConfirmed: boolean;
  termsAccepted: boolean;
};

export type SubmissionActionState = {
  errors: SubmissionErrors;
  values?: SubmissionValues;
};

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function logSubmissionError(operation: string, error: unknown) {
  console.error("[save-submission]", { operation, ...safeServerError(error) });
}

function readValues(formData: FormData): SubmissionValues {
  return {
    name: field(formData, "name"),
    url: field(formData, "url"),
    categoryMode: field(formData, "categoryMode") === "request" ? "request" : "existing",
    categoryId: field(formData, "categoryId"),
    requestedCategory: field(formData, "requestedCategory"),
    requestedCategoryDescription: field(formData, "requestedCategoryDescription"),
    description: field(formData, "description"),
    contactEmail: field(formData, "contactEmail"),
    ownershipConfirmed: formData.get("ownershipConfirmed") === "on",
    termsAccepted: formData.get("termsAccepted") === "on",
  };
}

function validate(values: SubmissionValues) {
  const errors: SubmissionErrors = {};
  if (values.name.length < SUBMISSION_LIMITS.nameMin || values.name.length > SUBMISSION_LIMITS.nameMax) {
    errors.name = `Use between ${SUBMISSION_LIMITS.nameMin} and ${SUBMISSION_LIMITS.nameMax} characters.`;
  }
  const normalizedUrl = normalizeWebsiteUrl(values.url);
  if ("error" in normalizedUrl) errors.url = normalizedUrl.error;
  if (values.description.length < SUBMISSION_LIMITS.descriptionMin || values.description.length > SUBMISSION_LIMITS.descriptionMax) {
    errors.description = `Use between ${SUBMISSION_LIMITS.descriptionMin} and ${SUBMISSION_LIMITS.descriptionMax} characters.`;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail) || values.contactEmail.length > 320) errors.contactEmail = "Enter a valid contact email address.";
  if (!values.ownershipConfirmed) errors.ownership = "Confirm that you own or are authorised to list this website.";
  if (!values.termsAccepted) errors.terms = "Agree to the Terms and Community Guidelines before continuing.";
  const categoryError = categoryChoiceError(values.categoryMode, values);
  if (categoryError) {
    if (values.categoryMode === "request" && !values.categoryId) errors.requestedCategory = categoryError;
    else errors.category = categoryError;
  }
  if (values.categoryMode === "request" && (values.requestedCategory.length < SUBMISSION_LIMITS.requestedCategoryMin || values.requestedCategory.length > SUBMISSION_LIMITS.requestedCategoryMax)) {
    errors.requestedCategory = `Use between ${SUBMISSION_LIMITS.requestedCategoryMin} and ${SUBMISSION_LIMITS.requestedCategoryMax} characters.`;
  }
  if (values.requestedCategoryDescription.length > 800) errors.requestedCategory = "Keep the category explanation to 800 characters or fewer.";
  return { errors, normalizedUrl };
}

export async function saveSubmissionAction(_state: SubmissionActionState, formData: FormData): Promise<SubmissionActionState> {
  if (field(formData, "company")) return { errors: { form: "We could not save this submission." } };
  const values = readValues(formData);
  const { errors, normalizedUrl } = validate(values);
  if (Object.keys(errors).length || "error" in normalizedUrl) return { errors, values };

  const supabase = await getSupabaseServerClient();
  if (!supabase) return { errors: { form: "Website submissions are not configured for this deployment." }, values };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(field(formData, "listingId") ? `/submit/${field(formData, "listingId")}` : "/submit")}`);

  const listingId = field(formData, "listingId") || null;
  let existing: { id: string; status: ListingStatus; owner_id: string | null } | null = null;
  if (listingId) {
    const result = await supabase.from("website_listings").select("id,status,owner_id").eq("id", listingId).maybeSingle();
    if (result.error || !result.data || result.data.owner_id !== user.id) {
      if (result.error) logSubmissionError("website_listings.select", result.error);
      return { errors: { form: "We could not find an editable submission for this account." }, values };
    }
    existing = result.data;
    if (!["draft", "checkout_pending", "pending_review", "changes_requested", "approved", "subscription_inactive"].includes(existing.status)) {
      return { errors: { form: "This listing is not currently editable." }, values };
    }
  } else {
    let entitlement;
    try {
      entitlement = await getListingEntitlement(supabase, user.id, { logPrefix: "[save-submission]" });
    } catch (error) {
      logSubmissionError("listing-entitlement", error);
      return { errors: { form: "We couldn’t save this website draft. Please try again." }, values };
    }
    if (!entitlement.canCreateListing) return { errors: { form: "Your plan includes up to two listings. Delete an existing listing before adding another." }, values };
  }

  const duplicateResult = await supabase.rpc("has_likely_duplicate_domain", {
    candidate_domain: normalizedUrl.domain,
    excluded_listing_id: existing?.id ?? null,
  });
  if (duplicateResult.error) {
    logSubmissionError("has_likely_duplicate_domain", duplicateResult.error);
    return { errors: { form: "We could not check this domain for duplicates. Please try again." }, values };
  }
  if (duplicateResult.data) {
    return { errors: { url: "This domain, or a closely related subdomain, already has a submission. Contact us if you manage the existing listing." }, values };
  }

  let categoryId: string | null = null;
  let categoryRequestId: string | null = null;
  if (values.categoryMode === "existing") {
    const categoryResult = await supabase.from("categories").select("id").eq("id", values.categoryId).eq("is_active", true).maybeSingle();
    if (categoryResult.error || !categoryResult.data) {
      if (categoryResult.error) logSubmissionError("categories.select", categoryResult.error);
      return { errors: { category: "That category is no longer available. Choose another." }, values };
    }
    categoryId = categoryResult.data.id;
  } else {
    const requestResult = await supabase.from("category_requests").insert({
      requested_name: values.requestedCategory,
      requested_description: values.requestedCategoryDescription || null,
      requested_by: user.id,
    }).select("id").single();
    if (requestResult.error) {
      logSubmissionError("category_requests.insert", requestResult.error);
      return { errors: { requestedCategory: "We could not save this category request. Please try again." }, values };
    }
    categoryRequestId = requestResult.data.id;
  }

  if (existing?.status === "approved" || existing?.status === "subscription_inactive") {
    const revisionClient = existing.status === "subscription_inactive" ? getSupabaseAdminClient() : supabase;
    if (!revisionClient) return { errors: { form: "We could not submit this revision. Please try again." }, values };
    const revisionResult = await revisionClient.from("listing_revisions").insert({
      listing_id: existing.id,
      owner_id: user.id,
      category_id: categoryId,
      category_request_id: categoryRequestId,
      name: values.name,
      url: normalizedUrl.url,
      normalized_domain: normalizedUrl.domain,
      short_description: values.description,
      contact_email: values.contactEmail,
    }).select("id").single();
    if (revisionResult.error) {
      logSubmissionError("listing_revisions.insert", revisionResult.error);
      const message = revisionResult.error.code === "23505"
        ? "A revision for this listing is already waiting for review."
        : "We could not submit this revision. Please try again.";
      return { errors: { form: message }, values };
    }
    revalidatePath("/account");
    redirect(`/submit/confirmation?id=${revisionResult.data.id}&kind=revision`);
  }

  const intent = field(formData, "intent") === "submit" ? "submit" : "draft";
  // A listing remains a draft until the owner confirms its summary. The next
  // step either finds an active subscription or sends the owner to Checkout.
  const nextStatus: ListingStatus = "draft";

  if (existing) {
    const updateClient = existing.status === "checkout_pending" ? getSupabaseAdminClient() : supabase;
    if (!updateClient) return { errors: { form: "We could not update this submission. Please try again." }, values };
    const updateResult = await updateClient.from("website_listings").update({
      category_id: categoryId,
      category_request_id: categoryRequestId,
      name: values.name,
      slug: `${slugifyName(values.name)}-${existing.id.slice(0, 8)}`,
      url: normalizedUrl.url,
      normalized_domain: normalizedUrl.domain,
      short_description: values.description,
      contact_email: values.contactEmail,
      ownership_confirmed: values.ownershipConfirmed,
      terms_accepted: values.termsAccepted,
      status: nextStatus,
    }).eq("id", existing.id).eq("owner_id", user.id);
    if (updateResult.error) {
      logSubmissionError("website_listings.update", updateResult.error);
      return { errors: { form: "We could not update this submission. Please try again." }, values };
    }
    revalidatePath("/account");
    redirect(intent === "submit" ? `/submit/review/${existing.id}` : `/submit/confirmation?id=${existing.id}&kind=draft`);
  }

  const newId = crypto.randomUUID();
  const insertResult = await supabase.from("website_listings").insert({
    id: newId,
    owner_id: user.id,
    category_id: categoryId,
    category_request_id: categoryRequestId,
    name: values.name,
    slug: `${slugifyName(values.name)}-${newId.slice(0, 8)}`,
    url: normalizedUrl.url,
    normalized_domain: normalizedUrl.domain,
    short_description: values.description,
    contact_email: values.contactEmail,
    ownership_confirmed: values.ownershipConfirmed,
    terms_accepted: values.termsAccepted,
    status: nextStatus,
  });
  if (insertResult.error) {
    logSubmissionError("website_listings.insert", insertResult.error);
    const message = insertResult.error.message.includes("LISTING_LIMIT_REACHED")
      ? "Your plan includes up to two listings. Delete an existing listing before adding another."
      : insertResult.error.code === "23505"
        ? "This domain or listing name is already in the directory."
        : "We could not save this submission. Please try again.";
    return { errors: { form: message }, values };
  }

  revalidatePath("/account");
  redirect(intent === "submit" ? `/submit/review/${newId}` : `/submit/confirmation?id=${newId}&kind=draft`);
}
