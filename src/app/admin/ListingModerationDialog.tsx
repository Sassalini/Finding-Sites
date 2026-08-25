"use client";

import { useRef, useState } from "react";
import { moderatePublicListingAction } from "@/app/admin/actions";

const reasons = [
  ["nsfw", "NSFW / adult content"],
  ["malware", "Malware / unsafe website"],
  ["scam", "Scam / fraud"],
  ["spam", "Spam"],
  ["illegal", "Illegal / prohibited content"],
  ["misleading", "Misleading listing"],
  ["terms", "Terms violation"],
  ["other", "Other"],
] as const;

type Props = {
  listingId: string;
  listingName: string;
  mode: "remove" | "restore";
  returnPath?: "/admin/listings" | "/admin/reviews";
};

export function ListingModerationDialog({ listingId, listingName, mode, returnPath = "/admin/listings" }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const removing = mode === "remove";

  return <>
    <button type="button" className={`button ${removing ? "button-danger" : "button-secondary"}`} onClick={() => dialogRef.current?.showModal()}>
      {removing ? "Remove Listing" : "Restore Listing"}
    </button>
    <dialog ref={dialogRef} className="confirm-dialog moderation-dialog" onClose={() => setReason("")}>
      <form action={moderatePublicListingAction}>
        <input type="hidden" name="listingId" value={listingId} />
        <input type="hidden" name="intent" value={mode} />
        <input type="hidden" name="returnPath" value={returnPath} />
        <div>
          <span className="eyebrow">Administrator action</span>
          <h2>{removing ? "Remove" : "Restore"} {listingName}?</h2>
        </div>
        {removing ? <>
          <p>This will immediately remove the website from the public directory. The record will be retained for moderation and audit purposes.</p>
          <label>Removal reason
            <select name="reason" required value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="" disabled>Choose a reason</option>
              {reasons.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label>Moderator notes {reason === "other" ? "(required)" : "(optional)"}
            <textarea name="notes" minLength={reason === "other" ? 5 : undefined} maxLength={2000} required={reason === "other"} />
            <small>Private: visible to administrators only.</small>
          </label>
        </> : <p>The takedown will be cleared and the audit history retained. The listing will only become public if it is still approved, its category is active, its owner has a current entitlement, and it has not been owner-deleted.</p>}
        <label className="moderation-confirm"><input type="checkbox" name="confirmed" value="yes" required /> I understand and explicitly confirm this action.</label>
        <div className="form-actions">
          <button type="button" className="button button-secondary" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button className={`button ${removing ? "button-danger" : "button-accent"}`}>{removing ? "Confirm Removal" : "Confirm Restore"}</button>
        </div>
      </form>
    </dialog>
  </>;
}
