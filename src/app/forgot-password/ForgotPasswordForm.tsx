"use client";
import { useActionState } from "react";
import { forgotPasswordAction, type AuthActionState } from "@/app/login/actions";
const initialState: AuthActionState = {};
export function ForgotPasswordForm() { const [state, action, pending] = useActionState(forgotPasswordAction, initialState); return <form action={action} className="stack-form auth-panel"><label>Email address<input name="email" type="email" autoComplete="email" required /></label>{state.error && <p className="form-alert form-alert-error">{state.error}</p>}{state.message && <p className="form-alert form-alert-success">{state.message}</p>}<button className="button button-accent" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button></form>; }
