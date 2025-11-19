import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy


class AucklandWhatsOnSpider(scrapy.Spider):
    """
    Heart of the City — What's On / Things-to-do (LEAN FIELDS)

    Emits ONLY:
      id, record_type, name, categories, url, source,
      location, price, opening_hours, operating_months, data_collected_at
    """

    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    start_urls = [
        # Hubs (we’ll recurse through these)
        "https://heartofthecity.co.nz/activities",
        "https://heartofthecity.co.nz/activities/entertainment-activities",
        "https://heartofthecity.co.nz/activities/getting-active",
        "https://heartofthecity.co.nz/activities/lessons",
        "https://heartofthecity.co.nz/activities/tourist-attractions",
        "https://heartofthecity.co.nz/attractions/tourist-attractions",
    ]

    custom_settings = {
        "USER_AGENT": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
        "ROBOTSTXT_OBEY": True,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.5,
        "CONCURRENT_REQUESTS": 6,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.5,
        "AUTOTHROTTLE_MAX_DELAY": 6.0,
        # Write here by default (override with -O if you like)
        "FEEDS": {
            "things_to_do.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
    }

    # Families we allow
    PATH_PREFIXES = ("/activities/", "/attractions/")

    PRIMARY_CATS = {
        # activities sub-hubs
        "entertainment-activities": "Entertainment",
        "getting-active": "Getting Active",
        "free-things-do": "Free Things To Do",
        "lessons": "Lessons",
        "tourist-attractions": "Attractions",
        # attractions family always “Attractions”
        "__attractions__": "Attractions",
    }

    # -------------------- helpers --------------------
    def _clean(self, s):
        if not s:
            return ""
        s = re.sub(r"\s+", " ", s)
        return s.replace("\xa0", " ").strip()

    def _hash_id(self, url):
        return hashlib.md5(url.encode("utf-8")).hexdigest()[:16]

    def _primary_category(self, url):
        parts = [p for p in urlparse(url).path.split("/") if p]
        if len(parts) >= 2 and parts[0] in ("activities", "attractions"):
            if parts[0] == "attractions":
                return self.PRIMARY_CATS["__attractions__"]
            return self.PRIMARY_CATS.get(parts[1], "Activities & Attractions")
        return "Activities & Attractions"

    def _is_internal_content_url(self, url):
        u = urlparse(url)
        # same-site only
        if u.scheme and u.netloc and not u.netloc.endswith("heartofthecity.co.nz"):
            return False
        if "ajax_form=" in u.query or "/search" in u.path:
            return False
        if u.scheme in ("mailto", "tel"):
            return False
        parts = [p for p in u.path.split("/") if p]
        if not parts:
            return False
        if f"/{parts[0]}/" not in self.PATH_PREFIXES:
            return False
        return True

    def _is_detail_path(self, url):
        """
        Detail page heuristic (captures e.g.):
          /activities/getting-active/auckland-adventure-jet
          /activities/entertainment-activities/great-escape
          /attractions/tourist-attractions/skyjump
        """
        parts = [p for p in urlparse(url).path.split("/") if p]
        return len(parts) >= 3

    def _detail_page_guard(self, response):
        """
        Ensure we’re on a detail page, not a hub:
        require <article> with <h1> and one of:
        - 'Opening hours' section
        - a 'Website' link in the details area
        - 'Show on map'
        - 'Last updated'
        """
        if not response.xpath("//article//h1"):
            return False
        hints = response.xpath(
            "//article//*[contains(translate(.,'OPENING','opening'),'opening') and contains(translate(.,'HOUR','hour'),'hour')]"
            " | //article//*[contains(text(),'Website')]"
            " | //article//*[contains(text(),'Show on map')]"
            " | //article//*[contains(translate(.,'LAST UPDATED','last updated'),'last updated')]"
        )
        return bool(hints)

    def _extract_title(self, response):
        return self._clean(
            response.css("article h1::text").get()
            or response.css("h1::text").get()
            or response.css("meta[property='og:title']::attr(content)").get()
            or response.css("title::text").get()
        )

    def _extract_address(self, response):
        # Try common address containers first
        bits = response.css(
            ".address ::text, [itemprop='address'] ::text, .field--name-field-address ::text"
        ).getall()

        if not bits:
            # Many detail pages put address as a short line near the top, above Opening hours
            near = response.xpath(
                "(//article//h1/following::text()[normalize-space()])[position()<=20]"
            ).getall()
            bits = near

        text = self._clean(" ".join(bits))
        if not text:
            text = self._clean(" ".join(response.xpath("//article//text()[normalize-space()]").getall()))

        # Pull an address-like span
        m = re.search(
            r"(\b(?:Cnr|Corner)\b[^,]+,?\s*Auckland|\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^,]*,?\s*Auckland)",
            text,
            re.I,
        )
        if m:
            return self._clean(m.group(1))

        # relaxed fallback (Street + suburb)
        m = re.search(
            r"(\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^,]*,\s*[A-Za-z\- ]{2,})",
            text,
        )
        return self._clean(m.group(1)) if m else None

    def _extract_hours_text(self, response):
        # Opening hours heading then first container
        box = response.xpath(
            "//h2[contains(translate(.,'OPENING','opening'),'opening') and "
            "contains(translate(.,'HOUR','hour'),'hour')]/following-sibling::*[1]"
        )
        if not box:
            box = response.css('.office-hours, [class*="office-hours"], [class*="opening-hours"]')

        if not box:
            return None

        lines = []
        for node in box.css("li, p, div, span"):
            t = self._clean(" ".join(node.xpath(".//text()").getall()))
            if t and re.search(r"\d", t):
                lines.append(t)

        # drop nav noise
        lines = [l for l in lines if not re.search(r"Back to top|Open main menu|Close main menu", l, re.I)]
        return "; ".join(dict.fromkeys(lines))[:600] if lines else None

    def _extract_price(self, response):
        # Article-only to avoid header/footer promos
        block = self._clean(" ".join(response.xpath("//article//text()[normalize-space()]").getall()))
        # Ignore parking / transport promos with $ amounts
        block = re.sub(r"(?i)(parking|car ?park|public transport)[^$]{0,120}\$[0-9.,]+", "", block)
        amounts = [float(m.replace(",", "")) for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", block)]
        amounts = [a for a in amounts if 0 <= a < 2000]
        min_price = min(amounts) if amounts else None
        max_price = max(amounts) if amounts else None
        is_free = bool(re.search(r"\bfree\b", block, re.I)) and (min_price is None or min_price == 0)
        return {"currency": "NZD", "min": min_price, "max": max_price, "text": None, "free": bool(is_free)}

    # -------------------- crawling --------------------
    def parse(self, response):
        # Follow detail pages FIRST
        for href in response.css(
            'a[href^="/activities/"]::attr(href), a[href^="/attractions/"]::attr(href)'
        ).getall():
            url = urljoin(response.url, href.split("#")[0])

            if not self._is_internal_content_url(url):
                continue

            if self._is_detail_path(url):
                yield response.follow(url, callback=self.parse_place, headers={"Referer": response.url})
            else:
                # listing / hub
                yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

        # simple pagination on hubs
        for href in response.css('a[href*="?page="]::attr(href)').getall():
            url = urljoin(response.url, href.split("#")[0])
            if self._is_internal_content_url(url):
                yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

    def parse_place(self, response):
        # Extra HTML guard to avoid hub pages being emitted
        if not self._detail_page_guard(response):
            return

        url = response.url.split("#")[0]
        parts = [p for p in urlparse(url).path.split("/") if p]
        if len(parts) < 3:
            return  # belt & braces

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
