import re
import json
from pathlib import Path
from datetime import datetime
from urllib.parse import urljoin

import pytz
import scrapy
from scrapy.selector import Selector
from scrapy.http import Request
from scrapy_playwright.page import PageMethod


PACIFIC_AUCKLAND = pytz.timezone("Pacific/Auckland")


def _clean(s: str | None) -> str | None:
    if not s:
        return None
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def _extract_price_block(sel: Selector) -> str | None:
    """
    Grab the short 'header' meta block that contains the date, price and venue.
    This avoids pulling numbers from the whole page (e.g., years or distances).
    Heuristic:
      - Take the first textual block after the H1 up to the 'Location' heading
        or the next section heading.
    """
    # Everything inside <main> tends to be well-structured; fall back to body.
    txt_nodes = sel.css("main *::text, body *::text").getall()
    if not txt_nodes:
        return None
    text = " ".join([t.strip() for t in txt_nodes if t.strip()])
    # Reduce to the area between title and the "Location" heading if present.
    # This header block usually includes "date • price • venue".
    m = re.search(r"Location\s+Te\s+wāhi", text, flags=re.I)
    header = text[: m.start()] if m else text[:2000]
    # Find a short fragment that contains a currency string.
    hit = re.search(
        r"(?:NZ\$|\$)\s*\d[\d,]*(?:\.\d{1,2})?(?:\s*[-–]\s*(?:NZ\$|\$)?\s*\d[\d,]*(?:\.\d{1,2})?)?(?:\s*\+\s*BF)?",
        header,
        flags=re.I,
    )
    if hit:
        return _clean(hit.group(0))
    # Special cases: free/koha pricing
    hit2 = re.search(r"\b(Free(?:\s+entry)?|Koha)\b", header, flags=re.I)
    if hit2:
        return _clean(hit2.group(0))
    return None


def _normalize_price(price_text: str | None) -> dict | None:
    """
    Return a structured price dict suitable for a DB column, e.g.:
    {"currency":"NZD","min":40.0,"max":70.0,"text":"NZ$40.00 - NZ$70.00 + BF","free":False}
    We ONLY parse amounts adjacent to a currency symbol, to avoid picking up years like 2025.
    """
    if not price_text:
        return None

    text = price_text.strip()
    text_upper = text.upper()

    # Normalize currency
    currency = "NZD"

    # Free/Koha
    if "FREE" in text_upper or "KOHA" in text_upper:
        return {"currency": currency, "min": 0.0, "max": 0.0, "text": text, "free": True}

    # Extract only amounts with explicit currency symbol nearby
    amounts = []
    for m in re.finditer(r"(?:NZ\$|\$)\s*([\d,]+(?:\.\d{1,2})?)", text):
        amt = float(m.group(1).replace(",", ""))
        amounts.append(amt)

    if not amounts:
        # If there's literally no amount near a currency symbol, keep text only.
        return {"currency": currency, "min": None, "max": None, "text": text, "free": False}

    return {
        "currency": currency,
        "min": min(amounts),
        "max": max(amounts),
        "text": text,
        "free": False,
    }


_MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "SEPT": 9, "OCT": 10, "NOV": 11, "DEC": 12
}

def _parse_nz_date_token(s: str) -> datetime | None:
    """
    Parse tokens like '28 Nov 2025', '5 December 2025', 'Dec 5 2025', etc.
    Time is omitted on the header line; set to 00:00 local.
    """
    s = s.strip().replace(",", "")
    # e.g. 28 Nov 2025
    m = re.match(r"(?i)\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\b", s)
    if not m:
        # e.g. December 5 2025
        m = re.match(r"(?i)\b([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})\b", s)
        if not m:
            return None
        mon_str, day, year = m.group(1), int(m.group(2)), int(m.group(3))
    else:
        day, mon_str, year = int(m.group(1)), m.group(2), int(m.group(3))

    mon = _MONTHS.get(mon_str[:3].upper())
    if not mon:
        return None
    try:
        dt = datetime(year, mon, day, 0, 0)
        return PACIFIC_AUCKLAND.localize(dt)
    except ValueError:
        return None


