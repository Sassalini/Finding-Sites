import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import assess_html, is_duplicate, match_category, normalize_url, registered_domain, safe_capture_url
from discovery import candidate_sql, choose_crawl, index_files, shard_may_contain_uk
from live import MAX_BODY, public_addresses, verify
from seed import read_rows, run_import, write_rows
from store import SupabaseStore, prepare_import
import duckdb

CATEGORIES = [{"id": "category-home", "name": "Home & Garden"}, {"id": "category-web", "name": "Computers & Internet"}]
KEYWORDS = {"Home & Garden": ["plumbing", "boiler"], "Computers & Internet": ["web-design", "software"]}
HTML = b'<html><head><title>Example Plumbing</title><meta property="og:site_name" content="Example Plumbing"></head><body>Professional plumbing and boiler installation throughout the UK.</body></html>'


def candidate(**changes):
    return {"website_name": "Example Plumbing", "url": "https://example.co.uk/", "registered_domain": "example.co.uk",
            "suggested_category": "Home & Garden", "source_crawl": "CC-MAIN-2026-39", "verification_status": "ready_for_review",
            "approved": True, **changes}


class SeederTests(unittest.TestCase):
    def test_url_normalization(self):
        self.assertEqual(normalize_url(" HTTPS://WWW.Example.co.uk:443/#top "), "https://www.example.co.uk/")
        self.assertEqual(normalize_url("example.co.uk"), "https://example.co.uk/")
        self.assertEqual(normalize_url("https://bücher.de"), "https://xn--bcher-kva.de/")
        for value in ["ftp://example.co.uk", "https://user:pass@example.co.uk", "https://127.0.0.1", "https://foo.local", "https://example.com:8080", "https://-bad.co.uk"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_url(value)

    def test_registered_domain_and_private_suffixes(self):
        self.assertEqual(registered_domain("https://www.shop.example.co.uk/x"), "example.co.uk")
        self.assertEqual(registered_domain("WWW.example.org.uk."), "example.org.uk")
        self.assertEqual(registered_domain("https://a.example.ltd.uk"), "example.ltd.uk")
        with self.assertRaises(ValueError):
            registered_domain("person.github.io")

    def test_duplicate_existing_user_listing_protection(self):
        rows = [{"url": "http://shop.example.co.uk/products", "normalized_domain": "shop.example.co.uk", "owner_id": "real-user"}]
        self.assertTrue(is_duplicate("example.co.uk", "https://example.co.uk/", rows))
        payload, reason = prepare_import(candidate(), CATEGORIES, rows)
        self.assertIsNone(payload)
        self.assertEqual(reason, "duplicate_existing_listing")
        self.assertFalse(is_duplicate("other.co.uk", "https://other.co.uk/", rows))

    def test_category_matching_requires_existing_categories(self):
        self.assertEqual(match_category("Professional plumbing", KEYWORDS, CATEGORIES), ("Home & Garden", 0.8))
        self.assertEqual(match_category("plumbing software", KEYWORDS, CATEGORIES), ("unclassified", 0))
        self.assertEqual(match_category("plumbing", KEYWORDS, [CATEGORIES[1]]), ("unclassified", 0))

    def test_live_acceptance_and_name_priority(self):
        result = verify(candidate(), KEYWORDS, CATEGORIES, "TestSeeder", delay=0, fetch=lambda *_: (200, {"content-type": "text/html"}, HTML))
        self.assertEqual(result["website_name"], "Example Plumbing")
        self.assertEqual(result["verification_status"], "ready_for_review")
        self.assertFalse(result["approved"])
        html = HTML.decode().replace("</head>", '<script type="application/ld+json">{"@graph":[{"@type":"LocalBusiness","name":"Factual Business"}]}</script></head>')
        self.assertEqual(assess_html(html, "example.co.uk", KEYWORDS, CATEGORIES, "Home & Garden")["website_name"], "Factual Business")

    def test_dead_site_rejection(self):
        for fetch, reason in [(lambda *_: (404, {}, b""), "dead_or_http_error"), (Mock(side_effect=TimeoutError), "dead_or_unsafe_destination")]:
            result = verify(candidate(), KEYWORDS, CATEGORIES, "Test", delay=0, fetch=fetch)
            self.assertEqual(result["rejection_reason"], reason)

    def test_parked_and_blocked_and_unsafe_content(self):
        for text, reason in [("Buy this domain", "parked_or_for_sale"), ("Verify you are human", "blocked_or_interstitial"),
                             ("Online casino", "gambling"), ("Adult entertainment", "adult"), ("Buy backlinks", "spam_or_scam"),
                             ("Business directory", "directory")]:
            result = assess_html("<title>" + text + "</title>", "example.co.uk", KEYWORDS, CATEGORIES, "Home & Garden")
            self.assertEqual(result["rejection_reason"], reason)

    def test_site_changed_and_unclassified(self):
        changed = assess_html("<title>Software Ltd</title><body>We build software solutions for businesses across the UK.</body>", "example.co.uk", KEYWORDS, CATEGORIES, "Home & Garden")
        self.assertEqual(changed["rejection_reason"], "category_changed")
        unknown = assess_html("<title>Example Ltd</title><body>Our company offers practical services for customers in the UK.</body>", "example.co.uk", KEYWORDS, CATEGORIES, "Home & Garden")
        self.assertEqual(unknown["suggested_category"], "unclassified")
        self.assertEqual(assess_html("<body>Our company now offers something quite different to customers.</body>", "plumbing.co.uk", KEYWORDS, CATEGORIES, "Home & Garden")["suggested_category"], "unclassified")

    def test_redirect_and_fetch_limits(self):
        fetch = Mock(return_value=(302, {"location": "https://unrelated.co.uk/"}, b""))
        self.assertEqual(verify(candidate(), KEYWORDS, CATEGORIES, "Test", delay=0, fetch=fetch)["rejection_reason"], "domain_changed_or_insecure_redirect")
        self.assertEqual(fetch.call_count, 1)
        for status, headers, body, reason in [(403, {}, b"", "blocked_or_unavailable"), (200, {"content-type": "application/pdf"}, b"", "not_html"),
                                              (200, {"content-type": "text/html"}, b"x" * (MAX_BODY + 1), "homepage_too_large")]:
            fetch = Mock(return_value=(status, headers, body))
            self.assertEqual(verify(candidate(), KEYWORDS, CATEGORIES, "Test", delay=0, fetch=fetch)["rejection_reason"], reason)
            self.assertEqual(fetch.call_count, 1)

    def test_private_dns_and_profile_rejection(self):
        with patch("live.socket.getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]), self.assertRaises(ValueError):
            public_addresses("example.co.uk", 443)
        fetch = Mock()
        self.assertEqual(verify(candidate(url="https://facebook.com/person"), KEYWORDS, CATEGORIES, "Test", delay=0, fetch=fetch)["rejection_reason"], "social_profile_or_directory")
        fetch.assert_not_called()

    def test_no_contacts_or_page_text_in_output(self):
        html = HTML.decode().replace('content="Example Plumbing"', 'content="info@example.co.uk"')
        result = assess_html(html, "example.co.uk", KEYWORDS, CATEGORIES, "Home & Garden")
        self.assertNotIn("info@", json.dumps(result))
        self.assertEqual(safe_capture_url("https://example.co.uk/a?email=private@example.co.uk"), "https://example.co.uk/a")
        self.assertEqual(safe_capture_url("https://example.co.uk/private%40example.co.uk"), "https://example.co.uk/")

    def test_review_roundtrip_and_explicit_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            for suffix in ["csv", "json"]:
                path = Path(directory) / ("candidates." + suffix)
                write_rows(path, [candidate(approved=False)])
                row = read_rows(path)[0]
                self.assertEqual(prepare_import(row, CATEGORIES, [])[1], "not_approved")
                with self.assertRaises(FileExistsError):
                    write_rows(path, [])
        self.assertEqual(prepare_import(candidate(suggested_category="unclassified"), CATEGORIES, [])[1], "category_missing_or_unclassified")

    def test_seed_insert_uses_service_rpc_and_never_owner_or_billing(self):
        payload, reason = prepare_import(candidate(), CATEGORIES, [])
        self.assertEqual(reason, "ready")
        self.assertEqual(payload["candidate_category_id"], "category-home")
        self.assertNotIn("owner_id", payload)
        self.assertNotIn("contact_email", payload)
        with patch.dict("os.environ", {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "test-key"}):
            store = SupabaseStore()
        store.request = Mock(return_value="inserted")
        self.assertEqual(store.insert_seed(payload), "inserted")
        store.request.assert_called_once_with("rpc/import_seeded_listing", "POST", payload)

    def test_dry_run_and_duplicate_batch_do_not_write(self):
        from argparse import Namespace
        store = Mock()
        store.categories.return_value = CATEGORIES
        store.listings.return_value = []
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "review.json"
            write_rows(path, [candidate(), candidate()])
            args = Namespace(input=path, keywords=Path(__file__).resolve().parents[1] / "category_keywords.json", batch_size=20, commit=False, dry_run=False)
            with patch("seed.SupabaseStore", return_value=store):
                run_import(args)
        store.insert_seed.assert_not_called()

    def test_commit_rechecks_and_skips_dead_site(self):
        from argparse import Namespace
        store = Mock()
        store.categories.return_value = CATEGORIES
        store.listings.return_value = []
        store.insert_seed.return_value = "inserted"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "review.json"
            write_rows(path, [candidate()])
            args = Namespace(input=path, keywords=Path(__file__).resolve().parents[1] / "category_keywords.json", batch_size=20, commit=True,
                             dry_run=False, user_agent="Test", timeout=10, retries=0, delay=1)
            with patch("seed.SupabaseStore", return_value=store), patch("seed.verify", return_value=candidate(verification_status="rejected", rejection_reason="dead")):
                run_import(args)
            store.insert_seed.assert_not_called()
            with patch("seed.SupabaseStore", return_value=store), patch("seed.verify", return_value=candidate()):
                run_import(args)
            store.insert_seed.assert_called_once()

    def test_real_parquet_query_success_html_uk_and_dedup(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "index.parquet"
            connection = duckdb.connect()
            connection.execute("CREATE TABLE captures(url_host_registered_domain VARCHAR, url VARCHAR, url_host_name VARCHAR, url_path VARCHAR, url_host_tld VARCHAR, fetch_status INTEGER, content_mime_detected VARCHAR)")
            rows = [("example.co.uk", "https://example.co.uk/plumbing", "example.co.uk", "/plumbing", "uk", 200, "text/html"),
                    ("example.co.uk", "https://example.co.uk/boiler", "example.co.uk", "/boiler", "uk", 200, "text/html"),
                    ("dead.uk", "https://dead.uk/plumbing", "dead.uk", "/plumbing", "uk", 404, "text/html"),
                    ("example.com", "https://example.com/uk/plumbing", "example.com", "/uk/plumbing", "com", 200, "text/html")]
            connection.executemany("INSERT INTO captures VALUES (?,?,?,?,?,?,?)", rows)
            connection.execute("COPY captures TO ? (FORMAT PARQUET)", [str(path)])
            query, params = candidate_sql(["plumbing", "boiler"])
            self.assertEqual(len(connection.execute(query, [str(path), *params, 20]).fetchall()), 1)
            query, params = candidate_sql(["plumbing"], True)
            self.assertEqual(len(connection.execute(query, [str(path), *params, 20]).fetchall()), 2)
            self.assertTrue(shard_may_contain_uk(connection, str(path)))
            other = Path(directory) / "non-uk.parquet"
            connection.execute("COPY (SELECT * FROM captures WHERE url_host_tld='com') TO ? (FORMAT PARQUET)", [str(other)])
            self.assertFalse(shard_may_contain_uk(connection, str(other)))
            connection.close()

    def test_latest_crawl_checks_actual_parquet_availability(self):
        metadata = json.dumps([{"id": "CC-MAIN-2026-39"}, {"id": "CC-MAIN-2026-34"}]).encode()
        with patch("discovery.get_bytes", return_value=metadata), patch("discovery.index_files", side_effect=[[], ["a.parquet"]]):
            self.assertEqual(choose_crawl(None, "Test"), ("CC-MAIN-2026-34", ["a.parquet"]))

    def test_manifest_only_allows_selected_parquet_partition(self):
        import gzip
        prefix = "cc-index/table/cc-main/warc/crawl=CC-MAIN-2026-39/subset=warc/"
        manifest = gzip.compress((prefix + "part-01.parquet\n" + prefix + "../other.parquet\ncrawl-data/page.warc.gz\n").encode())
        with patch("discovery.get_bytes", return_value=manifest):
            self.assertEqual(index_files("CC-MAIN-2026-39", "Test"), ["https://data.commoncrawl.org/" + prefix + "part-01.parquet"])


if __name__ == "__main__":
    unittest.main()
