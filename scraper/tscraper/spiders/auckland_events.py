# -*- coding: utf-8 -*-
"""
Auckland NZ Events – minimal spider

- Discovery via sitemap index (https://www.aucklandnz.com/sitemap.xml)
  → follow child sitemaps and collect only URLs under /events-hub/events/
- Also (optional) scan listing pages /events-hub/events?page=N (no JS), in
  case some items are not present in the sitemaps.
- Extracts only the required fields and keeps your JSONL schema unchanged.

Item:
{
  "source": "aucklandnz",
  "url": "...",
  "title": "...",
  "description": "...",
  "dates": {"start": "...", "end": "...", "text": "..."},
  "price": {"currency": "NZD", "min": 40.0, "max": 70.0, "text": "NZ$40 - NZ$70 + BF", "free": false},
  "location": {"name": "...", "address": "...", "city": "...", "region": "...", "country": "NZ"},
  "categories": [...],
  "image": "...",
  "updated_at": "ISO-8601 Z"
}
"""

import json
import re
from datetime import datetime

import scrapy
from parsel import Selector


EVENT_PATH_PREFIX = "/events-hub/events/"
CURRENCY = "NZD"
# Accept "NZ$", "$", or literal "NZD" preceding amounts like 40 or 70.00
_RE_PRICE_NUM = re.compile(r"(?:NZD\s*)?(?:NZ\$|\$)\s*([0-9]{1,6}(?:\.[0-9]{1,2})?)")


# ------------------ tiny helpers ------------------

def _norm(s):
    if isinstance(s, list):
        s = " ".join(s)
    return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "")).strip()


def _jsonld_blocks(html_text):
    """Return a list of JSON-LD objects found on the page (best-effort)."""
    objs = []
    sel = Selector(text=html_text or "")
    for raw in sel.xpath("//script[@type='application/ld+json']/text()").getall():
        try:
            data = json.loads(raw.strip())
            if isinstance(data, list):
                objs.extend(data)
            else:
                objs.append(data)
        except Exception:
            continue
    return objs


def _find_event_ld(objs):
    """Pick the first JSON-LD object whose @type contains 'Event'."""
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


def _title(response, ev):
    return (
        (ev or {}).get("name")
        or _norm(response.css("h1::text").get())
        or _norm(response.css('meta[property="og:title"]::attr(content)').get())
        or _norm(response.css("title::text").get())
        or None
    )


def _description(response, ev):
    d = (ev or {}).get("description")
    if isinstance(d, str) and d.strip():
        return _norm(d)
    d = response.css('meta[name="description"]::attr(content)').get()
    if d:
        return _norm(d)
    # last resort: brief text from main content areas
    txt = response.css(".field--name-body *::text, article p::text").getall()
    return _norm(txt) or None


def _dates(response, ev):
    # Prefer JSON-LD ISO dates if present
    st = (ev or {}).get("startDate")
    en = (ev or {}).get("endDate")
    st_iso = st if isinstance(st, str) else None
    en_iso = en if isinstance(en, str) else None

    # Human-readable date text from common containers
    txt = response.css(
        "[class*='date'] ::text, .event__date ::text, .field--name-field-event-date *::text"
    ).getall()
    dates_text = _norm(txt) or None
    return st_iso, en_iso, dates_text


def _location(response, ev):
    name = address = city = region = None
    loc = (ev or {}).get("location") or {}

    if isinstance(loc, dict):
        name = loc.get("name") or None
        addr = loc.get("address") or {}
        if isinstance(addr, dict):
            address = addr.get("streetAddress") or None
            city = addr.get("addressLocality") or None
            region = addr.get("addressRegion") or None

    if not name:
        # light HTML fallback for venue name
        name = _norm(response.css("[class*='venue'] ::text, .event__venue ::text").get())

    return {
        "name": name or None,
        "address": address or None,
        "city": city or None,
        "region": region or None,
        "country": "NZ",
    }


def _image(response, ev):
    img = (ev or {}).get("image")
    if isinstance(img, str) and img.strip():
        return img
    if isinstance(img, list) and img and isinstance(img[0], str):
        return img[0]
    if isinstance(img, dict) and img.get("url"):
        return img["url"]
    return response.css('meta[property="og:image"]::attr(content)').get() or None


def _categories(response, ev):
    out = []
    for key in ("eventType", "category", "keywords"):
        v = (ev or {}).get(key)
        if isinstance(v, list):
            out.extend([_norm(x) for x in v if isinstance(x, str) and _norm(x)])
        elif isinstance(v, str) and _norm(v):
            out.append(_norm(v))
    if not out:
        # lightweight HTML fallback
        out = [x.strip() for x in response.css(".tags a::text, .field--name-field-category a::text").getall() if x.strip()]
    # de-dup, keep order
    seen, uniq = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return uniq


