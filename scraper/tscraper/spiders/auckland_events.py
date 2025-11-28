# tscraper/spiders/auckland_events.py
import json
import re
import os
import hashlib
from urllib.parse import urljoin, urlparse
from datetime import datetime, timezone
from email.utils import format_datetime

import scrapy
from parsel import Selector
from w3lib.html import remove_tags


# ---------------- config ----------------

LISTING_URLS = [
    "https://www.aucklandnz.com/events-hub/events",
    "https://www.aucklandnz.com/events-hub",
]

# Some “hero” events live outside /events-hub/events/
EXTRA_EVENT_PATHS = [
    "/pasifika",
]

SITEMAP_CANDIDATES = [
    "https://www.aucklandnz.com/sitemap.xml",
    "https://www.aucklandnz.com/sitemap-events.xml",
    "https://www.aucklandnz.com/sitemap_event.xml",
]

# Accept detail pages like /events-hub/events/<slug> and whitelisted extras
DETAIL_ALLOW = (
    r"^/events-hub/events/[^/?#]+/?$",
)
EXTRA_ALLOW = tuple(re.escape(p.rstrip("/")) + r"/?$" for p in EXTRA_EVENT_PATHS)

DEBUG_DIR = "scraper/debug/akl_events"
os.makedirs(DEBUG_DIR, exist_ok=True)


def _stable_id(url: str) -> str:
    """16-char stable hex id from URL."""
    return hashlib.blake2b(url.encode("utf-8"), digest_size=8).hexdigest()


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", remove_tags(s or "")).strip() if s else ""


def _all_hrefs(html: str, base: str):
    sel = Selector(text=html or "")
    hrefs = []
    for h in sel.css("a::attr(href)").getall():
        if not h:
            continue
        hrefs.append(urljoin(base, h.split("#")[0]))
    return hrefs


def _is_event_detail(path: str) -> bool:
    for pat in DETAIL_ALLOW:
        if re.search(pat, path):
            return True
    for pat in EXTRA_ALLOW:
        if re.search(pat, path):
            return True
    return False


def _path(url: str) -> str:
    try:
        u = urlparse(url)
        return u.path
    except Exception:
        return ""


def _jsonld_objects(response_text: str):
    sel = Selector(text=response_text or "")
    out = []
    for node in sel.xpath("//script[@type='application/ld+json']/text()").getall():
        try:
            data = json.loads(node.strip())
            out.extend(data if isinstance(data, list) else [data])
        except Exception:
            continue
    return out


def _first_event_ld(objs):
    for o in objs or []:
        t = o.get("@type")
        if t == "Event" or (isinstance(t, list) and "Event" in t):
            return o
    return None


def _price_from_ld(offers):
    """Return (min, max, currency) from JSON-LD offers."""
    if not offers:
        return None, None, None
    if isinstance(offers, dict):
        lo = offers.get("lowPrice") or offers.get("price")
        hi = offers.get("highPrice") or lo
        ccy = offers.get("priceCurrency") or "NZD"
        try:
            lo = float(str(lo).replace(",", ""))
            hi = float(str(hi).replace(",", ""))
            return lo, hi, ccy
        except Exception:
            return None, None, ccy
    if isinstance(offers, list):
        lows, highs, ccy = [], [], "NZD"
        for off in offers:
            ccy = off.get("priceCurrency") or ccy
            lo = off.get("lowPrice") or off.get("price")
            hi = off.get("highPrice") or lo
            try:
                if lo is not None:
                    lows.append(float(str(lo).replace(",", "")))
                if hi is not None:
                    highs.append(float(str(hi).replace(",", "")))
            except Exception:
                continue
        if lows or highs:
            lo = min(lows) if lows else None
            hi = max(highs) if highs else lo
            return lo, hi, ccy
    return None, None, None


def _prices_from_text(html: str):
    # Conservative: pick sensible ticket-looking amounts and ignore huge numbers
    text = _clean(Selector(text=html or "").xpath("//body//text()").getall() or "")
    nums = [m for m in re.findall(r"\$?\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", text)]
    vals = []
    for n in nums:
        try:
            v = float(n.replace(",", ""))
            if 0 <= v < 2000:
                vals.append(v)
        except Exception:
            pass
    if not vals:
        return None, None
    return min(vals), max(vals)


