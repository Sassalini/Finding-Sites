#!/usr/bin/env python3
"""Finding Sites directory seeder. Discovery never writes to the database."""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from core import homepage, is_duplicate, registered_domain, safe_capture_url
from discovery import choose_crawl, discover
from live import verify
from store import SupabaseStore, prepare_import

LOG = logging.getLogger("directory-seeder")
ROOT = Path(__file__).resolve().parent
FIELDS = ["website_name", "url", "registered_domain", "suggested_category", "category_confidence",
          "live_http_status", "source_crawl", "common_crawl_url", "verification_status",
          "rejection_reason", "discovered_at", "approved"]


def read_rows(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as file:
        if Path(path).suffix.lower() == ".json":
            rows = json.load(file)
        else:
            rows = list(csv.DictReader(file))
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("Input must contain a list of candidate records")
    return rows


def write_rows(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Refuse to overwrite operator approval files accidentally.
    with path.open("x", encoding="utf-8", newline="") as file:
        if path.suffix.lower() == ".json":
            json.dump(rows, file, indent=2, ensure_ascii=False)
        else:
            writer = csv.DictWriter(file, fieldnames=FIELDS)
            writer.writeheader()
            for row in rows:
                safe = {key: value for key, value in row.items() if key in FIELDS}
                for key, value in safe.items():
                    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
                        safe[key] = "'" + value
                writer.writerow(safe)


def load_keywords(path):
    keywords = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(keywords, dict) or any(not isinstance(words, list) or not words or any(not isinstance(word, str) or not word.strip() for word in words) for words in keywords.values()):
        raise ValueError("Keyword configuration must map category names to nonempty keyword lists")
    return keywords


def database_or_snapshot(args):
    if args.categories_file:
        categories = read_rows(args.categories_file)
        listings = read_rows(args.existing_listings_file) if args.existing_listings_file else []
        LOG.warning("Offline category snapshot; database conflicts will be checked again on import")
        return categories, listings
    store = SupabaseStore()
    return store.categories(), store.listings()


def summary(rows):
    statuses = Counter(row["verification_status"] for row in rows)
    print(json.dumps({"Discovered": len(rows), "Live": sum(str(row.get("live_http_status", "")).startswith("2") for row in rows),
                      "Rejected": statuses["rejected"], "Duplicate existing listings": statuses["duplicate"],
                      "Ready for review": statuses["ready_for_review"]}, indent=2))


def run_discover(args):
    categories, listings = database_or_snapshot(args)
    keywords = load_keywords(args.keywords)
    selected = [category for category in categories if (args.all and category["name"] in keywords) or category["name"] == args.category]
    if not selected:
        raise ValueError("Choose an existing active category with configured keywords")
    if args.all:
        for category in categories:
            if category["name"] not in keywords:
                LOG.warning("Category has no configured keywords: %s", category["name"])
    crawl, files = choose_crawl(args.crawl, args.user_agent)
    LOG.info("Published crawl %s; %s index files available; scan budget %s per category", crawl, len(files), args.max_index_files)
    rows, seen = [], set()
    for category in selected:
        if category["name"] not in keywords:
            raise ValueError("Selected category needs discovery keywords")
        limit = args.limit if args.limit is not None else args.limit_per_category
        for domain, capture in discover(files, keywords[category["name"]], limit, args.max_index_files, args.include_non_uk, args.max_metadata_files):
            try:
                domain = registered_domain(domain)
                url = homepage(capture)
                if registered_domain(url) != domain or domain in seen:
                    continue
                seen.add(domain)
                row = {"website_name": domain, "url": url, "registered_domain": domain,
                       "suggested_category": category["name"], "category_confidence": 0.0,
                       "live_http_status": "", "source_crawl": crawl, "common_crawl_url": safe_capture_url(capture),
                       "verification_status": "", "rejection_reason": "",
                       "discovered_at": datetime.now(timezone.utc).isoformat(), "approved": False}
                if is_duplicate(domain, url, listings):
                    row.update(verification_status="duplicate", rejection_reason="duplicate_existing_listing")
                else:
                    row = verify(row, keywords, categories, args.user_agent, args.timeout, args.retries, args.delay)
                rows.append(row)
                LOG.info("%s: %s (%s)", domain, row["verification_status"], row["rejection_reason"] or row["suggested_category"])
            except ValueError:
                LOG.info("Rejected index candidate with invalid domain/URL")
    write_rows(args.output, rows)
    summary(rows)
    print(f"Dry run: review {args.output}; no database writes. All approvals start false.")


def run_import(args):
    store = SupabaseStore()
    categories, listings = store.categories(), list(store.listings())
    keywords = load_keywords(args.keywords)
    rows = read_rows(args.input)
    plans, reasons = [], Counter()
    # Validate the whole batch before making any writes.
    for row in rows:
        try:
            payload, reason = prepare_import(row, categories, listings)
        except (ValueError, KeyError, TypeError):
            payload, reason = None, "invalid_record"
        if payload:
            plans.append((row, payload))
            listings.append({"normalized_domain": payload["candidate_domain"], "url": payload["candidate_url"]})
        reasons[reason] += 1
    if len(plans) > args.batch_size:
        raise ValueError(f"Approved batch exceeds {args.batch_size} rows; split your review file or explicitly raise --batch-size (maximum 100)")
    print(json.dumps(dict(reasons), indent=2))
    if not args.commit or args.dry_run:
        for _, payload in plans:
            LOG.info("Would import %s into existing category %s", payload["candidate_domain"], payload["candidate_category_id"])
        print("Dry run: no database writes. Use --commit to import approved rows.")
        return
    outcomes = Counter()
    for row, payload in plans:
        fresh = verify(row, keywords, categories, args.user_agent, args.timeout, args.retries, args.delay)
        if fresh["verification_status"] != "ready_for_review" or fresh["url"] != payload["candidate_url"]:
            outcomes["rejected_on_reverification"] += 1
            LOG.info("%s: skipped after live recheck (%s)", payload["candidate_domain"], fresh["rejection_reason"] or "URL changed")
            continue
        # RPC revalidates active category and locks/checks domain conflicts atomically.
        result = store.insert_seed(payload)
        outcomes[result] += 1
        LOG.info("%s: %s", payload["candidate_domain"], result)
    print(json.dumps(dict(outcomes), indent=2))


def positive(value):
    parsed = int(value)
    if not 1 <= parsed <= 1000:
        raise argparse.ArgumentTypeError("Use a number from 1 to 1000")
    return parsed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    discovery = commands.add_parser("discover", help="Create an unapproved review file; never inserts")
    selection = discovery.add_mutually_exclusive_group(required=True)
    selection.add_argument("--category")
    selection.add_argument("--all", action="store_true")
    discovery.add_argument("--crawl")
    discovery.add_argument("--limit", type=positive)
    discovery.add_argument("--limit-per-category", type=positive, default=20)
    discovery.add_argument("--max-index-files", type=positive, default=20)
    discovery.add_argument("--max-metadata-files", type=positive, default=400, help="Maximum small Parquet footers examined per category")
    discovery.add_argument("--include-non-uk", action="store_true", help="Also consider domains with explicit UK URL path hints; manually verify UK relevance")
    discovery.add_argument("--categories-file", help="Offline JSON category snapshot with id/name fields")
    discovery.add_argument("--existing-listings-file", help="Optional offline duplicate snapshot")
    discovery.add_argument("--output", default="candidates.csv")
    importer = commands.add_parser("import", help="Validate reviewed candidates; dry-run by default")
    importer.add_argument("input")
    importer.add_argument("--commit", action="store_true")
    importer.add_argument("--batch-size", type=positive, default=20)
    for command in (discovery, importer):
        command.add_argument("--dry-run", action="store_true", help="Never write listings (default)")
        command.add_argument("--keywords", default=str(ROOT / "category_keywords.json"))
        command.add_argument("--user-agent", default=os.environ.get("SEEDER_USER_AGENT", "FindingSitesDirectorySeeder/1.0 (manual directory review)"))
        command.add_argument("--timeout", type=float, default=10)
        command.add_argument("--retries", type=int, choices=[0, 1], default=0)
        command.add_argument("--delay", type=float, default=1.0)
        command.add_argument("--log-file", default="seeder.log")
    args = parser.parse_args()
    if not 1 <= args.timeout <= 30 or args.delay < 0.5 or (args.command == "import" and args.batch_size > 100):
        parser.error("Timeout must be 1–30 seconds, delay at least 0.5 seconds, import batch at most 100")
    if "\n" in args.user_agent or "\r" in args.user_agent or not args.user_agent.strip():
        parser.error("Use a nonempty single-line identifiable User-Agent")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=[logging.StreamHandler(), logging.FileHandler(args.log_file, encoding="utf-8")])
    try:
        run_discover(args) if args.command == "discover" else run_import(args)
    except (ValueError, OSError, RuntimeError, duckdb_error()) as error:
        # Avoid printing arbitrary network/database exception text.
        if isinstance(error, ValueError):
            LOG.error("%s", error)
        else:
            LOG.error("Operation failed (%s). No automatic write retries; consult README and re-run the dry run.", type(error).__name__)
        return 1
    return 0


def duckdb_error():
    import duckdb
    return duckdb.Error


if __name__ == "__main__":
    sys.exit(main())
