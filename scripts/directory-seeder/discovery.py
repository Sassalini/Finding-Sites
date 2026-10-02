"""Bounded remote Parquet URL-index reads; never read WARC payloads."""
from __future__ import annotations

import logging
import re
import gzip
import io
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import duckdb

LOG = logging.getLogger("directory-seeder")
CRAWL_PATTERN = re.compile(r"CC-MAIN-\d{4}-\d{2}\Z")


def get_bytes(url, user_agent):
    with urlopen(Request(url, headers={"User-Agent": user_agent}), timeout=20) as response:
        data = response.read(4 * 1024 * 1024 + 1)
    if len(data) > 4 * 1024 * 1024:
        raise ValueError("Index metadata response exceeded size limit")
    return data


def index_files(crawl, user_agent):
    if not CRAWL_PATTERN.fullmatch(crawl):
        raise ValueError("Crawl must have the form CC-MAIN-YYYY-WW")
    prefix = f"cc-index/table/cc-main/warc/crawl={crawl}/subset=warc/"
    # Public bucket listing may require AWS credentials; use the small official
    # file manifest instead. This contains paths, never crawl page payloads.
    try:
        compressed = get_bytes(f"https://data.commoncrawl.org/crawl-data/{crawl}/cc-index-table.paths.gz", user_agent)
    except HTTPError as error:
        if error.code == 404:
            return []
        raise
    with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as manifest:
        data = manifest.read(4 * 1024 * 1024 + 1)
    if len(data) > 4 * 1024 * 1024:
        raise ValueError("Index file manifest exceeded size limit")
    return sorted("https://data.commoncrawl.org/" + path for path in data.decode("utf-8").splitlines()
                  if path.startswith(prefix) and path.endswith(".parquet") and ".." not in path)


def choose_crawl(override, user_agent):
    import json
    if override:
        files = index_files(override, user_agent)
        if not files:
            raise ValueError("No published Parquet URL index for selected crawl")
        return override, files
    crawls = json.loads(get_bytes("https://index.commoncrawl.org/collinfo.json", user_agent))
    # CDX can be released before the columnar index. Check actual Parquet availability.
    for crawl in sorted((item["id"] for item in crawls if CRAWL_PATTERN.fullmatch(item.get("id", ""))), reverse=True)[:5]:
        files = index_files(crawl, user_agent)
        if files:
            return crawl, files
    raise ValueError("No recent published Parquet URL index found; specify --crawl")


def candidate_sql(keywords, include_non_uk=False):
    if not keywords:
        raise ValueError("Category has no discovery keywords")
    # Parameterized values: category configuration cannot inject SQL.
    keyword_filter = " OR ".join("contains(lower(coalesce(url_host_name, '') || ' ' || coalesce(url_path, '')), ?)" for _ in keywords)
    uk_filter = "url_host_tld = 'uk'"
    if include_non_uk:
        uk_filter = "(" + uk_filter + " OR regexp_matches(lower(coalesce(url_path, '')), '/(uk|united-kingdom|great-britain)(/|$)'))"
    query = f"""
      SELECT url_host_registered_domain AS domain, min(url) AS capture_url
      FROM read_parquet(?, hive_partitioning=true)
      WHERE fetch_status = 200 AND content_mime_detected IN ('text/html', 'application/xhtml+xml')
        AND {uk_filter} AND ({keyword_filter})
        AND url_host_registered_domain IS NOT NULL
      GROUP BY url_host_registered_domain
      ORDER BY CASE WHEN ends_with(domain, '.uk') THEN 0 ELSE 1 END, domain
      LIMIT ?
    """
    return query, [word.lower() for word in keywords]


def shard_may_contain_uk(connection, file):
    # Read only the Parquet footer. URL-index shards are not all UK-containing,
    # so blindly reading the first few shards commonly produces no candidates.
    statistics = connection.execute("SELECT stats_min, stats_max FROM parquet_metadata(?) WHERE path_in_schema = 'url_host_tld'", [file]).fetchall()
    return not statistics or any(low is None or high is None or low <= "uk" <= high for low, high in statistics)


def discover(files, keywords, limit, max_files, include_non_uk=False, max_metadata_files=400):
    query, params = candidate_sql(keywords, include_non_uk)
    connection = duckdb.connect(config={"threads": 2, "memory_limit": "512MB"})
    try:
        connection.execute("INSTALL httpfs")
        connection.execute("LOAD httpfs")
        connection.execute("SET http_timeout=20")
        connection.execute("SET http_retries=1")
        seen = set()
        scanned, non_uk_files = 0, []
        for number, file in enumerate(files[:max_metadata_files], 1):
            LOG.info("Index footer %s/%s; data shards scanned %s; candidates %s", number, min(len(files), max_metadata_files), scanned, len(seen))
            if not shard_may_contain_uk(connection, file):
                if include_non_uk:
                    non_uk_files.append(file)
                continue
            scanned += 1
            for domain, capture in connection.execute(query, [file, *params, limit]).fetchall():
                if domain not in seen:
                    seen.add(domain)
                    yield domain, capture
                    if len(seen) >= limit:
                        return
            if scanned >= max_files:
                break
        # Optional wider-domain exploration uses any remaining data-shard budget,
        # after UK-containing shards have been preferred.
        if include_non_uk:
            for file in non_uk_files[:max(0, max_files - scanned)]:
                for domain, capture in connection.execute(query, [file, *params, limit]).fetchall():
                    if domain not in seen:
                        seen.add(domain)
                        yield domain, capture
                        if len(seen) >= limit:
                            return
        LOG.info("Stopped at index-file budget; this is a partial sample, not all matching domains")
    finally:
        connection.close()
