import hashlib
import json
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy


class AucklandWhatsOnSpider(scrapy.Spider):
    """
    Crawl "things to do" (non-dated activities/attractions) from Heart of the City.

    Coverage:
      - /activities/**
      - /attractions/tourist-attractions/**
      - /auckland-nightlife/party-time/**
    """

    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    start_urls = [
        "https://heartofthecity.co.nz/activities",
        "https://heartofthecity.co.nz/activities/entertainment-activities",
        "https://heartofthecity.co.nz/activities/getting-active",
        "https://heartofthecity.co.nz/activities/lessons",
        "https://heartofthecity.co.nz/attractions/tourist-attractions",
        "https://heartofthecity.co.nz/auckland-nightlife/party-time",
    ]

    custom_settings = {
        "USER_AGENT": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
        "ROBOTSTXT_OBEY": True,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.4,
        "CONCURRENT_REQUESTS": 12,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.4,
        "AUTOTHROTTLE_MAX_DELAY": 6.0,
    }

    # hub families we allow
    PATH_PREFIXES = ("/activities/", "/attractions/", "/auckland-nightlife/")

    # 2nd path segment hubs (list pages)
    HUB_TAILS = {
        "entertainment-activities",
        "getting-active",
        "free-things-do",
        "lessons",
        "tourist-attractions",
        "party-time",
        "family-fun",
    }

    PRIMARY_CATS = {
        "entertainment-activities": "Entertainment",
        "getting-active": "Getting Active",
        "free-things-do": "Free Things To Do",
        "lessons": "Lessons",
        "tourist-attractions": "Attractions",
        "party-time": "Nightlife",
        "family-fun": "Family Fun",
    }

    # -------------------- helpers --------------------
    def _clean(self, s):
        if not s:
            return ""
        return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()

    def _hash_id(self, url):
        return hashlib.md5(url.encode("utf-8")).hexdigest()[:16]

    def _primary_category(self, url):
        parts = [p for p in urlparse(url).path.split("/") if p]
        if len(parts) >= 2 and parts[0] in ("activities", "attractions", "auckland-nightlife"):
            base = self.PRIMARY_CATS.get(parts[1])
            if base:
                return base
            if parts[0] == "attractions":
                return "Attractions"
            if parts[0] == "auckland-nightlife":
                return "Nightlife"
        return "Activities & Attractions"

    def _is_internal_content_url(self, url):
        u = urlparse(url)
        # internal only
        if u.scheme in ("mailto", "tel"):
            return False
        if u.netloc and not u.netloc.endswith("heartofthecity.co.nz"):
            return False
        if "ajax_form=" in u.query or "/search" in u.path:
            return False
        parts = [p for p in u.path.split("/") if p]
        if not parts:
            return False
        return f"/{parts[0]}/" in self.PATH_PREFIXES

    def _is_detail_path(self, url):
        """
        Treat anything with 3+ path segments under our families as a detail page.
        Examples that become True:
          /activities/entertainment-activities/great-escape
          /attractions/tourist-attractions/all-blacks-experience
          /auckland-nightlife/party-time/holey-moley-golf-club
        """
        u = urlparse(url)
        parts = [p for p in u.path.split("/") if p]
        if len(parts) < 3:
            return False
        last = parts[-1].lower()
        if last in {"search"}:
            return False
        # ignore pure pagination routes; querystring pagination is fine to follow as listing
        if re.match(r"^page-\d+$", last) or "page=" in u.query:
            return False
        return True

    def _extract_title(self, response):
        return self._clean(
            response.css("h1::text").get()
            or response.css("meta[property='og:title']::attr(content)").get()
            or response.css("title::text").get()
        )

    def _extract_address(self, response):
        bits = response.css('.address, [itemprop="address"], .field--name-field-address ::text').getall()
        if not bits:
            bits = response.xpath(
                "//article//*[contains(@class,'promotion__link') or contains(@class,'meta') or contains(@class,'node')]"
                "/descendant::text()[normalize-space()]"
            ).getall()
        text = self._clean(" ".join(bits)) or self._clean(" ".join(response.xpath("//article//text()[normalize-space()]").getall()))
        m = re.search(
            r"(\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^\n,]*,?\s*Auckland)\b",
            text, re.I
        )
        if m:
            return self._clean(m.group(1))
        m = re.search(
            r"(\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^\n,]*,\s*[A-Za-z\- ]{2,})",
            text
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
        # IMPORTANT: follow ALL hrefs (absolute OR relative), then filter internally
        for href in response.css("a[href]::attr(href)").getall():
            url = urljoin(response.url, href.split("#")[0])
            if not self._is_internal_content_url(url):
                continue
            if self._is_detail_path(url):
                yield response.follow(url, callback=self.parse_place, headers={"Referer": response.url})
            else:
                # keep exploring listings/category hubs & pagination
                yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

    def parse_place(self, response):
        # Prefer canonical for stable IDs/URLs
        canonical = response.css("link[rel='canonical']::attr(href)").get() or response.url
        url = urljoin(response.url, canonical).split("#")[0]

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
            "categories": (
                ["Activities & Attractions", primary_cat]
                if primary_cat != "Activities & Attractions" else [primary_cat]
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
        yield item
