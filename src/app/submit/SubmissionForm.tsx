"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveSubmissionAction, type SubmissionActionState, type SubmissionValues } from "@/app/submit/actions";
import { initialCategoryMode, switchCategoryMode, type CategoryMode, type SubmissionCategory } from "@/lib/submissions/form";
import { SUBMISSION_LIMITS } from "@/lib/submissions/validation";

export type { SubmissionCategory } from "@/lib/submissions/form";

function FieldError({ message }: { message?: string }) {
  return message ? <span className="field-error">{message}</span> : null;
}

function SubmissionButtons({ isRevision }: { isRevision: boolean }) {
  const { pending, data } = useFormStatus();
  const intent = data?.get("intent");
  if (isRevision) return <button type="submit" className="button button-accent" name="intent" value="submit" disabled={pending}>{pending ? "Submitting revision…" : "Submit revision for review"}</button>;
  return (
    <div className="form-actions">
      <button type="submit" className="button button-secondary" name="intent" value="draft" disabled={pending}>{pending && intent === "draft" ? "Saving…" : "Save Draft"}</button>
      <button type="submit" className="button button-accent" name="intent" value="submit" disabled={pending}>{pending && intent === "submit" ? "Preparing summary…" : "Continue to Review"}</button>
    </div>
  );
}

const emptyValues: SubmissionValues = {
  name: "", url: "", categoryMode: "existing", categoryId: "", requestedCategory: "", requestedCategoryDescription: "", description: "", contactEmail: "", ownershipConfirmed: false, termsAccepted: false,
};

const initialSubmissionState: SubmissionActionState = { errors: {} };

export function SubmissionForm({ categories, initialValues, defaultEmail = "", listingId, isRevision = false }: { categories: SubmissionCategory[]; initialValues?: SubmissionValues; defaultEmail?: string; listingId?: string; isRevision?: boolean }) {
  initialValues ??= { ...emptyValues, contactEmail: defaultEmail };
  const [state, formAction] = useActionState(saveSubmissionAction, initialSubmissionState);
  const values = state.values ?? initialValues;
  const categoriesAvailable = categories.length > 0;
  const [categoryMode, setCategoryMode] = useState<CategoryMode>(initialCategoryMode(categories, values.categoryMode));
  const [categoryChoice, setCategoryChoice] = useState({
    categoryId: values.categoryId,
    requestedCategory: values.requestedCategory,
    requestedCategoryDescription: values.requestedCategoryDescription,
  });
  const [descriptionLength, setDescriptionLength] = useState(values.description.length);
  const [clearedCategoryErrors, setClearedCategoryErrors] = useState<SubmissionActionState | null>(null);
  // Dismiss errors from the previous choice, but show fresh errors after a submit.
  const categoryErrors = clearedCategoryErrors === state ? {} : state.errors;

  function changeCategoryMode(mode: CategoryMode) {
    setCategoryMode(mode);
    setCategoryChoice((choice) => switchCategoryMode(choice, mode));
    setClearedCategoryErrors(state);
  }

  function selectCategory(categoryId: string) {
    setCategoryChoice((choice) => ({ ...switchCategoryMode(choice, "existing"), categoryId }));
  }

  function changeRequestedCategory(field: "requestedCategory" | "requestedCategoryDescription", value: string) {
    setCategoryChoice((choice) => ({ ...switchCategoryMode(choice, "request"), [field]: value }));
  }

  return (
    <form action={formAction} className="submission-form" noValidate>
      <label className="honeypot-field" aria-hidden="true">Company<input name="company" tabIndex={-1} autoComplete="off" /></label>
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
          <label><input type="radio" name="categoryMode" value="existing" checked={categoryMode === "existing"} onChange={() => changeCategoryMode("existing")} disabled={!categoriesAvailable} /> Choose existing</label>
          <label><input type="radio" name="categoryMode" value="request" checked={categoryMode === "request"} onChange={() => changeCategoryMode("request")} /> Request a new category</label>
        </div>
        {!categoriesAvailable && <p className="form-alert">No existing categories are available yet. You can request one below.</p>}
        {categoryMode === "existing" ? (
          <div className="form-field">
            <label htmlFor="category-id">Closest category</label>
            <select id="category-id" name="categoryId" value={categoryChoice.categoryId} onChange={(event) => selectCategory(event.currentTarget.value)} aria-invalid={Boolean(categoryErrors.category)} required>
              <option value="">Select a category</option>
              {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
            <FieldError message={categoryErrors.category} />
          </div>
        ) : (
          <div className="category-request-fields">
            <div className="form-field"><label htmlFor="requested-category">Requested category name</label><input id="requested-category" name="requestedCategory" value={categoryChoice.requestedCategory} onChange={(event) => changeRequestedCategory("requestedCategory", event.currentTarget.value)} maxLength={SUBMISSION_LIMITS.requestedCategoryMax} aria-invalid={Boolean(categoryErrors.requestedCategory)} required /><FieldError message={categoryErrors.requestedCategory} /></div>
            <div className="form-field"><label htmlFor="requested-category-description">Provide a short description of what this category is <span>(optional)</span></label><textarea id="requested-category-description" name="requestedCategoryDescription" value={categoryChoice.requestedCategoryDescription} onChange={(event) => changeRequestedCategory("requestedCategoryDescription", event.currentTarget.value)} minLength={SUBMISSION_LIMITS.descriptionMin} maxLength={SUBMISSION_LIMITS.descriptionMax} rows={3} aria-invalid={Boolean(categoryErrors.requestedCategoryDescription)} /><small>{categoryChoice.requestedCategoryDescription.length}/{SUBMISSION_LIMITS.descriptionMax} characters. You can leave this blank.</small><FieldError message={categoryErrors.requestedCategoryDescription} /></div>
          </div>
        )}
      </fieldset>

      <div className="form-field">
        <div className="label-line"><label htmlFor="short-description">Short description <span>(optional)</span></label><span>{descriptionLength}/{SUBMISSION_LIMITS.descriptionMax}</span></div>
        <textarea id="short-description" name="description" defaultValue={values.description} minLength={SUBMISSION_LIMITS.descriptionMin} maxLength={SUBMISSION_LIMITS.descriptionMax} rows={5} onChange={(event) => setDescriptionLength(event.currentTarget.value.length)} aria-invalid={Boolean(state.errors.description)} />
        <small>Explain what the site offers in one or two plain-language sentences. Up to {SUBMISSION_LIMITS.descriptionMax} characters; you can leave this blank.</small><FieldError message={state.errors.description} />
      </div>

      <div className="form-field">
        <label htmlFor="contact-email">Contact email</label>
        <input id="contact-email" name="contactEmail" type="email" autoComplete="email" defaultValue={values.contactEmail} maxLength={320} aria-invalid={Boolean(state.errors.contactEmail)} required />
        <small>Used only for administrative communication about this listing.</small><FieldError message={state.errors.contactEmail} />
      </div>

      <div className="consent-fields">
        <label><input type="checkbox" name="ownershipConfirmed" defaultChecked={values.ownershipConfirmed} /> I own this website or am authorised to list it.</label>
        <FieldError message={state.errors.ownership} />
        <label><input type="checkbox" name="termsAccepted" defaultChecked={values.termsAccepted} /> I agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/community-guidelines" target="_blank">Community Guidelines</a>.</label>
        <FieldError message={state.errors.terms} />
      </div>

      <div className="submission-note"><strong>What happens next</strong><p>Your draft is saved before payment. You will confirm this summary, then either continue to Stripe or submit directly with an active subscription.</p></div>
      <SubmissionButtons isRevision={isRevision} />
    </form>
  );
}
