import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForms } from "@/app/login/AuthForms";
import { getSupabaseServerClient } from "@/lib/supabase/server";
export const metadata: Metadata = { title: "Create account", robots: { index: false, follow: false } };
export default async function SignupPage() { const supabase = await getSupabaseServerClient(); const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } }; if (data.user) redirect("/account"); return <main className="account-shell account-shell-narrow" id="main-content"><header className="account-heading"><span className="eyebrow">Website owners</span><h1>Create your account</h1><p>One account subscription includes up to two website listings.</p></header><AuthForms next="/account" initialMode="signup" /></main>; }
