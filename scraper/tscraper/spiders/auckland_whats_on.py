# scraper/tscraper/spiders/auckland_whats_on.py
import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, urlunparse

import scrapy


class AucklandWhatsOnSpider(scrapy.Spider):
    """
    Heart of the City — What's On / Things to do (hub-only, robots-friendly)

    Emits ONLY:
      id, record_type, name, categories, url, source,
      location, price, opening_hours, operating_months, data_collected_at
    """

    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    # Hubs we can crawl safely with robots obeyed
    HUB_START_URLS = [
        "https://heartofthecity.co.nz/activities",
        "https://heartofthecity.co.nz/attractions/tourist-attractions",
        "https://heartofthecity.co.nz/auckland-nightlife/party-time",
    ]

    # Specific detail pages you want included even if we can't fetch them
    FORCE_SEED_DETAILS = [
        "https://heartofthecity.co.nz/auckland-nightlife/party-time/holey-moley-golf-club",
        "https://heartofthecity.co.nz/activities/entertainment-activities/cue-city",
        "https://heartofthecity.co.nz/activities/getting-active/auckland-adventure-jet",
    ]

    custom_settings = {
        "USER_AGENT": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_DELAY": 0.25,
        "CONCURRENT_REQUESTS": 16,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 16,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.4,
        "AUTOTHROTTLE_MAX_DELAY": 6.0,
        "DEPTH_LIMIT": 2,  # stick to hubs/pagination
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

    # -------------- helpers --------------
    @staticmethod
    def _clean(s: str | None) -> str:
        if not s:
            return ""
        s = re.sub(r"\s+", " ", s)
        return s.replace("\xa0", " ").strip()

    @staticmethod
    def _hash_id(url: str) -> str:
        return hashlib.md5(url.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def _normalize(url: str) -> str:
        u = urlparse(url)
        return urlunparse((u.scheme, u.netloc, u.path, "", "", ""))

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

    def _slug_title(self, url: str) -> str:
        slug = urlparse(url).path.strip("/").split("/")[-1]
        slug = re.sub(r"[-_]+", " ", slug)
        return slug.strip().title() if slug else "Untitled"

    def _emit_item(self, url: str, name: str | None, category_hint: str | None):
        norm = self._normalize(url)
        primary = category_hint or self._primary_category(norm)
        cats = (
            ["Activities & Attractions", primary]
            if primary != "Activities & Attractions"
            else [primary]
        )
        return {
            "id": self._hash_id(norm),
            "record_type": "place",
            "name": name or self._slug_title(norm),
            "categories": cats,
            "url": norm,
            "source": "heartofthecity.co.nz",
            "location": {
                "name": None,
                "address": None,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": {"currency": "NZD", "min": None, "max": None, "text": None, "free": False},
            "opening_hours": None,
            "operating_months": None,
            "data_collected_at": datetime.now(timezone.utc).isoformat(),
        }

    # -------------- crawl --------------
    def start_requests(self):
        # Yield hub pages
        for u in self.HUB_START_URLS:
            yield scrapy.Request(u, callback=self.parse_hub)

        # Emit synthetic items for forced details (no network hit needed)
        for u in self.FORCE_SEED_DETAILS:
            yield self._emit_item(u, self._slug_title(u), self._primary_category(u))

    def parse_hub(self, response: scrapy.http.Response):
        # Extract candidate cards/links to details, emit items straight from anchor text
        link_sets = [
            response.css(".view-content a[href^='/activities/']"),
            response.css(".view-content a[href^='/attractions/']"),
            response.css(".view-content a[href^='/auckland-nightlife/']"),
            response.css(".grid a[href^='/activities/'], .grid a[href^='/attractions/'], .grid a[href^='/auckland-nightlife/']"),
            # fallback to any on-page link in our families
            response.css("a[href^='/activities/'], a[href^='/attractions/'], a[href^='/auckland-nightlife/']"),
        ]

        seen = set()
        for selgroup in link_sets:
            for a in selgroup:
                href = (a.attrib.get("href") or "").split("#")[0]
                if not href:
                    continue
                abs_url = urljoin(response.url, href)

                # Only consider detail-ish paths (>= 3 segments)
                parts = [p for p in urlparse(abs_url).path.split("/") if p]
                if len(parts) < 3:
                    continue

                norm = self._normalize(abs_url)
                if norm in seen:
                    continue
                seen.add(norm)

                # Use the anchor's own text (or inner heading) as name; fallback to slug
                name = self._clean(a.xpath("normalize-space(.)").get())
                if not name:
                    name = self._clean(a.css("h2::text, h3::text, .title::text").get())
                yield self._emit_item(norm, name or None, self._primary_category(norm))

        # Paginate hubs (keep query strings for paging)
        for href in response.css("a[href*='?page=']::attr(href)").getall():
            yield response.follow(href.split("#")[0], callback=self.parse_hub)
