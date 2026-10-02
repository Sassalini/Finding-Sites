# Internal directory seeder

This standalone Python tool discovers candidates, checks one current homepage and writes a local review file. Discovery never inserts anything. Import is a dry run unless you explicitly pass `--commit`; each inserted row must also have `approved=true` in your reviewed file. Start with 20 candidates per category. There is no scheduler, outreach, contact extraction, generated description or image collection.

## Dependencies and setup

Use Python 3.11 or newer. From this directory in PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Dependencies are DuckDB (remote Parquet queries) and tldextract (registered domains using its bundled Public Suffix List snapshot, including exclusion of privately hosted profiles). No Python code is imported by Next.js. DuckDB installs/loads its official `httpfs` extension on discovery, which needs outbound HTTPS. Local tests need no Common Crawl or Supabase access.

Set environment variables in the local shell:

```powershell
$env:SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "YOUR-LOCAL-SERVICE-ROLE-KEY"
$env:SEEDER_USER_AGENT = "FindingSitesDirectorySeeder/1.0 (+https://YOUR-SITE/contact)"
```

The first two are required for live category/duplicate reads and all imports. `SEEDER_USER_AGENT` is optional but should identify your directory with a contact-page URL. The utility does not read Next.js `.env.local` automatically. Never use a `NEXT_PUBLIC_` variable for the service key, paste it into review files, or commit it. Service credentials bypass RLS, so use only the intended project and never share them.

For discovery without database credentials, provide `--categories-file output/categories.json`, a JSON array of `{ "id": "existing-category-id", "name": "Home & Garden" }` entries. This is an offline snapshot; IDs are not built into the code. You can also provide `--existing-listings-file output/existing.json` containing `url`/`normalized_domain` records. Import always reads fresh active categories and database conflicts. No categories are created.

## Database changes to review first

Apply `supabase/migrations/20261002120000_directory_seeding.sql` through the project's normal migration process after all earlier migrations, first on a local/staging database. Review the migration before deploying the matching admin/submission changes. This task does not apply it to a remote database.

Affected objects:

| Object | Change |
| --- | --- |
| `website_listings` | Adds protected `source`, `is_seeded`, `is_claimed`, `source_crawl`, `imported_at` fields, a provenance constraint and seed index. Owner already permits NULL; descriptions already permit empty strings. Existing rows default to user submissions. |
| Public listing RLS and eligibility helper | Adds an explicit approved, unclaimed, ownerless Common Crawl branch. Active category, publication timestamps, deletion and takedown rules still apply. Owned/claimed listings keep existing entitlement rules. |
| `get_directory_stats` / admin restore | Uses the extended eligibility helper so seeds count as public directory websites and restore correctly. |
| `get_domain_submission_conflict` | Returns `seeded` for an unclaimed seed, with normal user and moderation conflicts taking precedence. The existing duplicate boolean still blocks raw inserts onto seeds. |
| New RPCs and triggers | Service-only `import_seeded_listing` and admin-only `admin_delete_seeded_listing`; protects provenance fields and serializes domain-changing listing/revision writes. |
| `/admin/seeded` and admin navigation | Shows source, crawl, category, import time and claim state; deletes only active unclaimed seeds, retaining history. Existing moderation remains available. |
| Submission action / database types | Shows a claim-specific message rather than the ordinary duplicate error. |

Existing public policies invoke `is_admin()` even for anonymous queries. The migration grants anonymous execution of this existing boolean helper, which checks only the caller's own `auth.uid()`; it does not grant access to private rows or administrator actions.

No fake profiles, customers or subscriptions are created. Seeds have `owner_id=NULL`, blank description, NULL contact email and false ownership/terms flags. Existing owner-based slot counts, Account queries, subscription cancellation and Stripe code are unchanged. Seeds contribute to public website/category totals but occupy no account slots. A global advisory lock is used only for insertion/domain changes and pending revision writes, to coordinate root/subdomain duplicate checks with imports; this trades some concurrent submission throughput for correctness in this small directory.

## Discovery

```powershell
.venv\Scripts\python.exe seed.py discover --category "Home & Garden" --limit 20 --dry-run --output output/home-review.csv
.venv\Scripts\python.exe seed.py discover --all --limit-per-category 20 --output output/all-review.json
```

