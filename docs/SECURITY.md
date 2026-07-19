# Security notes

Finding Sites treats the browser as untrusted.

- URLs must be parsed with the platform `URL` class on a trusted server. Only `http:` and `https:` are accepted. Store `url.hostname` in lower-case ASCII, remove only an intentional leading `www.`, and resolve DNS/redirects in a controlled outbound-click service before launch.
- RLS makes active categories and approved listings public. Owners can manage only their own drafts/submissions. Database triggers prevent ordinary users from changing roles, approval state, verification, featured state, ownership, or publication timestamps.
- Metrics and search events have no public write policy. Future counters should be updated through rate-limited server endpoints or narrowly scoped security-definer RPCs that never accept a replacement count from the client.
- Submission actions normalise URLs on the server and use a security-definer function that returns only a boolean for duplicate-domain detection. Add per-account and per-IP rate limits, a honeypot, elapsed-time checks, and a privacy-preserving CAPTCHA when abuse warrants it.
- Owners can edit only drafts and rejected submissions. Changes to approved listings are written to `listing_revisions`, so the published row remains untouched until an administrator reviews the revision.
- Admin actions require a server-verified `profiles.role = 'admin'`. Never infer admin access from client state or editable metadata.
- Keep service-role credentials in the deployment secret store only. They must never use a `NEXT_PUBLIC_` name.
- Before enabling crawler previews or metadata fetching, block loopback, private, link-local and cloud-metadata IP ranges to prevent SSRF.
