"""Local-only Supabase REST access. Never upsert or update an existing listing."""
from __future__ import annotations

import json
import os
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from core import PII, is_duplicate, normalize_url, registered_domain


class SupabaseStore:
    def __init__(self):
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        parsed = urlsplit(self.url)
        local = parsed.hostname in {"localhost", "127.0.0.1"}
        if not self.url or not self.key or parsed.username or parsed.password or parsed.query or parsed.fragment or (parsed.scheme != "https" and not (local and parsed.scheme == "http")):
            raise ValueError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the local environment")

    def request(self, path, method="GET", payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(self.url + "/rest/v1/" + path, data=data, method=method,
                          headers={"apikey": self.key, "Authorization": "Bearer " + self.key, "Content-Type": "application/json"})
        try:
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as error:
            # Database diagnostics may contain row contents or credentials. Do not log them.
            raise RuntimeError(f"Supabase request failed (HTTP {error.code}); check configuration/migration and retry") from None

    def pages(self, table, select, filters=None):
        rows, offset = [], 0
        while True:
            params = {"select": select, "order": "id.asc", "limit": 500, "offset": offset, **(filters or {})}
            page = self.request(table + "?" + urlencode(params))
            rows.extend(page)
            if len(page) < 500:
                return rows
            offset += len(page)

    def categories(self):
        return self.pages("categories", "id,name,slug", {"is_active": "eq.true"})

    def listings(self):
        # All historical domains are conservatively skipped, including deleted ones.
        # No contact/owner data is retrieved. Pending revisions also reserve domains.
        return self.pages("website_listings", "id,url,normalized_domain") + self.pages("listing_revisions", "id,url,normalized_domain", {"status": "eq.pending_review"})

    def insert_seed(self, payload):
        return self.request("rpc/import_seeded_listing", "POST", payload)


def prepare_import(row, categories, listings):
    if str(row.get("approved", "")).lower() not in {"true", "yes", "1"}:
        return None, "not_approved"
    if row.get("verification_status") != "ready_for_review":
        return None, "not_verified"
    url = normalize_url(row["url"])
    if urlsplit(url).scheme != "https" or urlsplit(url).path != "/" or urlsplit(url).query:
        return None, "not_https_homepage"
    domain = registered_domain(url)
    if registered_domain(row["registered_domain"]) != domain:
        return None, "domain_mismatch"
    if is_duplicate(domain, url, listings):
        return None, "duplicate_existing_listing"
    category = next((category for category in categories if category["name"] == row.get("suggested_category")), None)
    if not category:
        return None, "category_missing_or_unclassified"
    name = str(row.get("website_name", "")).strip()
    if not 2 <= len(name) <= 120 or PII.search(name):
        return None, "invalid_website_name"
    from discovery import CRAWL_PATTERN
    crawl = str(row.get("source_crawl", ""))
    if not CRAWL_PATTERN.fullmatch(crawl):
        return None, "invalid_source_crawl"
    return {"candidate_name": name, "candidate_url": url, "candidate_domain": domain,
            "candidate_category_id": category["id"], "candidate_crawl": crawl}, "ready"
