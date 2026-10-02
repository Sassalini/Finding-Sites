"""One bounded homepage fetch, serial by default, with validated and pinned public DNS."""
from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
import time
from urllib.parse import urljoin, urlsplit

from core import BLOCKED_DOMAINS, assess_html, homepage, normalize_url, registered_domain

MAX_BODY = 512 * 1024


def public_addresses(host: str, port: int) -> list[str]:
    addresses = list(dict.fromkeys(item[4][0] for item in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)))
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("Non-public DNS address")
    return addresses


def request_page(url: str, user_agent: str, timeout: float):
    parsed = urlsplit(normalize_url(url))
    if parsed.scheme != "https":
        raise ValueError("HTTPS is required for live verification")
    host = parsed.hostname
    addresses = public_addresses(host, 443)

    class PinnedHTTPS(http.client.HTTPSConnection):
        def connect(self):
            # TLS validates the original hostname; DNS cannot change the destination
            # after the public-address validation. No cookies, proxies or credentials.
            self.sock = socket.create_connection((addresses[0], 443), timeout=self.timeout)
            self.sock = self._context.wrap_socket(self.sock, server_hostname=host)

    connection = PinnedHTTPS(host, timeout=timeout, context=ssl.create_default_context())
    try:
        connection.request("GET", parsed.path or "/", headers={"User-Agent": user_agent, "Accept": "text/html,application/xhtml+xml", "Accept-Encoding": "identity"})
        response = connection.getresponse()
        headers = dict((key.lower(), value) for key, value in response.getheaders())
        body = response.read(MAX_BODY + 1) if 200 <= response.status < 300 else b""
        return response.status, headers, body
    finally:
        connection.close()


def verify(candidate: dict, keywords: dict, categories: list, user_agent: str,
           timeout=10.0, retries=0, delay=1.0, fetch=request_page) -> dict:
    row = dict(candidate)
    row.update(verification_status="rejected", rejection_reason="", live_http_status="", approved=False)
    try:
        domain = registered_domain(row["url"])
        if domain in BLOCKED_DOMAINS:
            row["rejection_reason"] = "social_profile_or_directory"
            return row
        current = homepage(row["url"])
        for redirect in range(4):
            for attempt in range(retries + 1):
                time.sleep(delay)
                try:
                    status, headers, body = fetch(current, user_agent, timeout)
                    break
                except (OSError, http.client.HTTPException):
                    if attempt == retries:
                        raise
            row["live_http_status"] = status
            if status in {301, 302, 303, 307, 308}:
                if redirect == 3 or not headers.get("location"):
                    row["rejection_reason"] = "redirect_limit"
                    return row
                target = normalize_url(urljoin(current, headers["location"]))
                if registered_domain(target) != domain or urlsplit(target).scheme != "https":
                    row["rejection_reason"] = "domain_changed_or_insecure_redirect"
                    return row
                parsed = urlsplit(target)
                if parsed.query or parsed.path not in {"", "/"}:
                    # Do not follow login/challenge/profile/location paths.
                    row["rejection_reason"] = "homepage_redirect_requires_review"
                    return row
                current = target
                continue
            if status in {401, 403, 429, 503}:
                row["rejection_reason"] = "blocked_or_unavailable"
                return row
            if not 200 <= status < 300:
                row["rejection_reason"] = "dead_or_http_error"
                return row
            if headers.get("content-type", "").split(";", 1)[0].strip().lower() not in {"text/html", "application/xhtml+xml"}:
                row["rejection_reason"] = "not_html"
                return row
            if len(body) > MAX_BODY:
                row["rejection_reason"] = "homepage_too_large"
                return row
            if headers.get("content-encoding", "identity").lower() != "identity":
                row["rejection_reason"] = "unsupported_content_encoding"
                return row
            # No homepage content, metadata descriptions, contacts or images saved.
            row.update(assess_html(body.decode("utf-8", errors="replace"), domain, keywords, categories, row["suggested_category"]))
            row["url"] = current
            return row
    except (ValueError, OSError, http.client.HTTPException):
        row["rejection_reason"] = "dead_or_unsafe_destination"
    return row