`category_keywords.json` maps **existing category names**, not IDs, to multiple keywords. This project's canonical categories are broad: plumbing/heating are under Home & Garden; web design is under Computers & Internet; accountants are under Business & Services. Add names/keywords if your active database categories differ. `--all` warns and skips active categories with no configured keywords. A named category without configured keywords fails clearly.

The tool fetches `https://index.commoncrawl.org/collinfo.json`, checks recent crawls in descending order, and uses the small published `crawl-data/<crawl>/cc-index-table.paths.gz` manifest. If the latest crawl has no published Parquet manifest yet, it tries recent earlier crawls. Only the selected `subset=warc` **URL-index Parquet paths** are used; WARC archives themselves are never fetched. An explicit `--crawl CC-MAIN-YYYY-WW` selects a crawl without silently changing it.

DuckDB reads Parquet footers first to skip shards whose TLD statistics exclude `.uk`. SQL then filters successful HTTP 200 HTML captures, UK TLDs and URL hostname/path keyword matches. Results are deduplicated to a registered domain and capped per category, then deduplicated across the run. Existing listing and pending revision domains are skipped before homepage verification. Database reads omit owners, contacts and other personal fields. Historical listings are conservatively skipped too, even if an ordinary user could reuse a deleted domain.

Default budgets are `--max-metadata-files 400` small footers and `--max-index-files 20` matching data shards per category. These are separate from candidate limits. The full crawl URL index is large; grouping, substring keywords and a SQL LIMIT can still require substantial index data reads. A capped scan is a partial sample, may produce fewer than 20 candidates, and is not a complete search. Increase budgets deliberately after checking performance and quality; each flag supports at most 1,000. Multiple categories reuse no persisted index data and may repeat reads.

`.uk` includes `.co.uk`, `.org.uk` and `.ltd.uk`. Optional `--include-non-uk` also finds domains with explicit `/uk/`, `/united-kingdom/` or `/great-britain/` path hints, preferring UK-containing shards first. It is a narrow heuristic: many UK organisations use `.com` with no UK path. Manually check UK relevance; neither a suffix nor a path proves location.