def _extract_header_date_range(sel: Selector) -> tuple[datetime | None, datetime | None]:
    """
    Pull the 'XX Mon YYYY' (or range) from the header line just under the title.
    Examples:
      '28 Nov 2025'
      '13 Dec 2025 – 24 Dec 2025'
      '5 December 2025 - 8 December 2025'
    """
    # Search for the first short line with a 4-digit year near the top of the page.
    # Capturing a compact block around the H1 keeps us away from "Dates & Times" rows.
    h1_text = _clean(sel.css("h1::text").get())
    main_texts = sel.css("main *::text, body *::text").getall()
    joined = " ".join(t.strip() for t in main_texts if t.strip())

    if not joined:
        return (None, None)

    # Take a window right after title occurrence if present
    start_idx = joined.find(h1_text) if h1_text and h1_text in joined else 0
    window = joined[start_idx:start_idx + 800]  # small window near the top

    # Try to capture a 'date — date' or single date
    # Use various separators: -, –, —, to
    pat = (
        r"(?i)\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b"
        r"(?:\s*(?:–|-|—|to)\s*\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b)?"
    )
    m = re.search(pat, window)
    if not m:
        # swap order variant: 'December 5 2025'
        pat2 = (
            r"(?i)\b([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})\b"
            r"(?:\s*(?:–|-|—|to)\s*\b([A-Za-z]{3,9}\s+\d{1,2}\s+\d{4})\b)?"
        )
        m = re.search(pat2, window)

    if not m:
        return (None, None)

    start_txt, end_txt = m.group(1), m.group(2)
    start_dt = _parse_nz_date_token(start_txt) if start_txt else None
    end_dt = _parse_nz_date_token(end_txt) if end_txt else start_dt
    return (start_dt, end_dt)


def _stable_id(url: str) -> str:
    """
    16-char hex-like stable id based on URL path.
    (Simple, deterministic; avoids depending on repo-local helpers.)
    """
    import hashlib
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()
    return h[:16]


