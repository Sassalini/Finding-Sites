import type { Metadata } from "next";
import { ResetPasswordForm } from "@/app/reset-password/ResetPasswordForm";
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false } };
export default function ResetPasswordPage() { return <main className="account-shell account-shell-narrow" id="main-content"><header className="account-heading"><span className="eyebrow">Account recovery</span><h1>Choose a new password</h1><p>Use at least eight characters.</p></header><ResetPasswordForm /></main>; }
