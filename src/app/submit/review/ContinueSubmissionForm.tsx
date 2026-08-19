"use client";

import Link from "next/link";
import { useActionState } from "react";
import { DeleteDialog } from "@/app/account/DeleteDialog";
import { continueSubmissionAction, type ContinueSubmissionState } from "@/app/submit/review/actions";

const initialState: ContinueSubmissionState = {};

export function ContinueSubmissionForm({
  listingId,
  listingName,
  active,
  checkoutPending,
  startNewCheckoutAttempt,
}: {
  listingId: string;
  listingName: string;
  active: boolean;
  checkoutPending: boolean;
  startNewCheckoutAttempt: boolean;
}) {
  const [state, formAction, pending] = useActionState(continueSubmissionAction, initialState);
  const shouldStartNewAttempt = state.startNewCheckoutAttempt ?? startNewCheckoutAttempt;
  const idleLabel = active ? "Submit for Review" : checkoutPending ? "Resume Payment" : "Continue to Payment";
  const pendingLabel = active ? "Submitting…" : "Connecting to Stripe…";

  return (
    <>
      {state.error && <p className="form-alert form-alert-error" role="alert">{state.error}</p>}
      <div className="form-actions">
        <Link href={`/account/sites/${listingId}/edit`} className="button button-secondary">Edit Draft</Link>
        <form action={formAction} className="review-checkout-form">
          <input type="hidden" name="listingId" value={listingId} />
          <input type="hidden" name="startNewCheckoutAttempt" value={String(shouldStartNewAttempt)} />
          <button className="button button-accent" type="submit" disabled={pending} aria-busy={pending}>
            {pending ? pendingLabel : idleLabel}
          </button>
        </form>
        <DeleteDialog listingId={listingId} listingName={listingName} />
      </div>
    </>
  );
}