class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["www.aucklandnz.com", "aucklandnz.com"]

    # Add strong debugging just for this spider
    custom_settings = {
        "LOG_LEVEL": "INFO",
        "HTTPCACHE_ENABLED": True,
        "DOWNLOAD_DELAY": 0.25,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.25,
        "AUTOTHROTTLE_MAX_DELAY": 4,
        "AUTOTHROTTLE_TARGET_CONCURRENCY": 8.0,
        # scrapy-playwright must be installed & enabled as in your settings.py
    }

    # Listing pages we want to render, plus manual seeds for known event pages.
    listing_urls = [
        "https://www.aucklandnz.com/events-hub",
        "https://www.aucklandnz.com/events-hub/events",
    ]
    manual_seed_paths = [
        "/pasifika",  # festival landing that behaves like an event
        # add more known event slugs if needed
    ]

    def start_requests(self):
        # Ensure debug dir exists (for artifact uploads in CI)
        Path("scraper/debug").mkdir(parents=True, exist_ok=True)

        # Render listing pages with Playwright and gently scroll
        page_methods = [
            PageMethod("wait_for_load_state", "domcontentloaded"),
            PageMethod("wait_for_selector", 'a[href^="/events-hub/events/"]', timeout=15000),
            # small progressive scroll to trigger lazy inserts
            PageMethod(
                "evaluate",
                "(async () => { let last = 0; for (let i=0;i<12;i++){ "
                "window.scrollBy(0, document.body.scrollHeight); "
                "await new Promise(r=>setTimeout(r, 500)); "
                "const sh = document.body.scrollHeight; if (sh === last) break; last = sh; } })()",
            ),
        ]

        for url in self.listing_urls:
            yield Request(
                url,
                callback=self.parse_listing,
                errback=self.errback,
                meta={
                    "playwright": True,
                    "playwright_include_page": True,  # <-- fixes the KeyError
                    "playwright_page_methods": page_methods,
                },
            )

        # Include manual seeds (no need to render heavy JS for detail pages;
        # but we still play it safe and render the H1)
        for p in self.manual_seed_paths:
            full = urljoin("https://www.aucklandnz.com/", p.lstrip("/"))
            yield Request(
                full,
                callback=self.parse_event,
                errback=self.errback,
                meta={
                    "playwright": True,
                    "playwright_page_methods": [PageMethod("wait_for_selector", "h1", timeout=15000)],
                },
            )

    async def parse_listing(self, response: scrapy.http.HtmlResponse):
        page = response.meta.get("playwright_page")
        # Keep a screenshot + the DOM we actually used to extract links
        if page:
            try:
                await page.screenshot(path="scraper/debug/akl_listing.png", full_page=True)
                html = await page.content()
                with open("scraper/debug/akl_listing.html", "w", encoding="utf-8") as f:
                    f.write(html)
                sel = Selector(text=html)
            except Exception as e:
                self.logger.warning("Could not snapshot listing: %r", e)
                sel = response.selector
        else:
            sel = response.selector

        # Collect event detail links
        hrefs = set()

        # Standard event detail pages
        for href in sel.css('a[href^="/events-hub/events/"]::attr(href)').getall():
            if re.match(r"^/events-hub/events/[^/?#]+$", href):
                hrefs.add(href)

        # Some marquee events live outside the /events-hub/ path (e.g., /pasifika)
        for href in sel.css('a[href^="/pasifika"]::attr(href)').getall():
            if re.match(r"^/pasifika(?:/.*)?$", href):
                hrefs.add(href)

        # Write link list for CI debugging
        link_list_path = Path("scraper/debug/akl_links.txt")
        link_list_path.write_text("\n".join(sorted(hrefs)), encoding="utf-8")
        self.logger.info("Found %d event links on listing pages", len(hrefs))

        for href in sorted(hrefs):
            url = urljoin("https://www.aucklandnz.com", href)
            yield Request(
                url,
                callback=self.parse_event,
                errback=self.errback,
                meta={
                    "playwright": True,
                    "playwright_page_methods": [PageMethod("wait_for_selector", "h1", timeout=15000)],
                },
            )

    async def parse_event(self, response: scrapy.http.HtmlResponse):
        """
        Parse a single event page. We try to:
          - get the title
          - get a header date range (single or range)
          - get a reliable price line
          - capture venue & tickets/website URLs when present
        """
        page = response.meta.get("playwright_page")
        if page:
            try:
                html = await page.content()
            except Exception:
                html = response.text
        else:
            html = response.text

        sel = Selector(text=html)
        url = response.url
        title = _clean(sel.css("h1::text").get())

        # Dates (header range under title)
        start_dt, end_dt = _extract_header_date_range(sel)

        # Price (header price line only)
        price_text = _extract_price_block(sel)
        price = _normalize_price(price_text)

        # Venue (first link after the header metadata often is the venue)
        venue = None
        # Try common patterns
        venue = sel.xpath(
            '//*[contains(translate(.,"LOCATION","location"),"location")]/following::a[1]/text()'
        ).get() or sel.xpath('//a[contains(@href, "/venues/")][1]/text()').get()
        venue = _clean(venue)

        # Tickets / external website
        def _first_href_with_text(patterns: list[str]) -> str | None:
            xp = " | ".join([f'//a[contains(translate(.,"{p.upper()}","{p.lower()}"),"{p.lower()}")]/@href' for p in patterns])
            href = sel.xpath(xp).get()
            return urljoin(url, href) if href else None

        tickets_url = _first_href_with_text(["purchase tickets", "buy tickets", "tickets"])
        website_url = _first_href_with_text(["visit website", "website"])

        # Categories (breadcrumbs like "Performing Arts • Dance • Ballet • Central Auckland")
        crumbs = [
            _clean(t)
            for t in sel.css("nav a::text, .breadcrumb a::text, .breadcrumbs a::text").getall()
            if _clean(t)
        ]
        categories = [c for c in crumbs if c and c.lower() not in {title.lower() if title else ""}]

        # Fallback dates if header failed: pull any year-patterned date near top
        if not start_dt:
            self.logger.warning("No header date found for %s", url)

        record = {
            "id": _stable_id(url),
            "source": "aucklandnz.com",
            "url": url,
            "title": title,
            "start": start_dt.isoformat() if start_dt else None,
            "end": end_dt.isoformat() if end_dt else None,
            "timezone": "Pacific/Auckland",
            "price": price,  # structured dict
            "venue": venue,
            "tickets_url": tickets_url,
            "website_url": website_url,
            "categories": categories or None,
            "scraped_at": datetime.now(PACIFIC_AUCKLAND).isoformat(),
        }

        # Minimal sanity fix: if price has a max that looks like a year, drop amounts
        if record["price"]:
            mx = record["price"].get("max")
            if mx and mx >= 1900 and mx <= 2100:  # captured a year by mistake
                record["price"]["min"] = None
                record["price"]["max"] = None

        yield record

    async def errback(self, failure):
        # Snapshot the page on error if we can
        request = failure.request
        page = request.meta.get("playwright_page")
        if page:
            try:
                await page.screenshot(path="scraper/debug/akl_error.png", full_page=True)
            except Exception:
                pass
        self.logger.error("Request failed: %s", failure)
