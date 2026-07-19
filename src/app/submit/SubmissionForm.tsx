"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { initialSubmissionState, saveSubmissionAction, type SubmissionValues } from "@/app/submit/actions";
import { SUBMISSION_LIMITS } from "@/lib/submissions/validation";

export type SubmissionCategory = { id: string; name: string };

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function SubmissionButtons({ isRevision }: { isRevision: boolean }) {
  const { pending, data } = useFormStatus();
  const intent = data?.get("intent");
  if (isRevision) return <button className="button button-accent" name="intent" value="submit" disabled={pending}>{pending ? "Submitting revision…" : "Submit revision for review"}</button>;
  return (
    <div className="form-actions">
      <button className="button button-secondary" name="intent" value="draft" disabled={pending}>{pending && intent === "draft" ? "Saving…" : "Save draft"}</button>
      <button className="button button-accent" name="intent" value="submit" disabled={pending}>{pending && intent === "submit" ? "Submitting…" : "Submit for review"}</button>
    </div>
  );
}

const emptyValues: SubmissionValues = {
  name: "", url: "", categoryMode: "existing", categoryId: "", requestedCategory: "", requestedCategoryDescription: "", description: "",
};

export function SubmissionForm({ categories, initialValues = emptyValues, listingId, isRevision = false }: { categories: SubmissionCategory[]; initialValues?: SubmissionValues; listingId?: string; isRevision?: boolean }) {
  const [state, formAction] = useActionState(saveSubmissionAction, initialSubmissionState);
  const values = state.values ?? initialValues;
  const [categoryMode, setCategoryMode] = useState<"existing" | "request">(values.categoryMode);
  const [descriptionLength, setDescriptionLength] = useState(values.description.length);

  return (
    <form action={formAction} className="submission-form" noValidate>
      {listingId && <input type="hidden" name="listingId" value={listingId} />}
      {state.errors.form && <p className="form-alert form-alert-error" role="alert">{state.errors.form}</p>}
      <div className="form-field">
        <label htmlFor="website-name">Website name</label>
        <input id="website-name" name="name" defaultValue={values.name} minLength={SUBMISSION_LIMITS.nameMin} maxLength={SUBMISSION_LIMITS.nameMax} aria-invalid={Boolean(state.errors.name)} required />
        <small>Use the name visitors will recognise.</small><FieldError message={state.errors.name} />
      </div>
      <div className="form-field">
        <label htmlFor="website-url">Website URL</label>
        <input id="website-url" name="url" type="text" inputMode="url" autoComplete="url" placeholder="https://example.com" defaultValue={values.url} maxLength={2048} aria-invalid={Boolean(state.errors.url)} required />
        <small>We add HTTPS when no protocol is supplied and remove URL fragments.</small><FieldError message={state.errors.url} />
      </div>
      <fieldset className="category-choice">
        <legend>Category</legend>
        <div className="choice-tabs">
          <label><input type="radio" name="categoryMode" value="existing" checked={categoryMode === "existing"} onChange={() => setCategoryMode("existing")} /> Choose existing</label>
          <label><input type="radio" name="categoryMode" value="request" checked={categoryMode === "request"} onChange={() => setCategoryMode("request")} /> Request a new category</label>
        </div>
        {categoryMode === "existing" ? (
          <div className="form-field">
            <label htmlFor="category-id">Closest category</label>
            <select id="category-id" name="categoryId" defaultValue={values.categoryId} aria-invalid={Boolean(state.errors.category)} required>
              <option value="">Select a category</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
            <FieldError message={state.errors.category} />
          </div>
        ) : (
          <div className="category-request-fields">
            <div className="form-field"><label htmlFor="requested-category">Requested category name</label><input id="requested-category" name="requestedCategory" defaultValue={values.requestedCategory} maxLength={SUBMISSION_LIMITS.requestedCategoryMax} aria-invalid={Boolean(state.errors.requestedCategory)} required /><FieldError message={state.errors.requestedCategory} /></div>
            <div className="form-field"><label htmlFor="requested-category-description">Why is it needed? <span>(optional)</span></label><textarea id="requested-category-description" name="requestedCategoryDescription" defaultValue={values.requestedCategoryDescription} maxLength={800} rows={3} /></div>
          </div>
        )}
      </fieldset>
      <div className="form-field">
        <div className="label-line"><label htmlFor="short-description">Short description</label><span>{descriptionLength}/{SUBMISSION_LIMITS.descriptionMax}</span></div>
        <textarea id="short-description" name="description" defaultValue={values.description} minLength={SUBMISSION_LIMITS.descriptionMin} maxLength={SUBMISSION_LIMITS.descriptionMax} rows={5} onChange={(event) => setDescriptionLength(event.currentTarget.value.length)} aria-invalid={Boolean(state.errors.description)} required />
        <small>Explain what the site offers in one or two plain-language sentences.</small><FieldError message={state.errors.description} />
      </div>
      <div className="submission-note"><strong>Human review</strong><p>Submitting does not approve, verify, or feature a listing. The directory team reviews every submission.</p></div>
      <SubmissionButtons isRevision={isRevision} />
    </form>
  );
}
