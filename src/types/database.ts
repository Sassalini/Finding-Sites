export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type ListingStatus = "draft" | "pending_review" | "approved" | "rejected" | "suspended" | "expired";
export type ListingRevisionStatus = "pending_review" | "approved" | "rejected";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; display_name: string | null; role: "member" | "admin"; created_at: string; updated_at: string };
        Insert: { id: string; display_name?: string | null; role?: "member" | "admin"; created_at?: string; updated_at?: string };
        Update: { display_name?: string | null; updated_at?: string };
        Relationships: [];
      };
      categories: {
        Row: { id: string; name: string; slug: string; description: string | null; icon_key: string | null; parent_id: string | null; is_active: boolean; sort_order: number; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; slug: string; description?: string | null; icon_key?: string | null; parent_id?: string | null; is_active?: boolean; sort_order?: number; created_at?: string; updated_at?: string };
        Update: { name?: string; slug?: string; description?: string | null; icon_key?: string | null; parent_id?: string | null; is_active?: boolean; sort_order?: number; updated_at?: string };
        Relationships: [];
      };
      website_listings: {
        Row: { id: string; owner_id: string | null; category_id: string | null; category_request_id: string | null; name: string; slug: string; url: string; normalized_domain: string; short_description: string; full_description: string | null; status: ListingStatus; is_verified: boolean; is_featured: boolean; rejection_reason: string | null; submitted_at: string; approved_at: string | null; updated_at: string; published_at: string | null };
        Insert: { id?: string; owner_id?: string | null; category_id?: string | null; category_request_id?: string | null; name: string; slug: string; url: string; normalized_domain: string; short_description: string; full_description?: string | null; status?: ListingStatus; is_verified?: boolean; is_featured?: boolean; rejection_reason?: string | null; submitted_at?: string; approved_at?: string | null; updated_at?: string; published_at?: string | null };
        Update: { category_id?: string | null; category_request_id?: string | null; name?: string; slug?: string; url?: string; normalized_domain?: string; short_description?: string; full_description?: string | null; status?: ListingStatus; updated_at?: string };
        Relationships: [];
      };
      listing_revisions: {
        Row: { id: string; listing_id: string; owner_id: string; category_id: string | null; category_request_id: string | null; name: string; url: string; normalized_domain: string; short_description: string; status: ListingRevisionStatus; rejection_reason: string | null; created_at: string; reviewed_at: string | null };
        Insert: { id?: string; listing_id: string; owner_id: string; category_id?: string | null; category_request_id?: string | null; name: string; url: string; normalized_domain: string; short_description: string; status?: "pending_review"; rejection_reason?: null; created_at?: string; reviewed_at?: null };
        Update: { status?: ListingRevisionStatus; rejection_reason?: string | null; reviewed_at?: string | null };
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
    };
    Views: Record<string, never>;
    Functions: {
      has_likely_duplicate_domain: { Args: { candidate_domain: string; excluded_listing_id?: string | null }; Returns: boolean };
    };
    Enums: { listing_status: ListingStatus; listing_revision_status: ListingRevisionStatus };
    CompositeTypes: Record<string, never>;
  };
}