def _first_price_text(response):
    """Return a short price-ish snippet from the page (for price.text)."""
    # Look in obvious containers first …
    bits = response.css(
        "[class*='price'] ::text, .pricing ::text, .ticket-price ::text, [data-test*='price'] ::text"
    ).getall()
    joined = _norm(bits)
    # If nothing with currency, try page body and pick the first ‘NZ$ …’ slice
    hay = joined or _norm(response.xpath("//body//text()").getall())
    m = re.search(r"(NZD?\$[^|]{1,80})", hay, flags=re.I)  # keep it concise
    return _norm(m.group(1)) if m else (joined or None)


def _price(response, ev):
    # Numeric min/max from JSON‑LD offers (if present)
    nums = []
    currency = CURRENCY
    offers = (ev or {}).get("offers")
    candidates = []
    if isinstance(offers, dict):
        candidates = [offers]
    elif isinstance(offers, list):
        candidates = [o for o in offers if isinstance(o, dict)]

    for o in candidates:
        currency = o.get("priceCurrency") or currency
        for k in ("price", "lowPrice", "highPrice"):
            val = o.get(k)
            try:
                if val is None:
                    continue
                nums.append(float(str(val).replace(",", "")))
            except Exception:
                pass

    price_text = _first_price_text(response)
    # If still no nums, attempt regex over the snippet/body
    if not nums and price_text:
        nums = [float(m.group(1)) for m in _RE_PRICE_NUM.finditer(price_text)]
    if not nums:
        body = _norm(response.xpath("//body//text()").getall())
        nums = [float(m.group(1)) for m in _RE_PRICE_NUM.finditer(body)]

    free = False
    hay = (price_text or "") + " " + _norm(response.text)
    if re.search(r"\bfree\b", hay, re.I):
        free = True
        if not nums:
            nums = [0.0]

    return {
        "currency": currency or CURRENCY,
        "min": float(min(nums)) if nums else None,
        "max": float(max(nums)) if nums else None,
        "text": price_text,
        "free": bool(free),
    }


# ------------------ spider ------------------

class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["aucklandnz.com"]

    # Optional: override max listing pages (0 disables listing scan)
    #   scrapy crawl auckland_events -a pages_max=50
    def __init__(self, pages_max=40, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            self.pages_max = max(0, int(pages_max))
        except Exception:
            self.pages_max = 40

    def start_requests(self):
        # 1) Sitemap index (primary discovery)
        yield scrapy.Request(
            "https://www.aucklandnz.com/sitemap.xml",
            callback=self.parse_sitemap_index,
            dont_filter=True,
        )

        # 2) Plain listing pages (no JS) as a safety net
        if self.pages_max > 0:
            base = "https://www.aucklandnz.com/events-hub/events"
            yield scrapy.Request(base, callback=self.parse_listing, dont_filter=True)
            for i in range(1, self.pages_max + 1):
                yield scrapy.Request(f"{base}?page={i}", callback=self.parse_listing, dont_filter=True)

    # ---- sitemap ----
    def parse_sitemap_index(self, response):
        # Follow child sitemaps that look event-related; if unsure, follow all
        for loc in response.xpath("//loc/text()").getall():
            if "event" in loc or "events" in loc:
                yield scrapy.Request(loc, callback=self.parse_sitemap_leaf, dont_filter=True)
            else:
                # Some sites keep events in generic child sitemaps—follow anyway
                yield scrapy.Request(loc, callback=self.parse_sitemap_leaf, dont_filter=True)

    def parse_sitemap_leaf(self, response):
        # urlset → url → loc
        for loc in response.xpath("//url/loc/text()").getall():
            if EVENT_PATH_PREFIX in loc:
                yield scrapy.Request(loc, callback=self.parse_event, dont_filter=True)

        # In case this was another sitemap index, recurse (harmless if not)
        for child in response.xpath("//sitemap/loc/text()").getall():
            yield scrapy.Request(child, callback=self.parse_sitemap_leaf, dont_filter=True)

    # ---- listing (no JS) ----
    def parse_listing(self, response):
        for href in response.css(f'a[href^="{EVENT_PATH_PREFIX}"]::attr(href)').getall():
            yield response.follow(href, callback=self.parse_event, dont_filter=True)

        # Follow obvious pagination if present
        for nxt in response.css('a[rel="next"]::attr(href), a.pager__item--next::attr(href)').getall():
            yield response.follow(nxt, callback=self.parse_listing, dont_filter=True)

    # ---- detail ----
    def parse_event(self, response):
        objs = _jsonld_blocks(response.text)
        ev = _find_event_ld(objs)

        title = _title(response, ev)
        desc = _description(response, ev)
        st, en, dates_text = _dates(response, ev)
        location = _location(response, ev)
        price = _price(response, ev)
        image = _image(response, ev)
        cats = _categories(response, ev)

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
        yield item
