"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type AuthActionState = {
  error?: string;
  message?: string;
};

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function safeNextPath(formData: FormData) {
  const next = value(formData, "next");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export async function loginAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { error: "Account access is not configured for this deployment." };

  const email = value(formData, "email");
  const password = value(formData, "password");
  if (!email || !password) return { error: "Enter both your email address and password." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "We could not log you in with those details. Check them and try again." };

  redirect(safeNextPath(formData));
}

export async function signUpAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { error: "Account creation is not configured for this deployment." };

  if (value(formData, "website")) return { error: "We could not create that account." };
  const email = value(formData, "email");
  const password = value(formData, "password");
  const displayName = value(formData, "displayName");
  if (!displayName || displayName.length > 80) return { error: "Enter a display name of no more than 80 characters." };
  if (!email) return { error: "Enter your email address." };
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNextPath(formData))}`,
    },
  });

  if (error) return { error: error.message };
  if (data.session) redirect(safeNextPath(formData));
  return { message: "Account created. Check your email to confirm your address, then log in." };
}

export async function logoutAction() {
  const supabase = await getSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}

export async function forgotPasswordAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { error: "Password recovery is not configured for this deployment." };
  const email = value(formData, "email");
  if (!email) return { error: "Enter your email address." };
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if (error) return { error: "We could not send a reset email. Please try again." };
  return { message: "If an account exists for that address, a password-reset email is on its way." };
}

export async function resetPasswordAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { error: "Password reset is not configured for this deployment." };
  const password = value(formData, "password");
  const confirm = value(formData, "confirmPassword");
  if (password.length < 8) return { error: "Use a password with at least 8 characters." };
  if (password !== confirm) return { error: "The passwords do not match." };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "This reset link is invalid or expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "We could not update your password." };
  redirect("/account");
}
