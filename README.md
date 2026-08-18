# Finding Sites

Finding Sites is a production-oriented MVP for a human-curated website and business directory. It includes a responsive public directory, owner accounts, subscription-aware submissions, Stripe Checkout, webhook-confirmed payments, an administrator review queue, category browsing, search and sorting, and a Supabase-backed data model.

## Stack

- Next.js App Router, React and TypeScript
- Tailwind CSS v4 plus a small CSS-variable design system
- Supabase Auth, PostgreSQL and row-level security
- Stripe Checkout subscriptions and verified webhooks
- OpenNext for Cloudflare Workers

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and add the required values.
3. Start the application with `npm run dev`.
4. Open `http://localhost:3000`.

Supabase variables may be left empty for public-directory interface development. The app then uses the typed fixture in `src/data/listings.ts`. Account, submission, payment and moderation features require Supabase to be configured.

## Database setup

Create a Supabase project, add its public URL and anon key to `.env.local`, then apply these files in order:

1. `supabase/migrations/20260716160000_initial_directory_schema.sql`
2. `supabase/migrations/20260719120000_website_submissions.sql`
3. `supabase/migrations/20260721120000_billing_and_moderation.sql`
4. `supabase/migrations/20260721150000_account_subscription_fields.sql`
5. `supabase/migrations/20260721151000_listing_entitlements_and_limits.sql`
6. `supabase/seed.sql` for development categories only

With the Supabase CLI linked to the intended project, run `npx supabase db push` and `npx supabase db seed`.

The schema keeps approval, verification, billing state and publication behind database-enforced or server-only boundaries. See `docs/SECURITY.md` for URL normalisation, SSRF, anti-spam and administrator-boundary notes.

## Listing and billing workflow

After account creation, the owner completes a listing form and reviews a saved draft. If the account has no active subscription, the server creates or reuses a Stripe Customer and opens a fixed-price subscription Checkout session. The browser success page never grants entitlement. A verified webhook retrieves the resulting subscription, validates the configured Price, mirrors its status and only then moves an eligible listing to `pending_review`. An active account subscription covers at most two countable listings; the database trigger uses an account-scoped transaction lock to enforce that limit during concurrent requests.

Administrators visit `/admin` to approve or reject pending listings. Approval sets the publication timestamps, after which the Supabase directory repository includes the listing on the public site.

Create one recurring Stripe Price and set `STRIPE_DIRECTORY_PRICE_ID`. Register `/api/stripe/webhook` for:

- `checkout.session.completed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Enable the Stripe Customer Portal and allow customers to update payment methods and billing information, view/download invoices, and cancel subscriptions at the end of the current period. The application creates portal sessions only from the authenticated account's stored Stripe Customer ID.

The payment-failure policy provides a seven-day public-listing grace period. New submissions still require a normal qualifying status. Once a subscription is unpaid, paused, expired or ended, approved listings move to `subscription_inactive`; reactivation restores unchanged listings that were previously approved.

### Local Stripe webhook testing

Install the Stripe CLI, sign in, and forward test events to the local route:

```powershell
stripe login
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

Copy the displayed `whsec_...` value into local `STRIPE_WEBHOOK_SECRET`, then use Stripe Checkout in test mode or run:

```powershell
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

Configure Supabase Auth Site URL and redirect allow-list entries for `/auth/callback`, `/reset-password` and `/account` on both local and production origins. Email confirmation and password recovery require an SMTP configuration suitable for the deployment.

Store `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` only as server-side deployment secrets. To make a user an administrator, update their `profiles.role` to `admin` through trusted Supabase administration tooling.

## Advertising switch

Advertising is disabled by default. `DesktopSideAdSlot`, `MobileInlineAdSlot` and `DirectoryAdPlaceholder` render nothing unless `NEXT_PUBLIC_ADVERTISING_ENABLED=true`. No advertising provider is integrated.

## Quality checks

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

## Cloudflare deployment

Set the Worker variable `NEXT_PUBLIC_SITE_URL=https://findingsites.com`. Configure `STRIPE_SECRET_KEY` (an `sk_test_...` sandbox key), `STRIPE_DIRECTORY_PRICE_ID` (a `price_...` ID), and `STRIPE_WEBHOOK_SECRET` (a `whsec_...` signing secret) as Worker bindings. The webhook secret is checked only when processing incoming webhooks; Checkout creation requires the secret key, Price ID, and canonical site URL. `npm run preview` builds and previews the Worker, while `npm run deploy` publishes it through OpenNext and Wrangler.

OpenNext warns that Windows is not fully supported. In this workspace, the verified PowerShell route maps the project as a drive root and keeps Wrangler configuration inside the project:

```powershell
subst W: "C:\Users\MrHob\Documents\Finding sites"
Set-Location W:\
$env:XDG_CONFIG_HOME = "W:\.wrangler-config"
npm.cmd run build:worker
npx.cmd wrangler deploy --dry-run
```

When finished, return to another drive before removing the temporary mapping with `subst W: /D`.

## Current MVP boundaries

- Search-event logging, click tracking, image uploads and an advertising provider remain outside this phase.
- Policy and contact pages are placeholders and require reviewed launch copy.
- Public filtering is performed over the approved result set in this initial build; add database pagination and search RPCs before production-scale data is loaded.
