import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy


class AucklandWhatsOnSpider(scrapy.Spider):
    """
    Heart of the City — What's On / Things-to-do

    Coverage:
      - /activities/**/*
      - /attractions/**/*
      - /auckland-nightlife/**/*

    NOTE: We keep ROBOTSTXT_OBEY controlled by project settings (do not flip here).
    """

    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    # Seed hubs + a few high-value details to ensure coverage
    start_urls = [
        "https://heartofthecity.co.nz/activities",
        "https://heartofthecity.co.nz/activities/entertainment-activities",
        "https://heartofthecity.co.nz/activities/getting-active",
        "https://heartofthecity.co.nz/activities/lessons",
        "https://heartofthecity.co.nz/attractions/tourist-attractions",
        "https://heartofthecity.co.nz/auckland-nightlife/party-time",

        # manual detail seeds requested
        "https://heartofthecity.co.nz/auckland-nightlife/party-time/holey-moley-golf-club",
        "https://heartofthecity.co.nz/attractions/tourist-attractions/all-blacks-experience",
        "https://heartofthecity.co.nz/activities/entertainment-activities/great-escape",
        "https://heartofthecity.co.nz/attractions/tourist-attractions/skyjump",
        "https://heartofthecity.co.nz/attractions/tourist-attractions/skywalk",
        "https://heartofthecity.co.nz/activities/getting-active/auckland-adventure-jet",
        "https://heartofthecity.co.nz/activities/tourist-attractions/thrillzone",
    ]

    custom_settings = {
        # leave ROBOTSTXT_OBEY to project setting (do not override)
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
        # default feed path can be overridden with -O / -o
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
    def _clean(s):
        if not s:
            return ""
        s = re.sub(r"\s+", " ", s)
        return s.replace("\xa0", " ").strip()

    @staticmethod
    def _hash_id(url):
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

    def _is_allowed_family(self, url: str) -> bool:
        path = urlparse(url).path or ""
        return path.startswith(self.PATH_FAMILIES)

    def _is_detail_url(self, url: str) -> bool:
        """Detail pages have at least 3 path segments under our families."""
        parts = [p for p in urlparse(url).path.split("/") if p]
        if len(parts) < 3:
            return False
        if not self._is_allowed_family(url):
            return False
        tail = parts[-1].lower()
        if tail in {"page", "search"}:
            return False
        return True

    def _extract_title(self, response):
        return self._clean(
            response.css("h1::text").get()
            or response.css("meta[property='og:title']::attr(content)").get()
            or response.css("title::text").get()
        )

    def _extract_address(self, response):
        bits = response.css(
            '.address ::text, [itemprop="address"] ::text, '
            '.field--name-field-address ::text'
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
            text,
            re.I,
        )
        if m:
            return self._clean(m.group(1))
        m = re.search(
            r"(\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^,]*,\s*[A-Za-z\- ]{2,})",
            text,
        )
        return self._clean(m.group(1)) if m else None

    def _extract_hours_text(self, response):
        box = response.css('.office-hours, [class*="office-hours"], [class*="opening-hours"]')
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

    def _extract_price(self, response):
        block = self._clean(" ".join(response.xpath("//article//text()[normalize-space()]").getall()))
        block = re.sub(r"(?i)(parking|car ?park|public transport)[^$]{0,120}\$[0-9.,]+", "", block)
        amounts = [float(m.replace(",", "")) for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", block)]
        amounts = [a for a in amounts if 0 <= a < 2000]
        min_price = min(amounts) if amounts else None
        max_price = max(amounts) if amounts else None
        is_free = bool(re.search(r"\bfree\b", block, re.I)) and (min_price is None or min_price == 0)
        return {"currency": "NZD", "min": min_price, "max": max_price, "text": None, "free": bool(is_free)}

    # -------------------- crawling --------------------
    def parse(self, response):
        # Only look at our three families; ignore /auckland-events and others.
        for href in response.css(
            "a[href^='/activities/']::attr(href), "
            "a[href^='/attractions/']::attr(href), "
            "a[href^='/auckland-nightlife/']::attr(href)"
        ).getall():
            url = urljoin(response.url, href.split("#")[0])
            # strip query params for stability (pagination will be re-crawled anyway)
            u = urlparse(url)
            url = f"{u.scheme}://{u.netloc}{u.path}"
            if not self._is_allowed_family(url):
                continue
            if self._is_detail_url(url):
                yield response.follow(url, callback=self.parse_place, headers={"Referer": response.url})
            else:
                # keep crawling hubs/category pages
                yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

    def parse_place(self, response):
        url = response.url.split("#")[0]
        name = self._extract_title(response)
        if not name:
            return

        address = self._extract_address(response)
        hours_text = self._extract_hours_text(response)
        price = self._extract_price(response)
        primary_cat = self._primary_category(url)

        item = {
            "id": self._hash_id(url),
            "record_type": "place",
            "name": name,
            "description": None,   # (keeping payload smaller; you can add back if you want)
            "categories": (
                ["Activities & Attractions", primary_cat]
                if primary_cat != "Activities & Attractions" else [primary_cat]
            ),
            "tags": [],
            "url": url,
            "source": "heartofthecity.co.nz",
            "images": [],          # omit to reduce bandwidth; add back if you need
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
            "booking": {"url": None, "email": None, "phone": None},
            "event_dates": None,
            "opening_hours": {"text": hours_text} if hours_text else None,
            "operating_months": None,
            "data_collected_at": datetime.now(timezone.utc).isoformat(),
            "text_for_embedding": None,
        }
        yield item
