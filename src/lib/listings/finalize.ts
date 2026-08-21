import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type ListingFinalizationResult = "approved" | "pending_review";

export async function finalizeListingAfterEntitlement(listingId: string, ownerId: string) {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured.");
  const { data, error } = await admin.rpc("finalize_listing_after_entitlement", {
    candidate_listing_id: listingId,
    candidate_owner_id: ownerId,
  });
  if (error) throw error;
  if (data !== "approved" && data !== "pending_review") {
    throw new Error("Unexpected listing finalization result.");
  }
  return data as ListingFinalizationResult;
}