References: [Common Crawl URL Index schema and partitions](https://commoncrawl.org/url-index), [published columnar-index manifest format](https://www.commoncrawl.org/blog/february-march-2024-crawl-archive-now-available).

## Homepage verification and logging

Checks run serially with a default 1-second delay, 10-second socket timeout and no retry. CLI options permit `--delay` of at least 0.5 seconds, `--timeout` of 1–30 seconds and `--retries 1` for a single retry on transport failure. Block/challenge responses are never retried or bypassed. HTTPS is required; there is no HTTP fallback or authentication.

DNS is checked for public IPs and the connection is pinned to a validated address, preserving TLS hostname validation. Only up to three HTTPS redirects within the same registered domain are followed, and only to a homepage path without query parameters. Locale/login/deep-path redirects need manual investigation and are skipped. Bodies are capped at 512 KiB, non-HTML/unsupported encoding responses are skipped, and requests use no cookies or proxy configuration. Only one homepage is normally requested; no scripts execute and no other pages or resources are fetched.

Heuristics reject obvious parked/for-sale, blocked, adult, gambling, scam, link-farm or directory pages; social and major directory domains are excluded. Categories are inferred from current homepage evidence, not historical URL keywords. Conflicting live category evidence rejects the candidate; weak/tied evidence is `unclassified` for review. Confidence values are heuristic scores, not calibrated probabilities. Website names use JSON-LD organisations/businesses, site metadata, title, then domain fallback. Names resembling email addresses/phone numbers are discarded. Homepage HTML, descriptions, images, logos and contact details are not retained. Staged capture URLs omit queries and paths resembling contacts; review output contains only the selected fields. Log messages contain domains, category decisions and rejection reasons, not homepage content, database diagnostics or keys.

Both console output and `--log-file seeder.log` record acceptance/rejection and scan progress. Final discovery output reports discovered, live, rejected, duplicate and ready-for-review totals. Import reports validation/skipping and inserted/duplicate outcomes. Live counts include successful HTTP responses later rejected by content checks.

## Inspect and approve candidates

Open the CSV in a spreadsheet or JSON in an editor. Fields include website name, homepage URL, registered domain, suggested category/confidence, live status, crawl, sanitized capture URL, verification status/reason, discovery time and `approved`.

1. Visit the website yourself; verify identity, UK usefulness, category and quality.
2. Keep `approved=false` for anything uncertain or rejected.
3. Correct names/categories where appropriate. For unclassified rows, choose an **active existing category name** before approval.
4. Set `approved=true` only for rows you have reviewed. Do not change a rejected row to `ready_for_review` to force publication.
5. Save a small approval file such as `output/home-approved.csv`.

Writing a review output never overwrites an existing file; choose a new filename each run. CSV formula-like strings are prefixed with an apostrophe for spreadsheet safety; manually clean any affected business name before approving. Keep local review files private and outside version control (the `output/` directory is ignored).

## Dry-run and import approved candidates

```powershell
.venv\Scripts\python.exe seed.py import output/home-approved.csv
.venv\Scripts\python.exe seed.py import output/home-approved.csv --dry-run
.venv\Scripts\python.exe seed.py import output/home-approved.csv --commit
```

Dry-run is the default for import and never calls the write RPC. `--dry-run` takes precedence over `--commit`. Discovery is always a dry run regardless of flags. Import validates approval, prior verification status, HTTPS homepage URLs, PSL domain equivalence, names, crawl format, duplicates and current category names. Duplicate domains within the approval file are also skipped. Default import batch limit is 20 ready rows; split larger files or explicitly use `--batch-size`, which can never exceed 100.

Committed import rechecks the live homepage after review. Changed/unsafe/dead sites are skipped. It then calls the service-only RPC, which locks domain writes, rechecks category activity and conflicts and **inserts only**. It never upserts, replaces or deletes an existing user listing. Category IDs come from the current database, not the review file. Description is always empty. Re-running the file is idempotent by domain. Each RPC is a separate transaction: if a network/database error interrupts the batch, earlier inserts may remain. No automatic write retry occurs; run the dry run again to identify remaining rows safely. Public statistics have the existing cache delay of up to 60 seconds after script imports.

## Remove seeds

Visit `/admin/seeded` as an existing administrator. For an active unclaimed seed, check the deletion confirmation and click **Delete seeded listing**. This soft-deletes it and refreshes public/admin views; its provenance and any moderation history remain. Removed/restricted or claimed seeds use the existing `/admin/listings` moderation actions instead. A member cannot delete/claim a seed by directly calling these RPCs.

## Later claims

An unclaimed seed returns the distinct `seeded` conflict result and displays a message asking its legitimate manager to arrange ownership verification. Automated claiming or replacement is deliberately a later feature; this release does not treat an ownership checkbox as proof or assign a seed to the submitter.

The schema supports a trusted, atomic future claim: verify ownership, lock the seed, attach the real owner's ID, set `is_claimed=true`, collect the normal consent/contact data and route it through draft/review plus existing entitlement checks. Retain provenance or replace it through trusted administration. A claimed seed immediately loses the subscription-free publication branch and occupies the real owner's normal slot; the existing limit trigger applies to owner assignment. Keep this transition private until normal finalisation succeeds. Existing user-owned domains and moderation restrictions always take priority.

## Tests and limits

```powershell
.venv\Scripts\python.exe -m unittest discover -s tests -v
```

From the repository root, `npm test` also runs the seeding migration against an isolated in-memory PostgreSQL instance (PGlite), applying all repository migrations with Supabase-style roles/auth helpers. It checks real insertion, RLS visibility/protection, provenance spoofing, slot counts, duplicates, inactive categories, future claim visibility and admin removal/restoration/deletion. No remote database is contacted. Production Supabase deployment should still be checked in staging first.

Common Crawl is a historical sample, not a complete directory. Publication timings, schemas and manifests may change; metadata failures stop clearly rather than switching to WARC downloads. Bundled PSL data ages with the dependency version. Homepage-only keyword heuristics cannot prove ownership, legitimacy, location or safety, and can miss JS-rendered sites or reject legitimate sites mentioning a blocked topic. HTTPS-only, body limits, redirects, DNS/TLS failures and anti-bot protection can cause false rejections. Human review is required for every publication. No malware reputation service or ownership-verification service is included.
