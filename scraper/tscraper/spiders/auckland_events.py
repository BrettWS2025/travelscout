import re
import json
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy
from w3lib.html import remove_tags

# --- make_id: prefer shared helper, fall back locally if import path differs ---
try:
    from tscraper.items import make_id  # stable 16-hex id from URL
except Exception:  # pragma: no cover
    import hashlib
    def make_id(url: str) -> str:
        return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)

LISTING_STARTS = [
    "https://www.aucklandnz.com/events-hub",
    "https://www.aucklandnz.com/events-hub/events",
    # Fallback: some events live directly under /events/
    "https://www.aucklandnz.com/events",
]

EVENT_ALLOW_PREFIXES = ("/events/", "/events-hub/events/")

MONTH_WORD = r"(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|Jun(e)?|" \
             r"Jul(y)?|Aug(ust)?|Sep(tember)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)"


class AucklandEventsSpider(scrapy.Spider):
    """
    AucklandNZ — Events spider

    Source of truth: https://www.aucklandnz.com/events-hub

    Emits TravelScoutRecord-shaped dicts:
      id, record_type, name, description, categories, tags, url, source,
      images, location, price, booking, event_dates, opening_hours,
      operating_months, data_collected_at, text_for_embedding
    """
    name = "auckland_events"
    allowed_domains = ["aucklandnz.com", "www.aucklandnz.com"]
    start_urls = LISTING_STARTS

    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": True,           # keep polite by default
        "COOKIES_ENABLED": False,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.25,
        "CONCURRENT_REQUESTS": 12,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.25,
        "AUTOTHROTTLE_MAX_DELAY": 4.0,
        # feed
        "FEEDS": {
            "data/Events.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
        # playwright (enabled globally in settings, but safe to keep here too)
        "TWISTED_REACTOR": "twisted.internet.asyncioreactor.AsyncioSelectorReactor",
    }

    # -------------------- UTIL --------------------

    @staticmethod
    def _clean(s: str) -> str:
        if not s:
            return ""
        s = remove_tags(s)
        s = re.sub(r"\s+", " ", s).strip()
        return s

    @staticmethod
    def _abs(base: str, href: str) -> str:
        try:
            if not href:
                return ""
            u = urlparse(href)
            if u.scheme or u.netloc:
                return href
            return urljoin(base, href)
        except Exception:
            return href or ""

    def _from_ldjson(self, response):
        """Extract a compact subset from any JSON-LD Event blocks."""
        out = {}
        for raw in response.css('script[type="application/ld+json"]::text').getall():
            try:
                data = json.loads(raw)
            except Exception:
                continue
            blocks = data if isinstance(data, list) else [data]
            for b in blocks:
                if not isinstance(b, dict):
                    continue
                t = b.get("@type")
                if t == "Event" or (isinstance(t, list) and "Event" in t):
                    out.setdefault("name", b.get("name"))
                    out.setdefault("startDate", b.get("startDate"))
                    out.setdefault("endDate", b.get("endDate"))
                    loc = b.get("location") or {}
                    if isinstance(loc, dict):
                        out.setdefault("venue", loc.get("name"))
                        addr = loc.get("address")
                        if isinstance(addr, dict):
                            out.setdefault(
                                "address",
                                " ".join(
                                    filter(
                                        None,
                                        [
                                            addr.get("streetAddress"),
                                            addr.get("addressLocality"),
                                            addr.get("postalCode"),
                                        ],
                                    )
                                ).strip()
                                or None,
                            )
                    offers = b.get("offers")
                    if isinstance(offers, dict):
                        out.setdefault("priceCurrency", offers.get("priceCurrency"))
                        out.setdefault("price", offers.get("price"))
                    elif isinstance(offers, list) and offers:
                        out.setdefault("priceCurrency", offers[0].get("priceCurrency"))
                        out.setdefault("price", offers[0].get("price"))
        return out

    @staticmethod
    def _pick_dt_like(texts):
        """Return first line that looks date-ish."""
        if not texts:
            return None
        pattern = re.compile(rf"\b\d{{1,2}}(\s*[-/]\s*\d{{1,2}})?\s+{MONTH_WORD}\b.*\d{{4}}", re.I)
        for t in texts:
            t2 = re.sub(r"\s+", " ", (t or "")).strip()
            if pattern.search(t2):
                return t2
        return None

    @staticmethod
    def _parse_date_range(date_text: str):
        """
        Accepts samples:
          "17 - 19 April 2026"
          "2 - 6 December 2025"
          "08 - 23 Nov, 2025 | 10:00 AM - 04:00 PM"
          "14 Feb 2026 | 6:25 pm - 9:40 pm"
        Returns (iso_start, iso_end)
        """
        if not date_text:
            return None, None
        t = " ".join(date_text.split())

        # "Date | 6:00 PM - 9:00 PM"
        if "|" in t and "-" in t.split("|", 1)[1]:
            try:
                from dateutil import parser as dp
                import pytz
                NZ = pytz.timezone("Pacific/Auckland")
                date_part, time_part = [x.strip() for x in t.split("|", 1)]
                st_txt, et_txt = [x.strip() for x in time_part.split("-", 1)]
                d = dp.parse(date_part, dayfirst=True).date()
                st = dp.parse(st_txt).time()
                et = dp.parse(et_txt).time()
                start = NZ.localize(datetime.combine(d, st))
                end = NZ.localize(datetime.combine(d, et))
                if end <= start:
                    end = NZ.localize(datetime.combine(d, datetime.max.time().replace(hour=23, minute=59, second=59)))
                return start.isoformat(), end.isoformat()
            except Exception:
                pass

        # "2 - 6 December 2025"
        m = re.match(r"(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", t)
        if m:
            try:
                from dateutil import parser as dp
                import pytz
                NZ = pytz.timezone("Pacific/Auckland")
                d1, d2, month, year = m.groups()
                start = NZ.localize(dp.parse(f"{d1} {month} {year}"))
                end = NZ.localize(dp.parse(f"{d2} {month} {year} 23:59:59"))
                return start.isoformat(), end.isoformat()
            except Exception:
                return None, None

        # Single date
        try:
            from dateutil import parser as dp
            import pytz
            NZ = pytz.timezone("Pacific/Auckland")
            d = NZ.localize(dp.parse(t))
            return d.isoformat(), d.isoformat()
        except Exception:
            return None, None

    @staticmethod
    def _extract_prices(text: str):
        """Return compact price object from a blob of text."""
        if not text:
            return {"currency": "NZD", "min": None, "max": None, "text": None, "free": False}
        free = bool(re.search(r"\bfree\b", text, re.I))
        nums = [float(x.replace(",", "")) for x in re.findall(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)", text)]
        minv = min(nums) if nums else (0.0 if free else None)
        maxv = max(nums) if nums else None
        t = re.sub(r"\s+", " ", text).strip()
        return {"currency": "NZD", "min": minv, "max": maxv, "text": t or None, "free": free}

    # -------------------- LISTING (Playwright) --------------------

    async def parse(self, response):
        """
        Load listing with JS, scroll/click load-more, then collect event links.
        """
        # Ensure this request goes through Playwright
        if not response.meta.get("playwright"):
            yield scrapy.Request(
                response.url,
                callback=self.parse,
                meta={"playwright": True, "playwright_include_page": True},
                headers={"User-Agent": BROWSER_UA, "Referer": response.url},
                dont_filter=True,
            )
            return

        page = response.meta["playwright_page"]

        # Try to let client-side content settle
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=15000)
        except Exception:
            pass

        # Best-effort: accept cookies if banner present
        try:
            for text in ("Accept", "I accept", "Got it", "I agree", "OK"):
                btn = page.locator(f"button:has-text('{text}')")
                if await btn.count():
                    await btn.first.click(timeout=1000)
                    break
        except Exception:
            pass

        sel_card = "a[href*='/events-hub/events/'], a[href^='/events/'], a[href*='://www.aucklandnz.com/events/']"

        # Scroll & optional "Load more" clicks
        last_seen = 0
        for _ in range(20):
            try:
                await page.wait_for_selector(sel_card, timeout=5000)
            except Exception:
                # keep trying to scroll anyway
                pass
            # Scroll
            try:
                await page.evaluate("window.scrollBy(0, document.body.scrollHeight)")
            except Exception:
                pass
            await page.wait_for_timeout(800)
            # Click "Load more" if exists
            try:
                if await page.locator("button:has-text('Load more')").count():
                    await page.locator("button:has-text('Load more')").click(timeout=1500)
                    await page.wait_for_timeout(1200)
            except Exception:
                pass
            # Check if new links appeared; if not, break
            try:
                hrefs_now = await page.eval_on_selector_all(
                    sel_card, "els => Array.from(new Set(els.map(e => e.href)))"
                )
                if len(hrefs_now) <= last_seen:
                    break
                last_seen = len(hrefs_now)
            except Exception:
                break

        # Final harvest
        links = []
        try:
            links = await page.eval_on_selector_all(
                sel_card, "els => Array.from(new Set(els.map(e => e.href)))"
            )
        except Exception:
            links = []

        await page.close()

        # Fallback: also pull any static anchors Scrapy sees
        if not links:
            raw_hrefs = response.css("a::attr(href)").getall()
            for h in raw_hrefs or []:
                if any(h.startswith(p) or ("/events/" in h) for p in EVENT_ALLOW_PREFIXES):
                    links.append(self._abs(response.url, h))

        # Keep only real event detail URLs
        def _is_event(u: str) -> bool:
            try:
                p = urlparse(u).path or ""
            except Exception:
                return False
            return p.startswith("/events/") or p.startswith("/events-hub/events/")

        links = [u for u in (links or []) if _is_event(u)]
        uniq = []
        seen = set()
        for u in links:
            if u not in seen:
                uniq.append(u)
                seen.add(u)

        if not uniq:
            self.logger.info("No event links found on %s", response.url)
        else:
            self.logger.info("Found %d event links on %s", len(uniq), response.url)

        for url in uniq:
            yield scrapy.Request(
                url,
                callback=self.parse_event,
                headers={"User-Agent": BROWSER_UA, "Referer": response.url},
                meta={"playwright": False},  # detail pages tend to be SSR; cheaper to use plain HTTP
            )

        # Also follow obvious event listing/aggregation links
        for href in response.css('a[href*="/events-hub"]::attr(href), a[href^="/events"]::attr(href)').getall():
            u = self._abs(response.url, href.split("#")[0])
            if u.startswith("https://www.aucklandnz.com/events-hub"):
                yield scrapy.Request(
                    u,
                    callback=self.parse,
                    headers={"User-Agent": BROWSER_UA, "Referer": response.url},
                )

    # -------------------- DETAIL --------------------

    def parse_event(self, response):
        ld = self._from_ldjson(response)

        # Title
        title = (
            self._clean(response.css("h1::text").get())
            or self._clean(response.css('meta[property="og:title"]::attr(content)').get())
            or self._clean(ld.get("name"))
        )
        if not title:
            self.logger.debug("No title on %s", response.url)
            return

        # Images
        images = []
        ogimg = response.css('meta[property="og:image"]::attr(content)').get()
        if ogimg:
            images.append(ogimg)
        # take a few inline images too
        for src in response.css("article img::attr(src), main img::attr(src)").getall()[:4]:
            u = self._abs(response.url, src)
            if u and u not in images:
                images.append(u)

        # Quick definition list lookup: Date, Location, Category, Price, Tickets
        def dl_value(label):
            # <dt>Date</dt><dd>...</dd>
            x = response.xpath(f"//dt[normalize-space()='{label}']/following-sibling::dd[1]")
            return self._clean(" ".join(x.xpath(".//text()").getall()))

        date_text = dl_value("Date") or self._pick_dt_like(
            [self._clean(t) for t in response.css("main *::text").getall()[:150]]
        )

        location_text = dl_value("Location")
        categories_text = dl_value("Category") or dl_value("Categories") or ""
        price_text = dl_value("Price") or dl_value("Admission") or ""

        # Tickets / booking link
        booking_url = None
        for sel in ("a:contains('Tickets')::attr(href)", "a:contains('Buy tickets')::attr(href)",
                    "a:contains('Book')::attr(href)"):
            v = response.css(sel).get()
            if v:
                booking_url = self._abs(response.url, v)
                break

        # Venue/name/address from JSON-LD fallback
        venue = ld.get("venue")
        address = ld.get("address")

        # If no venue/address, borrow from page text near "Location"
        if not venue and location_text:
            # often "Venue, Address" — split on comma; keep first short token as venue
            parts = [p.strip() for p in location_text.split(",") if p.strip()]
            if parts and len(parts[0]) <= 80:
                venue = parts[0]
            address = location_text

        # Dates parsing
        start_iso = ld.get("startDate")
        end_iso = ld.get("endDate")
        if not (start_iso or end_iso):
            s, e = self._parse_date_range(date_text)
            start_iso, end_iso = s, e

        # Price compact object (JSON-LD wins, else parse text)
        price_obj = {"currency": "NZD", "min": None, "max": None, "text": None, "free": False}
        if ld.get("price") not in (None, ""):
            try:
                val = float(str(ld["price"]).replace(",", ""))
                if 0 <= val < 20000:
                    price_obj = {
                        "currency": ld.get("priceCurrency") or "NZD",
                        "min": val,
                        "max": val,
                        "text": f"${val:g}",
                        "free": val == 0.0,
                    }
            except Exception:
                pass
        if price_obj["min"] is None and (price_text or ""):
            price_obj = self._extract_prices(price_text)

        # Description (first sane paragraph)
        desc = None
        for p in response.css("article p::text, main p::text").getall():
            t = self._clean(p)
            if t and len(t) >= 40:
                desc = t
                break

        # Categories list
        categories = []
        if categories_text:
            categories = [c.strip() for c in re.split(r"[,/|•]+", categories_text) if c.strip()]

        # Collected timestamp
        collected = response.headers.get("Date", b"").decode().strip()
        if not collected:
            collected = datetime.now(timezone.utc).isoformat()

        # Build record
        rec = {
            "id": make_id(response.url),
            "record_type": "event",
            "name": title,
            "description": desc,
            "categories": categories,
            "tags": [],
            "url": response.url,
            "source": "aucklandnz.com",            # <- per-spider source
            "images": images,
            "location": {
                "name": venue or None,
                "address": address or None,
                "city": "Auckland",
                "region": "Auckland",             # <- per-spider region
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": price_obj,
            "booking": {
                "url": booking_url,
                "email": None,
                "phone": None,
            },
            "event_dates": {
                "start": start_iso,
                "end": end_iso,
                "timezone": "Pacific/Auckland",
            },
            "opening_hours": None,
            "operating_months": None,
            "data_collected_at": collected,
            # lightweight embedding text
            "text_for_embedding": " | ".join(
                [x for x in [title, desc, location_text, date_text, price_text, ", ".join(categories)] if x]
            ),
        }

        # Sanity: ensure event link path matches allowlist
        path = urlparse(response.url).path or ""
        if not (path.startswith("/events/") or path.startswith("/events-hub/events/")):
            self.logger.debug("Skip non-event path: %s", response.url)
            return

        yield rec
