import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/app/forgot-password/ForgotPasswordForm";
export const metadata: Metadata = { title: "Forgot password", robots: { index: false, follow: false } };
export default function ForgotPasswordPage() { return <main className="account-shell account-shell-narrow" id="main-content"><header className="account-heading"><span className="eyebrow">Account recovery</span><h1>Reset your password</h1><p>We will send a secure Supabase recovery link to your account email.</p></header><ForgotPasswordForm /><p className="auth-return"><Link href="/login">Return to login</Link></p></main>; }
