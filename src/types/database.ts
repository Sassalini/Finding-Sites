export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type ListingStatus = "draft" | "checkout_pending" | "pending_review" | "approved" | "rejected" | "changes_requested" | "suspended" | "subscription_inactive" | "deleted" | "permanently_rejected" | "expired";
export type ListingRevisionStatus = "pending_review" | "approved" | "rejected";
export type SubscriptionStatus = "active" | "trialing" | "incomplete" | "incomplete_expired" | "past_due" | "canceled" | "unpaid" | "paused";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; role: "member" | "admin"; stripe_customer_id: string | null; deletion_requested_at: string | null; created_at: string; updated_at: string };
        Insert: { id: string; display_name?: string | null; role?: "member" | "admin"; stripe_customer_id?: string | null; deletion_requested_at?: string | null; created_at?: string; updated_at?: string };
        Update: { display_name?: string | null; stripe_customer_id?: string | null; deletion_requested_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      categories: {
        Row: { id: string; name: string; slug: string; description: string | null; icon_key: string | null; parent_id: string | null; is_active: boolean; sort_order: number; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; slug: string; description?: string | null; icon_key?: string | null; parent_id?: string | null; is_active?: boolean; sort_order?: number; created_at?: string; updated_at?: string };
        Update: { name?: string; slug?: string; description?: string | null; icon_key?: string | null; parent_id?: string | null; is_active?: boolean; sort_order?: number; updated_at?: string };
        Relationships: [];
      };
      website_listings: {
        Row: { id: string; owner_id: string | null; category_id: string | null; category_request_id: string | null; name: string; slug: string; url: string; normalized_domain: string; short_description: string; full_description: string | null; contact_email: string | null; ownership_confirmed: boolean; terms_accepted: boolean; status: ListingStatus; is_verified: boolean; is_featured: boolean; rejection_reason: string | null; submitted_at: string; approved_at: string | null; subscription_inactive_at: string | null; deleted_at: string | null; inactive_from_status: string | null; created_at: string; updated_at: string; published_at: string | null };
        Insert: { id?: string; owner_id?: string | null; category_id?: string | null; category_request_id?: string | null; name: string; slug: string; url: string; normalized_domain: string; short_description: string; full_description?: string | null; contact_email?: string | null; ownership_confirmed?: boolean; terms_accepted?: boolean; status?: ListingStatus; is_verified?: boolean; is_featured?: boolean; rejection_reason?: string | null; submitted_at?: string; approved_at?: string | null; subscription_inactive_at?: string | null; deleted_at?: string | null; inactive_from_status?: string | null; created_at?: string; updated_at?: string; published_at?: string | null };
        Update: { category_id?: string | null; category_request_id?: string | null; name?: string; slug?: string; url?: string; normalized_domain?: string; short_description?: string; full_description?: string | null; contact_email?: string | null; ownership_confirmed?: boolean; terms_accepted?: boolean; status?: ListingStatus; rejection_reason?: string | null; submitted_at?: string; approved_at?: string | null; subscription_inactive_at?: string | null; deleted_at?: string | null; inactive_from_status?: string | null; published_at?: string | null; updated_at?: string };
        Relationships: [];
      };
      listing_revisions: {
        Row: { id: string; listing_id: string; owner_id: string; category_id: string | null; category_request_id: string | null; name: string; url: string; normalized_domain: string; short_description: string; full_description: string | null; contact_email: string | null; status: ListingRevisionStatus; rejection_reason: string | null; submitted_at: string; reviewed_at: string | null; reviewed_by: string | null; review_notes: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; listing_id: string; owner_id: string; category_id?: string | null; category_request_id?: string | null; name: string; url: string; normalized_domain: string; short_description: string; full_description?: string | null; contact_email?: string | null; status?: "pending_review"; rejection_reason?: null; submitted_at?: string; reviewed_at?: null; reviewed_by?: string | null; review_notes?: string | null; created_at?: string; updated_at?: string };
        Update: { status?: ListingRevisionStatus; rejection_reason?: string | null; reviewed_at?: string | null; reviewed_by?: string | null; review_notes?: string | null; updated_at?: string };
        Relationships: [];
      };
      listing_metrics: {
        Row: { listing_id: string; outbound_clicks: number; profile_views: number; searches_appeared_in: number; updated_at: string };
        Insert: { listing_id: string; outbound_clicks?: number; profile_views?: number; searches_appeared_in?: number; updated_at?: string };
        Update: { outbound_clicks?: number; profile_views?: number; searches_appeared_in?: number; updated_at?: string };
        Relationships: [];
      };
      search_events: {
        Row: { id: string; query: string; category_id: string | null; result_count: number; created_at: string; anonymous_session_id: string | null; user_id: string | null };
        Insert: { id?: string; query: string; category_id?: string | null; result_count: number; created_at?: string; anonymous_session_id?: string | null; user_id?: string | null };
        Update: never;
        Relationships: [];
      };
      category_requests: {
        Row: { id: string; requested_name: string; requested_description: string | null; requested_by: string | null; status: "pending" | "approved" | "rejected"; created_at: string; reviewed_at: string | null };
        Insert: { id?: string; requested_name: string; requested_description?: string | null; requested_by?: string | null; status?: "pending"; created_at?: string; reviewed_at?: null };
        Update: { status?: "pending" | "approved" | "rejected"; reviewed_at?: string | null };
        Relationships: [];
      };
      billing_subscriptions: {
        Row: { id: string; owner_id: string; stripe_customer_id: string; stripe_subscription_id: string; stripe_price_id: string | null; status: SubscriptionStatus; cancel_at_period_end: boolean; current_period_start: string | null; current_period_end: string | null; canceled_at: string | null; ended_at: string | null; grace_period_end: string | null; trial_entitlement: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; owner_id: string; stripe_customer_id: string; stripe_subscription_id: string; stripe_price_id?: string | null; status: SubscriptionStatus; cancel_at_period_end?: boolean; current_period_start?: string | null; current_period_end?: string | null; canceled_at?: string | null; ended_at?: string | null; grace_period_end?: string | null; trial_entitlement?: boolean; created_at?: string; updated_at?: string };
        Update: { stripe_customer_id?: string; stripe_subscription_id?: string; stripe_price_id?: string | null; status?: SubscriptionStatus; cancel_at_period_end?: boolean; current_period_start?: string | null; current_period_end?: string | null; canceled_at?: string | null; ended_at?: string | null; grace_period_end?: string | null; trial_entitlement?: boolean; updated_at?: string };
        Relationships: [];
      };
      stripe_checkout_sessions: {
        Row: { id: string; owner_id: string; listing_id: string; status: "open" | "complete" | "expired"; created_at: string; completed_at: string | null };
        Insert: { id: string; owner_id: string; listing_id: string; status?: "open" | "complete" | "expired"; created_at?: string; completed_at?: string | null };
        Update: { status?: "open" | "complete" | "expired"; completed_at?: string | null };
        Relationships: [];
      };
      stripe_checkout_attempts: {
        Row: { checkout_attempt_id: string; owner_id: string; listing_id: string; stripe_checkout_session_id: string | null; checkout_status: "creating" | "open" | "failed" | "abandoned" | "complete" | "expired"; request_version: string; checkout_started_at: string; updated_at: string };
        Insert: { checkout_attempt_id?: string; owner_id: string; listing_id: string; stripe_checkout_session_id?: string | null; checkout_status?: "creating" | "open" | "failed" | "abandoned" | "complete" | "expired"; request_version: string; checkout_started_at?: string; updated_at?: string };
        Update: { stripe_checkout_session_id?: string | null; checkout_status?: "creating" | "open" | "failed" | "abandoned" | "complete" | "expired"; request_version?: string; updated_at?: string };
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: { id: string; event_type: string; received_at: string; processed_at: string | null; processing_error: string | null; created_at: string };
        Insert: { id: string; event_type: string; received_at?: string; processed_at?: string | null; processing_error?: string | null; created_at?: string };
        Update: { processed_at?: string | null; processing_error?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_likely_duplicate_domain: { Args: { candidate_domain: string; excluded_listing_id?: string | null }; Returns: boolean };
      has_current_listing_entitlement: { Args: { candidate_owner_id: string }; Returns: boolean };
      soft_delete_owned_listing: { Args: { candidate_listing_id: string }; Returns: undefined };
      request_account_deletion: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: { listing_status: ListingStatus; listing_revision_status: ListingRevisionStatus };
    CompositeTypes: Record<string, never>;
  };
}
