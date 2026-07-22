"use client";

import { useActionState } from "react";
import { updateProfileAction, type AccountActionState } from "@/app/account/actions";

export function ProfileForm({ displayName, email }: { displayName: string; email: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, {} as AccountActionState);
  return <form action={action} className="stack-form account-settings-form"><label>Display name<input name="displayName" defaultValue={displayName} maxLength={80} required /></label><label>Email address<input name="email" type="email" defaultValue={email} required /></label>{state.error && <p className="form-alert form-alert-error">{state.error}</p>}{state.message && <p className="form-alert form-alert-success">{state.message}</p>}<button className="button button-accent" disabled={pending}>{pending ? "Saving…" : "Save account details"}</button></form>;
}
