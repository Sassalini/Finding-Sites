import "server-only";

import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdmin(returnPath = "/admin") {
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error || profile?.role !== "admin") notFound();
  return { supabase, user };
}
