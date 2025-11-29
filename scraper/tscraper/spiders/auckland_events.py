# -*- coding: utf-8 -*-
"""
Auckland NZ Events spider

- Seeds from sitemap.xml + listing hub (multiple paginated pages) + specific known-missing examples
- Uses scrapy-playwright and waits for event tiles to render on listing pages
- Keeps the JSONL schema identical to your current structure, only improves coverage

Item shape (unchanged):
{
  "source": "aucklandnz",
  "url": "...",
  "title": "...",
  "description": "...",
  "dates": {"start": "...", "end": "...", "text": "..."},
  "price": {"currency": "NZD", "min": 40.0, "max": 70.0, "text": "NZ$40.00 - NZ$70.00 + BF", "free": false},
  "location": {"name": "...", "address": "...", "city": "...", "region": "...", "country": "NZ"},
  "categories": [...],
  "image": "...",
  "updated_at": "ISO-8601"
}
"""
import json
import logging
import re
from datetime import datetime

import scrapy
from parsel import Selector
from scrapy import Request
from scrapy.utils.response import get_base_url

# Playwright helpers: wait for listing tiles to render
try:
    from scrapy_playwright.page import PageMethod
except Exception:  # pragma: no cover
    PageMethod = None  # allows import without playwright (local static checks)

CURRENCY = "NZD"
_CURRENCY_SIGNS = (r"NZD?\$", r"\$")
_RE_PRICE = re.compile(rf"(?:{'|'.join(_CURRENCY_SIGNS)})\s*([0-9]{{1,5}}(?:\.[0-9]{{1,2}})?)")

def _norm_spaces(x):
    if isinstance(x, list):
        x = " ".join(x)
    x = x or ""
    return re.sub(r"[\u00A0\u202F\s]+", " ", x).strip()

def _jsonld_objects(response_text: str):
    out = []
    sel = Selector(text=response_text or "")
    for node in sel.xpath("//script[@type='application/ld+json']/text()").getall():
        try:
            data = json.loads(node.strip())
            out.extend(data if isinstance(data, list) else [data])
        except Exception:
            continue
    return out

def _first(obj, *paths):
    for p in paths:
        if isinstance(p, (list, tuple)) and len(p) == 2:
            a, b = p
            v = (obj.get(a) or {}).get(b) if isinstance(obj, dict) else None
        else:
            v = obj.get(p) if isinstance(obj, dict) else None
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None

def _find_event_jsonld(objs):
    for o in objs or []:
        t = o.get("@type")
        if not t:
            continue
        if isinstance(t, list):
            if any("Event" in str(x) for x in t):
                return o
        elif "Event" in str(t):
            return o
    return None

def _title_from(response):
    objs = _jsonld_objects(response.text)
    ev = _find_event_jsonld(objs)
    if ev:
        name = _first(ev, "name")
        if name:
            return name
    h1 = _norm_spaces(response.css("h1::text").get())
    if h1:
        return h1
    og = _norm_spaces(response.css("meta[property='og:title']::attr(content)").get())
    if og:
        return og
    return _norm_spaces(response.css("title::text").get())

def _desc_from(response):
    objs = _jsonld_objects(response.text)
    ev = _find_event_jsonld(objs)
    d = None
    if ev:
        d = _first(ev, "description")
    if not d:
        d = _norm_spaces(response.css("meta[name='description']::attr(content)").get())
    if not d:
        ptxt = _norm_spaces(response.css("article p::text, .event__description *::text, .field--name-body *::text").getall())
        if ptxt:
            d = ptxt
    return d or None

def _dates_from(response):
    objs = _jsonld_objects(response.text)
    ev = _find_event_jsonld(objs)
    st = en = None
    if ev:
        st = _first(ev, "startDate")
        en = _first(ev, "endDate")
    st_iso = st if st and re.match(r"^\d{4}-\d{2}-\d{2}", st) else (st or None)
    en_iso = en if en and re.match(r"^\d{4}-\d{2}-\d{2}", en) else (en or None)
    dates_text = None
    candidates = response.css(
        "[class*='date'] ::text, [class*='Date'] ::text, .event__date ::text, .field--name-field-event-date *::text"
    ).getall()
    if candidates:
        dates_text = _norm_spaces(candidates)
    return st_iso, en_iso, dates_text