class AucklandEventsSpider(scrapy.Spider):
    """
    AucklandNZ — Events
    Emits fields similar to your existing tidy schema, with an added `title`.
    """

    name = "auckland_events"
    allowed_domains = ["aucklandnz.com", "www.aucklandnz.com"]

    # We keep polite settings and caching consistent with your project. :contentReference[oaicite:2]{index=2}
    custom_settings = {
        # Writing to the same feed path as other spiders by default
        "FEEDS": {
            "data/Events.jsonl": {"format": "jsonlines", "encoding": "utf8", "overwrite": False}
        },
        # If you want to force Playwright only for the listing (not details), this stays fast.
        "DOWNLOAD_DELAY": 0.25,
    }

    def start_requests(self):
        # JS listing (playwright) for complete coverage
        for url in LISTING_URLS:
            yield scrapy.Request(
                url,
                meta={
                    "playwright": True,
                    "playwright_include_page": True,  # so we can scroll & click
                },
                callback=self.parse_listing,
                errback=self.err_listing,
            )

        # Server-side paginated pages (fallback)
        for page in range(0, 6):  # bump if needed
            u = f"https://www.aucklandnz.com/events-hub/events?page={page}"
            yield scrapy.Request(u, callback=self.parse_listing_html, errback=self.err_listing)

        # Sitemap sweep (broad net)
        for sm in SITEMAP_CANDIDATES:
            yield scrapy.Request(sm, callback=self.parse_sitemap, errback=self.err_sitemap)

        # Explicit extras (e.g., Pasifika)
        for p in EXTRA_EVENT_PATHS:
            yield scrapy.Request(
                urljoin("https://www.aucklandnz.com", p),
                callback=self.parse_event,
                headers={"Referer": "https://www.aucklandnz.com/"},
            )

    # ---------- listing (JS) ----------

    async def parse_listing(self, response):
        page = response.meta["playwright_page"]
        base = str(response.url)

        # Scroll and attempt to click "Load more" buttons a few times
        try:
            for _ in range(20):
                await page.mouse.wheel(0, 20000)
                await page.wait_for_timeout(500)
                # Try common “Load more”/“Show more” selectors
                btn = page.locator(
                    "button:has-text('Load more'), a:has-text('Load more'), "
                    "button:has-text('Show more'), a:has-text('Show more')"
                )
                if await btn.count() > 0 and await btn.first().is_visible():
                    await btn.first().click()
                    await page.wait_for_timeout(1200)
                else:
                    # If no button, keep scrolling a bit and then stop
                    await page.wait_for_timeout(500)
                    break
        except Exception:
            pass

        html = await page.content()
        await page.close()

        hrefs = _all_hrefs(html, base)
        # Keep only event details and extras
        keep = []
        seen = set()
        for h in hrefs:
            p = _path(h)
            if _is_event_detail(p) and h not in seen:
                keep.append(h)
                seen.add(h)

        if not keep:
            # write debug HTML snapshot once
            path = os.path.join(DEBUG_DIR, "listing-playwright.html")
            try:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(html)
                self.logger.info("No event links found; wrote %s", path)
            except Exception:
                pass

        for h in keep:
            yield scrapy.Request(h, callback=self.parse_event, headers={"Referer": base})

    def err_listing(self, failure):
        self.logger.warning("Listing error at %s: %s", failure.request.url, failure)

    # ---------- listing (HTML fallback) ----------

    def parse_listing_html(self, response):
        base = response.url
        hrefs = _all_hrefs(response.text, base)
        keep = []
        seen = set()
        for h in hrefs:
            p = _path(h)
            if _is_event_detail(p) and h not in seen:
                keep.append(h)
                seen.add(h)

        if not keep:
            # Save a snapshot for debugging this page too
            fname = f"listing-fallback-{hash(response.url)}.html"
            try:
                with open(os.path.join(DEBUG_DIR, fname), "w", encoding="utf-8") as f:
                    f.write(response.text)
            except Exception:
                pass

        for h in keep:
            yield scrapy.Request(h, callback=self.parse_event, headers={"Referer": base})

    # ---------- sitemap sweep ----------

    def parse_sitemap(self, response):
        sel = Selector(text=response.text)
        locs = sel.xpath("//*[local-name()='url']/*[local-name()='loc']/text()").getall()
        if not locs:
            # handle sitemap index
            idx = sel.xpath("//*[local-name()='sitemap']/*[local-name()='loc']/text()").getall()
            for u in idx:
                yield scrapy.Request(u, callback=self.parse_sitemap)
            return

        # Filter to event detail paths + extras
        keep = []
        seen = set()
        for u in locs:
            p = _path(u)
            if _is_event_detail(p) and u not in seen:
                keep.append(u)
                seen.add(u)

        # Write a quick links dump for debugging coverage once
        try:
            with open(os.path.join(DEBUG_DIR, "sitemap-links.txt"), "w", encoding="utf-8") as f:
                f.write("\n".join(keep))
        except Exception:
            pass

        for u in keep:
            yield scrapy.Request(u, callback=self.parse_event, headers={"Referer": response.url})

    def err_sitemap(self, failure):
        self.logger.warning("Sitemap error at %s: %s", failure.request.url, failure)

    # ---------- detail ----------

    def parse_event(self, response):
        url = response.url
        html = response.text
        sel = Selector(text=html)

        # JSON-LD Event first (most reliable) :contentReference[oaicite:3]{index=3}
        ld_objs = _jsonld_objects(html)
        ev = _first_event_ld(ld_objs) or {}

        title = (
            (ev.get("name") or "") if isinstance(ev.get("name"), str) else ""
        ) or _clean(sel.css("h1::text").get()) or _clean(sel.xpath("//title/text()").get())

        if not title:
            # Save a detail snapshot if absolutely no title is found
            try:
                with open(os.path.join(DEBUG_DIR, f"detail-no-title-{_stable_id(url)}.html"), "w", encoding="utf-8") as f:
                    f.write(html)
            except Exception:
                pass

        # Dates
        start_iso = ev.get("startDate") if isinstance(ev.get("startDate"), str) else None
        end_iso = ev.get("endDate") if isinstance(ev.get("endDate"), str) else None

        # Location / address
        venue_name = None
        address_text = None
        loc = ev.get("location") or {}
        if isinstance(loc, dict):
            venue_name = loc.get("name") or None
            addr = loc.get("address") or {}
            if isinstance(addr, dict):
                address_text = " ".join(
                    filter(
                        None,
                        [
                            addr.get("streetAddress"),
                            addr.get("addressLocality"),
                            addr.get("postalCode"),
                        ],
                    )
                ).strip() or None

        # Price (min/max + currency)
        pmin, pmax, pccy = _price_from_ld(ev.get("offers"))
        if pmin is None and pmax is None:
            # fallback to page text
            tmin, tmax = _prices_from_text(html)
            pmin, pmax = (tmin, tmax)
            if pccy is None:
                pccy = "NZD"

        # A short human readable price text (first decent line containing $)
        price_text = None
        for t in sel.xpath("//*[contains(text(),'$')]//text()").getall():
            t = _clean(t)
            if t and len(t) <= 140:
                price_text = t
                break

        # Collection timestamp (RFC 2822 to match your prior style)
        collected = response.headers.get("Date", b"").decode().strip()
        if not collected:
            collected = format_datetime(datetime.now(timezone.utc))

        record = {
            "id": _stable_id(url),
            "record_type": "event",
            # add title (and keep name identical for compatibility)
            "title": title or None,
            "name": title or None,
            "url": url,
            "source": "aucklandnz.com",
            "location": {
                "name": venue_name,
                "address": address_text,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": {
                "currency": pccy or "NZD",
                "min": pmin,
                "max": pmax,
                "text": price_text,
                "free": True if (pmin == 0.0 and pmax == 0.0) else False,
            },
            "event_dates": {
                "start": start_iso,
                "end": end_iso,
                "timezone": "Pacific/Auckland",
                "text": None,
            },
            "opening_hours": None,
            "operating_months": None,
            "data_collected_at": collected,
        }

        yield record
