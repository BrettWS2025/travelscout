# -*- coding: utf-8 -*-
"""
Auckland NZ Events spider

- No manual seeds.
- Scalable discovery:
  (1) follow *all* child sitemaps from /sitemap.xml and pick event detail URLs
  (2) recursively crawl the entire /events-hub section (listing, categories, pagination)
      using Playwright on hub/list pages to ensure tiles render.
- Keeps the JSONL schema identical to your current structure.

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
import re
from datetime import datetime
from urllib.parse import urlparse

import scrapy
from parsel import Selector
from scrapy import Request

# Use Playwright only where needed (list/hub pages)
try:
    from scrapy_playwright.page import PageMethod
except Exception:  # pragma: no cover
    PageMethod = None  # allows import without playwright present

CURRENCY = "NZD"
_CURRENCY_SIGNS = (r"NZD?\$", r"\$")
_RE_PRICE = re.compile(rf"(?:{'|'.join(_CURRENCY_SIGNS)})\s*([0-9]{{1,5}}(?:\.[0-9]{{1,2}})?)")


# ------------------ helpers ------------------

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
        ptxt = _norm_spaces(
            response.css("article p::text, .event__description *::text, .field--name-body *::text").getall()
        )
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
        cats = [
            x.strip()
            for x in response.css(".tags a::text, .field--name-field-category a::text").getall()
            if x.strip()
        ]
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

    # 1) JSON-LD offers
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
                " ".join(
                    [
                        off.get("price", "")
                        for off in (candidates or [])
                        if isinstance(off, dict)
                    ]
                )
            ) or None

    # 2) Visible price blocks
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

    # 3) Last resort: scan entire body text
    if minv is None:
        body_txt = _norm_spaces(response.xpath("//body//text()").getall())
        nums = [float(m.group(1)) for m in _RE_PRICE.finditer(body_txt)]
        if nums:
            minv, maxv = min(nums), max(nums)
            if not text_for_block:
                text_for_block = " ".join(sorted({f"NZ${n:g}" for n in nums}))

    # free detection
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


# ------------------ spider ------------------

class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["aucklandnz.com"]

    # CLI override example:
    #   -s TS_LISTING_PAGES_MAX=80
    # (your workflow supports extra args already)
    def __init__(self, listing_pages_max=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._cli_listing_pages_max = listing_pages_max  # str or None
        self.listing_pages_max = 25  # preliminary; finalized in from_crawler

    @classmethod
    def from_crawler(cls, crawler, *args, **kwargs):
        """Read settings after crawler attaches them (avoid self.settings in __init__)."""
        spider = cls(*args, **kwargs)
        spider._set_crawler(crawler)
        if getattr(spider, "_cli_listing_pages_max", None) is not None:
            try:
                spider.listing_pages_max = int(spider._cli_listing_pages_max)
            except Exception:
                spider.listing_pages_max = 25
        else:
            spider.listing_pages_max = int(crawler.settings.getint("TS_LISTING_PAGES_MAX", 25))
        spider.logger.info("Listing pages max resolved to %s", spider.listing_pages_max)
        return spider

    # Default FEEDS only for local runs; workflow overrides via CLI -s FEEDS=...
    custom_settings = {
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
        # Playwright is already enabled globally in your settings. :contentReference[oaicite:1]{index=1}
    }

    # ---------- start & discovery ----------

    def _pm_wait_for_tiles(self):
        """Playwright step to wait for event tiles to render on hub/list pages."""
        if not PageMethod:
            return []
        return [PageMethod("wait_for_selector", 'a[href*="/events-hub/events/"]', {"timeout": 15000})]

    def start_requests(self):
        # 1) sitemap index — follow *all* child sitemaps
        yield Request(
            "https://www.aucklandnz.com/sitemap.xml",
            callback=self.parse_sitemap_index,
            meta={"playwright": False},
            dont_filter=True,
        )

        # 2) /events-hub root (JS render), then explicit paginated listing pages ?page=N
        base = "https://www.aucklandnz.com/events-hub"
        yield Request(
            base,
            callback=self.parse_hub,
            meta={"playwright": True, "playwright_page_methods": self._pm_wait_for_tiles()},
            dont_filter=True,
        )

        list_base = "https://www.aucklandnz.com/events-hub/events"
        # page 0 explicitly
        yield Request(
            list_base,
            callback=self.parse_hub,
            meta={"playwright": True, "playwright_page_methods": self._pm_wait_for_tiles()},
            dont_filter=True,
        )
        # ?page=1..N
        for i in range(1, self.listing_pages_max + 1):
            yield Request(
                f"{list_base}?page={i}",
                callback=self.parse_hub,
                meta={"playwright": True, "playwright_page_methods": self._pm_wait_for_tiles()},
                dont_filter=True,
            )

    # ---- sitemap handling ----
    def parse_sitemap_index(self, response):
        """Follow every child sitemap; filter at the URL level (urlset)."""
        for loc in response.xpath("//sitemap/loc/text()").getall():
            yield Request(
                loc,
                callback=self.parse_sitemap_leaf,
                meta={"playwright": False},
                dont_filter=True,
            )

    def parse_sitemap_leaf(self, response):
        """Pick event detail links from every urlset entry; /events-hub pages are sent to parse_hub."""
        for loc in response.xpath("//url/loc/text()").getall():
            if "/events-hub/events/" in loc:
                # detail page — usually SSR, no JS needed
                yield Request(loc, callback=self.parse_event, meta={"playwright": False})
            elif "/events-hub" in loc:
                # category/list/hub page — ensure tiles render
                yield Request(
                    loc,
                    callback=self.parse_hub,
                    meta={"playwright": True, "playwright_page_methods": self._pm_wait_for_tiles()},
                )

    # ---- recursive hub/list crawler ----
    def parse_hub(self, response):
        """
        On *any* /events-hub page:
          - collect event detail links
          - recurse into other /events-hub pages (categories, pagination, etc.)
        """
        # 1) detail links
        event_links = set(
            h.strip()
            for h in response.css('a[href*="/events-hub/events/"]::attr(href)').getall()
            if h and "/events-hub/events/" in h
        )
        for href in sorted(event_links):
            yield response.follow(
                href,
                callback=self.parse_event,
                meta={"playwright": False},  # detail pages typically SSR
            )

        # 2) more hub/list/category pages under /events-hub (avoid loops via dupefilter)
        hub_links = set()
        for h in response.css('a[href^="/events-hub"]::attr(href), a[href*="aucklandnz.com/events-hub"]::attr(href)').getall():
            if not h:
                continue
            # keep only pages, not anchors
            p = urlparse(h)
            path = p.path or h
            if "/events-hub/events/" in path:
                # we'll already catch details via event_links; let list pages be revisited here as well
                pass
            if path.startswith("/events-hub"):
                hub_links.add(h.strip())

        for href in sorted(hub_links):
            yield response.follow(
                href,
                callback=self.parse_hub,
                meta={"playwright": True, "playwright_page_methods": self._pm_wait_for_tiles()},
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