def _venue_location_from(response):
    objs = _jsonld_objects(response.text)
    ev = _find_event_jsonld(objs)
    name = address = city = region = None
    if ev:
        loc = ev.get("location") or {}
        if isinstance(loc, dict):
            name = loc.get("name") or None
            addr = loc.get("address") or {}
            if isinstance(addr, dict):
                address = addr.get("streetAddress") or None
                city = addr.get("addressLocality") or None
                region = addr.get("addressRegion") or None
    if not name:
        name = _norm_spaces(response.css("[class*='venue'] ::text, .event__venue ::text").get())
    location = {
        "name": name or None,
        "address": address or None,
        "city": city or None,
        "region": region or None,
        "country": "NZ",
    }
    return name or None, location

def _image_from(response):
    objs = _jsonld_objects(response.text)
    ev = _find_event_jsonld(objs)
    if ev:
        img = ev.get("image")
        if isinstance(img, str):
            return img
        if isinstance(img, list) and img and isinstance(img[0], str):
            return img[0]
        if isinstance(img, dict) and img.get("url"):
            return img["url"]
    og = response.css("meta[property='og:image']::attr(content)").get()
    return og or None

def _categories_from(response):
    objs = _jsonld_objects(response.text)
    ev = _find_event_jsonld(objs)
    cats = []
    for path in ("eventType", "category", "keywords"):
        v = ev.get(path) if ev else None
        if isinstance(v, list):
            cats.extend([_norm_spaces(x) for x in v if isinstance(x, str) and _norm_spaces(x)])
        elif isinstance(v, str) and _norm_spaces(v):
            cats.append(_norm_spaces(v))
    if not cats:
        cats = [x.strip() for x in response.css(".tags a::text, .field--name-field-category a::text").getall() if x.strip()]
    out, seen = [], set()
    for c in cats:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out

def _price_from(response):
    text_for_block = None
    free = False
    minv = maxv = None

    objs = _jsonld_objects(response.text)
    ev = _find_event_jsonld(objs)
    if ev:
        offers = ev.get("offers")
        candidates = []
        if isinstance(offers, dict):
            candidates = [offers]
        elif isinstance(offers, list):
            candidates = [o for o in offers if isinstance(o, dict)]
        prices = []
        for o in candidates:
            for key in ("price", "lowPrice", "highPrice"):
                val = o.get(key)
                try:
                    if val is None:
                        continue
                    prices.append(float(str(val).replace(",", "")))
                except Exception:
                    pass
        if prices:
            minv = min(prices)
            maxv = max(prices)
            text_for_block = _norm_spaces(
                " ".join([offers.get("price", "") for offers in ([offers] if isinstance(offers, dict) else (offers or [])) if isinstance(offers, dict)])
            ) or None

    if minv is None:
        price_bits = response.css(
            "[class*='price'] ::text, [class*='Price'] ::text, [data-test*='price'] ::text, .ticket-price ::text, .pricing ::text"
        ).getall()
        if price_bits:
            joined = _norm_spaces(price_bits)
            text_for_block = text_for_block or joined
            nums = [float(m.group(1)) for m in _RE_PRICE.finditer(joined)]
            if nums:
                minv, maxv = min(nums), max(nums)

    if minv is None:
        body_txt = _norm_spaces(response.xpath("//body//text()").getall())
        nums = [float(m.group(1)) for m in _RE_PRICE.finditer(body_txt)]
        if nums:
            minv, maxv = min(nums), max(nums)
            if not text_for_block:
                text_for_block = " ".join(sorted({f"NZ${n:g}" for n in nums}))

    hay = text_for_block or _norm_spaces(response.text)
    if re.search(r"\bfree\b", hay, re.I):
        free = True
        if minv is None:
            minv = 0.0

    return {
        "currency": CURRENCY,
        "min": float(minv) if minv is not None else None,
        "max": float(maxv) if maxv is not None else None,
        "text": text_for_block,
        "free": bool(free),
    }

