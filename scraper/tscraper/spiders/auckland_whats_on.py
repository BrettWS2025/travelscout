import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, urlunparse

import scrapy


class AucklandWhatsOnSpider(scrapy.Spider):
    """
    Heart of the City — What's On / Things to do (lean fields)

    Crawls (robots-respecting):
      - /activities/**
      - /attractions/**
      - /auckland-nightlife/**

    Emits ONLY:
      id, record_type, name, categories, url, source,
      location, price, opening_hours, operating_months, data_collected_at
    """

    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    # Focus hub + force-seeded details you asked for
    start_urls = [
        "https://heartofthecity.co.nz/activities",
        "https://heartofthecity.co.nz/auckland-nightlife/party-time/holey-moley-golf-club",
        "https://heartofthecity.co.nz/activities/entertainment-activities/cue-city",
        "https://heartofthecity.co.nz/activities/getting-active/auckland-adventure-jet",
    ]

    # We DO NOT flip ROBOTSTXT_OBEY here; project default is respected.
    custom_settings = {
        "USER_AGENT": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
        "DOWNLOAD_DELAY": 0.25,
        "CONCURRENT_REQUESTS": 16,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 16,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.4,
        "AUTOTHROTTLE_MAX_DELAY": 6.0,
        # Default output; override with -O/-o as needed
        "FEEDS": {
            "data/Things_to_do.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
    }

    PATH_FAMILIES = ("/activities/", "/attractions/", "/auckland-nightlife/")

    # -------------------- helpers --------------------
    @staticmethod
    def _clean(s: str | None) -> str:
        if not s:
            return ""
        s = re.sub(r"\s+", " ", s)
        return s.replace("\xa0", " ").strip()

    @staticmethod
    def _hash_id(url: str) -> str:
        return hashlib.md5(url.encode("utf-8")).hexdigest()[:16]

    def _primary_category(self, url: str) -> str:
        parts = [p for p in urlparse(url).path.split("/") if p]
        if not parts:
            return "Activities & Attractions"
        root = parts[0]
        if root == "attractions":
            return "Attractions"
        if root == "auckland-nightlife":
            return "Nightlife"
        return "Activities & Attractions"

    def _normalize_no_query(self, url: str) -> str:
        u = urlparse(url)
        return urlunparse((u.scheme, u.netloc, u.path, "", "", ""))

    def _is_allowed_family(self, url: str) -> bool:
        path = urlparse(url).path or ""
        return path.startswith(self.PATH_FAMILIES)

    def _is_detail_url(self, url: str) -> bool:
        """Allowed-family URL with ≥3 segments (e.g. /activities/getting-active/slug)."""
        if not self._is_allowed_family(url):
            return False
        parts = [p for p in urlparse(url).path.split("/") if p]
        if len(parts) < 3:
            return False
        tail = parts[-1].lower()
        return tail not in {"page", "search"}

    # -------------------- field extraction --------------------
    def _extract_title(self, response) -> str:
        return self._clean(
            response.css("h1::text").get()
            or response.css("meta[property='og:title']::attr(content)").get()
            or response.css("title::text").get()
        )

    def _extract_address(self, response) -> str | None:
        bits = response.css(
            ".address ::text, [itemprop='address'] ::text, .field--name-field-address ::text"
        ).getall()
        if not bits:
            bits = response.xpath(
                "//article//*[contains(@class,'promotion__link') or contains(@class,'meta') or contains(@class,'node')]"
                "/descendant::text()[normalize-space()]"
            ).getall()
        text = self._clean(" ".join(bits)) or self._clean(
            " ".join(response.xpath("//article//text()[normalize-space()]").getall())
        )
        m = re.search(
            r"(\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^,]*,?\s*Auckland)\b",
            text, re.I
        )
        if m:
            return self._clean(m.group(1))
        m = re.search(
            r"(\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^,]*,\s*[A-Za-z\- ]{2,})",
            text
        )
        return self._clean(m.group(1)) if m else None

    def _extract_hours_text(self, response) -> str | None:
        box = response.css(".office-hours, [class*='office-hours'], [class*='opening-hours']")
        if not box:
            box = response.xpath(
                "//h2[contains(translate(.,'OPENING','opening'),'opening') and "
                "contains(translate(.,'HOUR','hour'),'hour')]/following-sibling::*[1]"
            )
        if not box:
            return None
        lines = [self._clean(" ".join(x.xpath(".//text()").getall())) for x in box.css("li, p, div, span")]
        lines = [l for l in lines if l and re.search(r"\d", l)]
        lines = [l for l in lines if not re.search(r"Back to top|Open main menu|Close main menu", l, re.I)]
        return "; ".join(dict.fromkeys(lines))[:600] if lines else None

    def _extract_price(self, response) -> dict:
        block = self._clean(" ".join(response.xpath("//article//text()[normalize-space()]").getall()))
        block = re.sub(r"(?i)(parking|car ?park|public transport|kids ride free)[^$]{0,120}\$[0-9.,]+", "", block)
        amounts = [float(m.replace(",", "")) for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", block)]
        amounts = [a for a in amounts if 0 <= a < 2000]
        is_free = bool(re.search(r"\bfree\b", block, re.I)) and (not amounts or min(amounts) == 0)
        return {
            "currency": "NZD",
            "min": min(amounts) if amounts else None,
            "max": max(amounts) if amounts else None,
            "text": None,
            "free": bool(is_free),
        }

    # -------------------- crawling --------------------
    def parse(self, response):
        # If current page is a detail page, emit it.
        if self._is_detail_url(self._normalize_no_query(response.url)):
            # yield-from so Scrapy receives the item this function yields
            yield from self.parse_place(response)

        # Explore only allowed families; keep query for hub pagination (strip later on detail)
        link_sel = (
            "a[href*='/activities/']::attr(href), "
            "a[href*='/attractions/']::attr(href), "
            "a[href*='/auckland-nightlife/']::attr(href)"
        )
        for href in response.css(link_sel).getall():
            abs_url = urljoin(response.url, href.split("#")[0])
            norm = self._normalize_no_query(abs_url)
            if not self._is_allowed_family(abs_url):
                continue
            if self._is_detail_url(norm):
                # detail: strip query/frag to avoid dupes
                yield scrapy.Request(norm, callback=self.parse_place, headers={"Referer": response.url})
            else:
                # hub/pagination: follow as-is (query kept)
                yield scrapy.Request(abs_url, callback=self.parse, headers={"Referer": response.url})

    def parse_place(self, response):
        url = self._normalize_no_query(response.url)
        name = self._extract_title(response)
        if not name:
            return

        address = self._extract_address(response)
        hours_text = self._extract_hours_text(response)
        price = self._extract_price(response)
        primary_cat = self._primary_category(url)

        yield {
            "id": self._hash_id(url),
            "record_type": "place",
            "name": name,
            "categories": (
                ["Activities & Attractions", primary_cat]
                if primary_cat != "Activities & Attractions"
                else [primary_cat]
            ),
            "url": url,
            "source": "heartofthecity.co.nz",
            "location": {
                "name": None,
                "address": address,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": price,
            "opening_hours": {"text": hours_text} if hours_text else None,
            "operating_months": None,
            "data_collected_at": datetime.now(timezone.utc).isoformat(),
        }
