"use client";

import { useActionState, useState } from "react";
import { loginAction, signUpAction, type AuthActionState } from "@/app/login/actions";

const initialState: AuthActionState = {};

function SubmitButton({ children }: { children: string }) {
  return <button type="submit" className="button button-accent">{children}</button>;
}

export function AuthForms({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, initialError ? { error: initialError } : initialState);
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, initialState);
  const state = mode === "login" ? loginState : signUpState;

  return (
    <div className="auth-panel">
      <div className="auth-tabs" role="tablist" aria-label="Account access">
        <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => setMode("login")}>Log in</button>
        <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>Create account</button>
      </div>
      <form action={mode === "login" ? loginFormAction : signUpFormAction} className="stack-form">
        <input type="hidden" name="next" value={next} />
        {mode === "signup" && (
          <label>Display name<input name="displayName" autoComplete="name" maxLength={80} required /></label>
        )}
        <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>
        {state.error && <p className="form-alert form-alert-error" role="alert">{state.error}</p>}
        {state.message && <p className="form-alert form-alert-success" role="status">{state.message}</p>}
        <SubmitButton>{mode === "login" ? (loginPending ? "Logging in…" : "Log in") : (signUpPending ? "Creating account…" : "Create account")}</SubmitButton>
      </form>
    </div>
  );
}
