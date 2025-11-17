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
      - /auckland-nightlife/party-time/** (optional nightlife hub)

    Output schema (one item per detail page):
      {
        "id": str,                       # stable hash of URL (16 hex chars)
        "record_type": "place",         
        "name": str,
        "description": str | None,
        "categories": [str],
        "tags": [str],
        "url": str,
        "source": "heartofthecity.co.nz",
        "images": [str],
        "location": {
            "name": str | None,
            "address": str | None,
            "city": "Auckland",
            "region": "Auckland",
            "country": "New Zealand",
            "latitude": None,
            "longitude": None,
        },
        "price": {
            "currency": "NZD",
            "min": float | None,
            "max": float | None,
            "text": str | None,
            "free": bool,
        },
        "booking": {"url": str | None, "email": str | None, "phone": str | None},
        "event_dates": None,
        "opening_hours": {"text": str | None},
        "operating_months": None,
        "data_collected_at": iso8601,
        "text_for_embedding": str,
      }
    """

    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz"]

    # Seed all the main hubs so we discover deeper listing pages
    start_urls = [
        "https://heartofthecity.co.nz/activities",
        "https://heartofthecity.co.nz/activities/entertainment-activities",
        "https://heartofthecity.co.nz/activities/getting-active",
        "https://heartofthecity.co.nz/activities/lessons",
        "https://heartofthecity.co.nz/attractions/tourist-attractions",
        "https://heartofthecity.co.nz/auckland-nightlife/party-time",
    ]

    # Hubs (2nd path segment) that are category list pages, not details
    HUB_TAILS = {
        "entertainment-activities",
        "getting-active",
        "free-things-do",
        "lessons",
        "tourist-attractions",
        "party-time",
        "family-fun",
    }

    PATH_PREFIXES = ("/activities/", "/attractions/", "/auckland-nightlife/")

    PRIMARY_CATS = {
        # activities sub-hubs
        "entertainment-activities": "Entertainment",
        "getting-active": "Getting Active",
        "free-things-do": "Free Things To Do",
        "lessons": "Lessons",
        # attractions sub-hub
        "tourist-attractions": "Attractions",
        # nightlife sub-hub
        "party-time": "Nightlife",
        "family-fun": "Family Fun",
    }

    # -------------------- helpers --------------------
    def _clean(self, s: str | None) -> str:
        if not s:
            return ""
        s = re.sub(r"\s+", " ", s)
        s = s.replace("\xa0", " ").strip()
        return s

    def _first(self, seq, default=None):
        for x in seq:
            if x:
                return x
        return default

    def _hash_id(self, url: str) -> str:
        return hashlib.md5(url.encode("utf-8")).hexdigest()[:16]

    def _primary_category(self, url: str) -> str:
        parts = [p for p in urlparse(url).path.split("/") if p]
        if len(parts) >= 3 and parts[0] in ("activities", "attractions", "auckland-nightlife"):
            base = self.PRIMARY_CATS.get(parts[1])
            if base:
                return base
            if parts[0] == "attractions":
                return "Attractions"
            if parts[0] == "auckland-nightlife":
                return "Nightlife"
        return "Activities & Attractions"

    def _is_internal_content_url(self, url: str) -> bool:
        u = urlparse(url)
        if u.netloc and not u.netloc.endswith("heartofthecity.co.nz"):
            return False
        if "ajax_form=" in u.query:
            return False
        if "/search" in u.path:
            return False
        parts = [p for p in u.path.split("/") if p]
        if not parts:
            return False
        if f"/{parts[0]}/" not in self.PATH_PREFIXES:
            return False
        return True

    def _is_detail_path(self, url: str) -> bool:
        parts = [p for p in urlparse(url).path.split("/") if p]
        # detail page looks like: /<hub>/<section>/<slug>
        return len(parts) >= 3 and parts[1] not in self.HUB_TAILS

    # ----- field extraction -----
    def _extract_title(self, response) -> str:
        return self._first([
            self._clean(response.css("h1::text").get()),
            self._clean(response.css("meta[property='og:title']::attr(content)").get()),
            self._clean(response.css("title::text").get()),
        ], "")

    def _extract_description(self, response) -> str | None:
        # Prefer meta description, otherwise first paragraph after the hero
        desc = self._first([
            self._clean(response.css("meta[name='description']::attr(content)").get()),
            self._clean(response.css("meta[property='og:description']::attr(content)").get()),
        ])
        if desc:
            return desc
        para = response.xpath("(//article//p[normalize-space()][1]//text())[position()<=10]").getall()
        para = self._clean(" ".join(para))
        return para or None

    def _extract_images(self, response) -> list[str]:
        imgs = set()
        for sel in response.css("meta[property='og:image']::attr(content), .node--type-article img::attr(src), article img::attr(src), .field--name-field-promo-image img::attr(src)"):
            src = sel.get()
            if not src:
                continue
            if src.startswith("data:"):
                continue
            imgs.add(urljoin(response.url, src))
        return list(imgs)[:12]

    def _extract_address(self, response) -> str | None:
        # Try common address containers
        candidates = []
        candidates += response.css('.address, [itemprop="address"], .field--name-field-address ::text').getall()
        # Fallback: header text near the title block often contains address & phone
        if not candidates:
            header_bits = response.xpath("//article//*[contains(@class,'promotion__link') or contains(@class,'meta') or contains(@class,'node')]/descendant::text()[normalize-space()] ").getall()
            candidates += header_bits
        # Clean and join
        text = self._clean(" ".join(candidates))
        if not text:
            # brute force: look for 'Street' patterns in entire article
            text = self._clean(" ".join(response.xpath("//article//text()[normalize-space()]").getall()))
        # Pull a reasonable address-like span (include commas and words)
        m = re.search(r"(\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^\n,]*,?\s*Auckland)\b", text, re.I)
        if m:
            return self._clean(m.group(1))
        # Sometimes address appears as "<Street>, <Suburb>" then city omitted
        m = re.search(r"(\d+\s+[A-Za-z][^,]+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Quay|Wharf|Square|Sq)[^\n,]*,\s*[A-Za-z\- ]{2,})", text)
        if m:
            return self._clean(m.group(1))
        return None

    def _extract_phone(self, response) -> str | None:
        text = self._clean(" ".join(response.xpath("//article//text()[normalize-space()]").getall()))
        # NZ landline or mobile
        m = re.search(r"\b0[2-9]\d{7,9}\b", text)
        if m:
            return m.group(0)
        # explicit tel links
        tel = response.css('a[href^="tel:"]::attr(href)').get()
        if tel:
            return tel.split(":", 1)[-1]
        return None

    def _extract_booking_url(self, response) -> str | None:
        # Prefer explicit Website/Book links
        for a in response.css("a[href]"):
            href = a.attrib.get("href", "")
            label = self._clean("".join(a.css("::text").getall())).lower()
            if href.startswith("mailto:") or href.startswith("tel:"):
                continue
            if any(key in label for key in ("website", "book", "tickets")):
                return urljoin(response.url, href)
        # Fallback to first external link
        for a in response.css("a[href]"):
            href = a.attrib.get("href", "")
            u = urlparse(href)
            if u.scheme and "heartofthecity.co.nz" not in u.netloc:
                return href
        return None

    def _extract_email(self, response) -> str | None:
        mail = response.css('a[href^="mailto:"]::attr(href)').get()
        if mail:
            return mail.split(":", 1)[-1]
        text = " ".join(response.xpath("//article//text()[normalize-space()]").getall())
        m = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
        return m.group(0) if m else None

    def _extract_hours_text(self, response) -> str | None:
        # Look for explicit office/opening hours widgets
        box = response.css('.office-hours, [class*="office-hours"], [class*="opening-hours"]')
        if not box:
            # Headings that read "Opening hours"
            box = response.xpath(
                "//h2[contains(translate(.,'OPENING','opening'),'opening') and contains(translate(.,'HOUR','hour'),'hour')]/following-sibling::*[1]"
            )
        if not box:
            return None
        lines = [
            self._clean(" ".join(x.xpath(".//text()").getall()))
            for x in box.css("li, p, div, span")
        ]
        lines = [l for l in lines if l and re.search(r"\d", l)]
        # drop nav noise
        lines = [l for l in lines if not re.search(r"Back to top|Open main menu|Close main menu", l, re.I)]
        if not lines:
            return None
        return "; ".join(dict.fromkeys(lines))[:600]

    def _extract_price(self, response) -> tuple[float | None, float | None, str | None, bool]:
        # Consolidate text under the article to avoid nav/footer noise
        block = self._clean(" ".join(response.xpath("//article//text()[normalize-space()]").getall()))
        # ignore parking and transport promos which often carry $ amounts
        block_wo_promos = re.sub(r"(?i)(parking|car ?park|public transport)[^$]{0,120}\$[0-9.,]+", "", block)
        amounts = [
            float(m.replace(",", ""))
            for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", block_wo_promos)
        ]
        amounts = [a for a in amounts if 0 <= a < 2000]
        min_price = min(amounts) if amounts else None
        max_price = max(amounts) if amounts else None
        # A simple free heuristic
        free = bool(re.search(r"\bfree\b", block, re.I)) and (min_price is None or min_price == 0)
        # Keep a short price snippet if we can find a concise sentence near a $
        snippet = None
        m = re.search(r"([^.!?]{0,120}\$[^.!?]{0,160})[.!?]", block_wo_promos)
        if m:
            snippet = self._clean(m.group(1))
        return min_price, max_price, snippet, free

    def _short_text_for_embedding(self, name: str, address: str | None, cat: str, desc: str | None) -> str:
        bits = [name]
        if address:
            bits.append(address)
        if cat:
            bits.append(cat)
        if desc:
            bits.append(desc)
        return " | ".join([self._clean(b) for b in bits if b])[:800]

    # -------------------- crawling --------------------
    def parse(self, response):
        # Follow internal content links within our three hub families
        for href in response.css('a[href^="/"]::attr(href)').getall():
            url = urljoin(response.url, href.split("#")[0])
            if not self._is_internal_content_url(url):
                continue
            if self._is_detail_path(url):
                yield response.follow(url, callback=self.parse_place, headers={"Referer": response.url})
            else:
                yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

    def parse_place(self, response):
        url = response.url.split("#")[0]
        title = self._extract_title(response)
        desc = self._extract_description(response)
        images = self._extract_images(response)
        address = self._extract_address(response)
        phone = self._extract_phone(response)
        email = self._extract_email(response)
        booking_url = self._extract_booking_url(response)
        hours_text = self._extract_hours_text(response)
        min_price, max_price, price_text, is_free = self._extract_price(response)
        primary_cat = self._primary_category(url)

        item = {
            "id": self._hash_id(url),
            "record_type": "place",
            "name": title,
            "description": desc,
            "categories": ["Activities & Attractions", primary_cat] if primary_cat != "Activities & Attractions" else [primary_cat],
            "tags": [],
            "url": url,
            "source": "heartofthecity.co.nz",
            "images": images,
            "location": {
                "name": title or None,
                "address": address,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": {
                "currency": "NZD",
                "min": min_price,
                "max": max_price,
                "text": price_text,
                "free": bool(is_free),
            },
            "booking": {
                "url": booking_url,
                "email": email,
                "phone": phone,
            },
            "event_dates": None,
            "opening_hours": {"text": hours_text} if hours_text else None,
            "operating_months": None,
            "data_collected_at": datetime.now(timezone.utc).isoformat(),
            "text_for_embedding": self._short_text_for_embedding(title, address, primary_cat, desc),
        }

        # A last pass to strip any accidental boilerplate/menus in description or price text
        for key in ("description",):
            if item.get(key):
                item[key] = re.sub(r"(?i)(back to top|open main menu|close main menu).*", "", item[key]).strip()

        yield item