class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["aucklandnz.com"]

    # This value can be overridden at runtime: -s TS_LISTING_PAGES_MAX=40
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.listing_pages_max = int(self.settings.getint("TS_LISTING_PAGES_MAX", 25))
        self.logger.info("Listing pages max: %s", self.listing_pages_max)

    custom_settings = {
        # Ensure items land in scraper/data/Events.jsonl when cwd is scraper/
        "FEEDS": {
            "data/Events.jsonl": {
                "format": "jsonlines",
                "encoding": "utf-8",
                "overwrite": False,
            }
        },
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_DELAY": 0.25,
        "AUTOTHROTTLE_ENABLED": True,
    }

    # seed detail URLs that were reported missing, to guarantee coverage
    _manual_seeds = [
        "https://www.aucklandnz.com/events-hub/events/the-others-way-festival",
        "https://www.aucklandnz.com/events-hub/events/oceania-journey-to-the-centre",
        "https://www.aucklandnz.com/events-hub/events/pop-to-present-american-art-from-the-virginia-museum-of-fine-arts",
        # keep earlier examples too (still useful)
        "https://www.aucklandnz.com/events-hub/events/rufus-du-sol-inhale-exhale-word-tour",
        "https://www.aucklandnz.com/events-hub/events/laneway-festival-2026",
        "https://www.aucklandnz.com/events-hub/events/the-waterboys",
        "https://www.aucklandnz.com/pasifika",
    ]

    def start_requests(self):
        # 1) Sitemap index (no need for JS)
        yield Request(
            "https://www.aucklandnz.com/sitemap.xml",
            callback=self.parse_sitemap_index,
            meta={"playwright": False},
            dont_filter=True,
        )

        # 2) Listing pages (JS) – enumerate ?page=0..N and wait for tiles
        # PageMethod only works if scrapy_playwright is present
        pm = []
        if PageMethod:
            pm = [PageMethod("wait_for_selector", 'a[href*="/events-hub/events/"]', {"timeout": 15000})]

        base = "https://www.aucklandnz.com/events-hub/events"
        yield Request(
            base,
            callback=self.parse_listing,
            meta={"playwright": True, "playwright_page_methods": pm},
            dont_filter=True,
        )
        for i in range(1, self.listing_pages_max + 1):
            yield Request(
                f"{base}?page={i}",
                callback=self.parse_listing,
                meta={"playwright": True, "playwright_page_methods": pm},
                dont_filter=True,
            )

        # 3) Manual seeds for guaranteed coverage
        for u in self._manual_seeds:
            yield Request(
                u,
                callback=self.parse_event,
                meta={"playwright": True},
                dont_filter=True,
            )

    # ---- sitemap handling ----
    def parse_sitemap_index(self, response):
        # follow any child sitemap that looks related to events
        locs = response.xpath("//loc/text()").getall()
        for loc in locs:
            if "/event" in loc or "/events" in loc:
                yield Request(
                    loc,
                    callback=self.parse_sitemap_leaf,
                    meta={"playwright": False},
                    dont_filter=True,
                )

    def parse_sitemap_leaf(self, response):
        for loc in response.xpath("//url/loc/text()").getall():
            if "/events-hub/events/" in loc or loc.rstrip("/").endswith("/pasifika"):
                yield Request(
                    loc,
                    callback=self.parse_event,
                    meta={"playwright": True},
                    dont_filter=True,
                )

    # ---- listing pages ----
    def parse_listing(self, response):
        hrefs = set()
        for href in response.css('a[href*="/events-hub/events/"]::attr(href)').getall():
            hrefs.add(href.strip())
        for href in sorted(hrefs):
            yield response.follow(
                href,
                callback=self.parse_event,
                meta={"playwright": True},
                dont_filter=True,
            )

    # ---- detail pages ----
    def parse_event(self, response):
        try:
            title = _title_from(response)
            desc = _desc_from(response)
            st, en, dates_text = _dates_from(response)
            price = _price_from(response)
            venue_name, location = _venue_location_from(response)
            image = _image_from(response)
            cats = _categories_from(response)

            item = {
                "source": "aucklandnz",
                "url": response.url,
                "title": title,
                "description": desc,
                "dates": {"start": st, "end": en, "text": dates_text},
                "price": price,
                "location": location,
                "categories": cats or None,
                "image": image,
                "updated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            }
            if not item["title"]:
                self.logger.warning("No title extracted for %s", response.url)
            yield item

        except Exception as e:
            self.logger.error("Failed to parse event %s: %s", response.url, e, exc_info=True)
