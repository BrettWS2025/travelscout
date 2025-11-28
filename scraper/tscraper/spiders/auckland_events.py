# -*- coding: utf-8 -*-
"""
AucklandNZ Events (events only)
Source listing: https://www.aucklandnz.com/events-hub and /events-hub/events
Parses event detail pages under /events-hub/events/<slug>

Outputs TravelScout-shaped records.
"""
import os
import re
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urljoin

import scrapy
from parsel import Selector

# IMPORTANT: use the package imports (avoid ModuleNotFoundError)
from tscraper.items import TravelScoutItem, make_id  # :contentReference[oaicite:0]{index=0}
from tscraper.utils import (  # :contentReference[oaicite:1]{index=1}
    filter_links,
    parse_date_range,  # :contentReference[oaicite:2]{index=2}
    parse_prices,      # :contentReference[oaicite:3]{index=3}
    clean,             # :contentReference[oaicite:4]{index=4}
)

AKL_BASE = "https://www.aucklandnz.com"
LISTING_URLS = [
    f"{AKL_BASE}/events-hub",
    f"{AKL_BASE}/events-hub/events",
]

MONTHS_RX = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"


class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["aucklandnz.com", "www.aucklandnz.com"]

    custom_settings = {
        # This site renders server-side; Playwright not required.
        # Keep default handlers from settings.py; do not rely on playwright_page.
        "ROBOTSTXT_OBEY": False,  # settings.py has True; site allows crawling and we’re respectful
        "DOWNLOAD_DELAY": 0.25,
    }

    def start_requests(self):
        for url in LISTING_URLS:
            yield scrapy.Request(
                url,
                callback=self.parse_listing,
                meta={
                    "playwright": False,   # ensure we don't expect playwright_page
                    "handle_httpstatus_all": True,
                },
                dont_filter=True,
            )

    # ---------- helpers ----------
    def _dbg_write(self, filename: str, content: str):
        """
        Write debug assets so your GitHub Action can upload them.
        We mirror the existing 'hotc_*' names AND add an 'akl_*' name.
        """
        debug_dir = Path("scraper/debug")
        debug_dir.mkdir(parents=True, exist_ok=True)
        # akl_*
        (debug_dir / filename.replace("hotc_", "akl_")).write_text(content, encoding="utf-8")
        # backward-compat with your current artifact list (hotc_*)
        (debug_dir / filename).write_text(content, encoding="utf-8")

    def _first_date_like(self, text: str) -> str | None:
        """
        Pull the first date-like fragment (e.g. '28 Nov - 21 Dec, 2025' or '14 Feb 2026 | 6:25 pm - 9:40 pm')
        """
        if not text:
            return None
        rx = re.compile(
            rf"\b\d{{1,2}}\s*{MONTHS_RX}\s*(?:\d{{4}})?(?:\s*[-–]\s*\d{{1,2}}\s*(?:{MONTHS_RX})?\s*,?\s*\d{{4}})?(?:\s*\|\s*\d{{1,2}}:\d{{2}}\s*(?:am|pm)?\s*[-–]\s*\d{{1,2}}:\d{{2}}\s*(?:am|pm)?)?",
            re.I,
        )
        m = rx.search(" ".join(text.split()))
        return m.group(0) if m else None

    def _absolute(self, base: str, href: str | None) -> str | None:
        if not href:
            return None
        return urljoin(base, href)

    # ---------- parsers ----------
    def parse_listing(self, response: scrapy.http.Response):
        if response.status != 200:
            self.logger.warning(f"[{self.name}] Non-200 on {response.url}: {response.status}")

        # Save listing HTML for debugging
        try:
            self._dbg_write("hotc_listing.html", response.text)
        except Exception as e:
            self.logger.debug(f"debug write failed: {e}")

        # Grab all anchors and filter for event detail pages
        hrefs = response.css("a::attr(href)").getall()
        event_links = filter_links(
            response.url,
            hrefs,
            allow_patterns=[r"^/events-hub/events/[^/?#]+$"],
            deny_patterns=[r"/events-hub/events/(categories|tags|news|search)"],
        )
        if not event_links:
            self.logger.info("No event links found on listing; following 'See all events' or paginated links if present.")
            # Follow 'See all events' if present
            see_all = response.css('a[href*="/events-hub/events"]::attr(href)').get()
            if see_all:
                yield response.follow(see_all, callback=self.parse_listing, dont_filter=True)

        # Pagination (querystring ?page=…)
        for p in filter_links(response.url, hrefs, allow_patterns=[r"[?&]page=\d+"], deny_patterns=[r"#"]):
            yield scrapy.Request(p, callback=self.parse_listing, dont_filter=True, meta={"playwright": False})

        # Dedup and visit
        for url in event_links:
            yield scrapy.Request(url, callback=self.parse_event, meta={"playwright": False})

    def parse_event(self, response: scrapy.http.Response):
        sel: Selector = response.selector

        # Debug copy of the detail page (one per page)
        try:
            slug = response.url.rstrip("/").split("/")[-1][:40]
            self._dbg_write(f"hotc_event_{slug}.html", response.text)
        except Exception:
            pass

        # --- title ---
        title = clean(" ".join(sel.css("h1::text").getall())) or sel.xpath(
            '//meta[@property="og:title"]/@content'
        ).get()
        if not title:
            self.logger.info(f"Skipping (no title) {response.url}")
            return

        # --- body/overview ---
        desc = clean(" ".join(sel.css(".field--name-body p ::text, .lg\\:w-3\\/5 p ::text, .rich-text p ::text").getall())) \
               or clean(sel.xpath("//meta[@name='description']/@content").get())

        # --- details text pool (for date/price/location heuristics) ---
        details_chunks = sel.css(
            ".sidebar ::text, .event-details ::text, .field--label-above ::text, .node--event ::text, .article ::text, main ::text"
        ).getall()
        details_text = clean(" ".join([t for t in details_chunks if t and t.strip()]))

        # --- dates ---
        date_hint = self._first_date_like(details_text)
        start_iso, end_iso = parse_date_range(date_hint) if date_hint else (None, None)

        # --- price ---
        price = parse_prices(details_text or "")
        # If explicit "Free event" appears, ensure flag
        if re.search(r"\bfree event\b", details_text or "", re.I):
            price["free"] = True
            if price.get("min") is None:
                price["min"] = 0.0

        # --- location ---
        # Prefer a short 'Place, City' chunk around "Location"
        loc_text = None
        m = re.search(r"Location\s*[:\-]?\s*([^\|]+?)(?:\|\s*|$)", details_text or "", re.I)
        if m:
            loc_text = clean(re.sub(r"(Map and directions).*", "", m.group(1), flags=re.I))
        # Fallback: any '..., Auckland' looking phrase
        if not loc_text:
            m2 = re.search(r"([A-Za-z0-9&'’\-\.\s]+,\s*Auckland[^\|]*)", details_text or "", re.I)
            loc_text = clean(m2.group(1)) if m2 else None

        location = {
            "name": None,
            "address": loc_text,
            "city": "Auckland",
            "region": "Auckland",  # IMPORTANT: override the schema default (Canterbury)
            "country": "New Zealand",
        }

        # --- images ---
        images = []
        ogimg = sel.xpath('//meta[@property="og:image"]/@content').get()
        if ogimg:
            images.append(self._absolute(response.url, ogimg))
        hero = sel.css("img[src*='/styles/'], img[srcset]::attr(src)").getall()
        for h in hero:
            absu = self._absolute(response.url, h)
            if absu and absu not in images:
                images.append(absu)

        # --- booking / external website (tickets, more info) ---
        booking_url = None
        for a in sel.css(
            "a[href*='ticket'], a[href*='book'], a[href*='eventbrite'], a[href*='ticketmaster'], a[rel='external']"
        ):
            href = a.attrib.get("href")
            if href and not href.startswith("#"):
                booking_url = self._absolute(response.url, href)
                break

        # --- categories/tags (best-effort) ---
        cats = [clean(x) for x in sel.css("a[href*='/events-hub/events?']::text, a[href*='/events-hub/events/categories/']::text").getall() if clean(x)]
        tags = []

        # --- embed text for ranking ---
        embed_text = " | ".join([t for t in [title, desc, location.get("address"), date_hint] if t])

        # --- build & yield ---
        item = TravelScoutItem(
            id=make_id(response.url),
            record_type="event",
            name=title,
            description=desc,
            categories=cats or ["Events"],
            tags=tags,
            url=response.url,
            source="aucklandnz.com",  # IMPORTANT: per-spider source
            images=[u for u in images if u],
            location=location,
            price=price,
            booking={"url": booking_url} if booking_url else {},
            event_dates={"start": start_iso, "end": end_iso, "timezone": "Pacific/Auckland"} if (start_iso or end_iso) else None,
            opening_hours=None,
            operating_months=None,
            data_collected_at=datetime.now(timezone.utc).isoformat(),
            text_for_embedding=embed_text,
        )

        # Feed exporter expects dicts; dataclass → dict
        yield item.to_dict()
