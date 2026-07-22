"use client";
import { useActionState } from "react";
import { resetPasswordAction, type AuthActionState } from "@/app/login/actions";
const initialState: AuthActionState = {};
export function ResetPasswordForm() { const [state, action, pending] = useActionState(resetPasswordAction, initialState); return <form action={action} className="stack-form auth-panel"><label>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>{state.error && <p className="form-alert form-alert-error">{state.error}</p>}<button className="button button-accent" disabled={pending}>{pending ? "Updating…" : "Update password"}</button></form>; }
