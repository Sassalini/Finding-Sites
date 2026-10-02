"""Pure normalization, metadata and conservative review heuristics. No stored page text."""
from __future__ import annotations

import ipaddress
import json
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit, unquote

import tldextract

# Bundled PSL snapshot: no surprise network request or shared home cache.
PSL = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None, include_psl_private_domains=True)
BLOCKED_DOMAINS = {
    "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
    "tiktok.com", "youtube.com", "yell.com", "yelp.com", "yelp.co.uk",
    "checkatrade.com", "trustatrader.com", "tripadvisor.com", "tripadvisor.co.uk",
}
PII = re.compile(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?\d[\s().-]*){8,}", re.I)


def normalize_url(value: str) -> str:
    value = value.strip()
    if not re.match(r"^[a-z][a-z\d+.-]*:", value, re.I):
        value = "https://" + value
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"http", "https"} or parsed.username or parsed.password:
        raise ValueError("Only public HTTP(S) URLs without credentials are allowed")
    host = (parsed.hostname or "").rstrip(".").encode("idna").decode("ascii").lower()
    if not host or "." not in host or host.endswith((".local", ".localhost", ".internal")):
        raise ValueError("Public hostname required")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError("IP address URLs are not website domains")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", host):
        raise ValueError("Invalid hostname")
    if any(not label or len(label) > 63 or label.startswith("-") or label.endswith("-") for label in host.split(".")):
        raise ValueError("Invalid hostname labels")
    port = parsed.port
    if port and port != (443 if parsed.scheme.lower() == "https" else 80):
        raise ValueError("Nonstandard ports are not supported")
    result = urlunsplit((parsed.scheme.lower(), host, parsed.path or "/", parsed.query, ""))
    if len(result) > 2048 or re.search(r"\s", result):
        raise ValueError("Invalid URL length or whitespace")
    return result


def registered_domain(value: str) -> str:
    host = urlsplit(normalize_url(value)).hostname
    result = PSL(host)
    if not result.domain or not result.suffix or result.is_private:
        raise ValueError("A public registered domain is required; hosted profiles are excluded")
    return result.top_domain_under_public_suffix


def homepage(value: str) -> str:
    parsed = urlsplit(normalize_url(value))
    return f"https://{parsed.hostname}/"


def safe_capture_url(value: str) -> str:
    parsed = urlsplit(normalize_url(value))
    # Queries and identifying URL paths are never retained in staging or logs.
    path = parsed.path if not PII.search(unquote(parsed.path)) else "/"
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def is_duplicate(domain: str, url: str, listings: list[dict]) -> bool:
    for listing in listings:
        for value in (listing.get("normalized_domain"), listing.get("url")):
            if value:
                try:
                    if registered_domain(value) == domain:
                        return True
                except ValueError:
                    continue
        if listing.get("url"):
            try:
                if normalize_url(listing["url"]) == normalize_url(url):
                    return True
            except ValueError:
                continue
    return False


def match_category(text: str, keywords: dict[str, list[str]], categories: list[dict]) -> tuple[str, float]:
    clean = re.sub(r"[^a-z0-9]+", " ", text.lower())
    compact = clean.replace(" ", "")
    scores = []
    for category in categories:
        hits = sum(bool(re.search(r"\b" + re.escape(re.sub(r"[^a-z0-9]+", " ", word.lower())) + r"\b", clean))
                   or (len(word) >= 5 and re.sub(r"[^a-z0-9]", "", word.lower()) in compact)
                   for word in keywords.get(category["name"], []))
        if hits:
            scores.append((hits, category["name"]))
    scores.sort(reverse=True)
    if not scores or (len(scores) > 1 and scores[0][0] == scores[1][0]):
        return "unclassified", 0.0
    return scores[0][1], 0.8 if scores[0][0] == 1 else 0.95


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.title = ""
        self.visible = []
        self.json_names = []
        self.structured_names = []
        self.in_title = False
        self.script = None
        self.script_text = ""
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta[(attrs.get("property") or attrs.get("name") or "").lower()] = attrs.get("content", "")
        if tag == "title":
            self.in_title = True
        if tag in {"script", "style"}:
            self.hidden += 1
        if tag == "script":
            self.script = attrs.get("type", "")
            self.script_text = ""

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "script":
            if self.script == "application/ld+json":
                try:
                    self.read_json(json.loads(self.script_text))
                except (ValueError, RecursionError):
                    pass
            self.script = None
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.script is not None:
            self.script_text += data
        elif not self.hidden:
            self.visible.append(data)

    def read_json(self, value, depth=0):
        if depth > 15:
            return
        if isinstance(value, list):
            for child in value:
                self.read_json(child, depth + 1)
        elif isinstance(value, dict):
            types = value.get("@type", [])
            types = [types] if isinstance(types, str) else types
            if isinstance(types, list) and any(kind in {"Organization", "LocalBusiness", "Corporation", "ProfessionalService", "Store", "Plumber", "Dentist", "MedicalOrganization"} for kind in types):
                if isinstance(value.get("name"), str):
                    self.json_names.append(value["name"])
            elif isinstance(types, list) and "WebSite" in types and isinstance(value.get("name"), str):
                self.structured_names.append(value["name"])
            for child in value.values():
                if isinstance(child, (dict, list)):
                    self.read_json(child, depth + 1)

    def name(self, domain):
        for value in [*self.json_names, self.meta.get("og:site_name"), *self.structured_names, self.meta.get("application-name"), self.title, domain]:
            if value:
                value = " ".join(value.split())
                if 2 <= len(value) <= 120 and not PII.search(value):
                    return value
        return domain


REJECTION_PATTERNS = {
    "parked_or_for_sale": ["domain is for sale", "domain for sale", "buy this domain", "this domain is parked", "sedo domain parking", "parkingcrew", "afternic"],
    "blocked_or_interstitial": ["just a moment", "verify you are human", "checking your browser", "access denied", "enable javascript and cookies", "security check", "deceptive site ahead", "malware detected"],
    "adult": ["porn", "xxx videos", "adult entertainment", "escort services"],
    "gambling": ["online casino", "sports betting", "online gambling", "slot games"],
    "spam_or_scam": ["guaranteed investment returns", "get rich quick", "buy backlinks", "link farm", "100% guaranteed profit"],
    "directory": ["business directory", "find local businesses", "directory of websites"],
}


def assess_html(html: str, domain: str, keywords: dict, categories: list, expected_category: str) -> dict:
    metadata = Metadata()
    metadata.feed(html)
    visible = " ".join(metadata.visible)
    signals = (metadata.title + " " + visible + " " + " ".join(metadata.meta.values())).lower()
    for reason, patterns in REJECTION_PATTERNS.items():
        if any(pattern in signals for pattern in patterns):
            return {"verification_status": "rejected", "rejection_reason": reason}
    if len(visible.strip()) < 40:
        return {"verification_status": "rejected", "rejection_reason": "insufficient_homepage_content"}
    name = metadata.name(domain)
    # Discovery URL keywords are not proof of what a business does today.
    # Classification uses live homepage evidence, never the domain fallback name.
    live_metadata = " ".join([*metadata.json_names, *metadata.structured_names, metadata.meta.get("og:site_name", ""), metadata.title])
    category, confidence = match_category(live_metadata + " " + visible, keywords, categories)
    if category != "unclassified" and category != expected_category:
        return {"verification_status": "rejected", "rejection_reason": "category_changed", "website_name": name,
                "suggested_category": category, "category_confidence": confidence}
    return {"verification_status": "ready_for_review", "rejection_reason": "", "website_name": name,
            "suggested_category": category, "category_confidence": confidence}
