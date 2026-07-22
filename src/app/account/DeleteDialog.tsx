"use client";

import { useRef, useState } from "react";
import { deleteListingAction, requestAccountDeletionAction } from "@/app/account/actions";

export function DeleteDialog({ listingId, listingName }: { listingId?: string; listingName?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const account = !listingId;
  return (
    <>
      <button className={`button ${account ? "button-danger" : "button-secondary"}`} type="button" onClick={() => dialogRef.current?.showModal()}>{account ? "Delete Account" : "Delete"}</button>
      <dialog className="confirm-dialog" ref={dialogRef} onClose={() => setConfirmation("")}>
        <form action={account ? requestAccountDeletionAction : deleteListingAction}>
          {listingId && <input type="hidden" name="listingId" value={listingId} />}
          <span className="eyebrow">Destructive action</span>
          <h2>{account ? "Request account deletion?" : `Delete ${listingName}?`}</h2>
          <p>{account ? "Active billing must be cancelled first. Your sites will be removed from public view, while required billing and audit records are retained." : "This site will disappear from the directory and free one listing slot. Your Stripe subscription will continue."}</p>
          <label>Type <strong>DELETE</strong> to confirm<input name="confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
          <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => dialogRef.current?.close()}>Keep {account ? "account" : "site"}</button><button className="button button-danger" disabled={confirmation !== "DELETE"}>Confirm deletion</button></div>
        </form>
      </dialog>
    </>
  );
}
