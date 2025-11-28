import re
import json
from urllib.parse import urljoin, urlparse
from datetime import datetime, timezone

import scrapy

# -------------------------------------------------
# Config (aggregator-first; no Playwright required)
# -------------------------------------------------

START_URLS = [
    "https://heartofthecity.co.nz/auckland-events",
    "https://heartofthecity.co.nz/auckland-events/this-month",
    "https://heartofthecity.co.nz/auckland-events/this-week",
    "https://heartofthecity.co.nz/auckland-events/this-weekend",
    "https://heartofthecity.co.nz/auckland-events/today",
    "https://heartofthecity.co.nz/auckland-events/tomorrow",
    "https://heartofthecity.co.nz/auckland-events/next-7-days",
    "https://heartofthecity.co.nz/auckland-events/next-30-days",
    "https://heartofthecity.co.nz/auckland-events/music-events",
    "https://heartofthecity.co.nz/auckland-events/theatre",
    "https://heartofthecity.co.nz/auckland-events/exhibitions",
    "https://heartofthecity.co.nz/auckland-events/festivals",
    "https://heartofthecity.co.nz/auckland-events/food-drink-events",
    "https://heartofthecity.co.nz/auckland-events/sports-events",
]

# Aggregator/listing tails we should not treat as detail pages
AGGREGATOR_TAILS = {
    "today",
    "tomorrow",
    "this-week",
    "this-weekend",
    "this-month",
    "next-7-days",
    "next-30-days",
    "music-events",
    "theatre",
    "exhibitions",
    "festivals",
    "food-drink-events",
    "sports-events",
    "events",
    "event",
    "search",
}

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)

# -------------------- project helpers --------------------

try:
    # Preferred package path
    from tscraper.utils import (
        parse_jsonld, price_from_jsonld, parse_prices, nz_months, clean, filter_links
    )
    from tscraper.items import make_id
except Exception:
    # Fallback to project root (repo layout differences)
    from utils import (
        parse_jsonld, price_from_jsonld, parse_prices, nz_months, clean, filter_links
    )
    from items import make_id


class AucklandEventsSpider(scrapy.Spider):
    """
    Heart of the City — Events spider (plain Scrapy HTTP, aggregator-first).

    Emits ONLY the requested fields:
      id, record_type, name, categories, url, source,
      location, price, opening_hours, operating_months, data_collected_at
    """

    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]
    start_urls = START_URLS

    # Disable Playwright for this spider by restoring default HTTP handlers.
    # Use realistic browser UA/headers; avoid caching challenge pages.
    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": False,
        "COOKIES_ENABLED": False,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.5,
        "CONCURRENT_REQUESTS": 6,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.25,
        "AUTOTHROTTLE_MAX_DELAY": 4.0,
        "DEFAULT_REQUEST_HEADERS": {
            "Accept-Language": "en-NZ,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        "DEPTH_LIMIT": 4,
        "CLOSESPIDER_PAGECOUNT": 5000,
        "HTTPCACHE_ENABLED": False,
        "DOWNLOAD_HANDLERS": {
            "http": "scrapy.core.downloader.handlers.http.HTTPDownloadHandler",
            "https": "scrapy.core.downloader.handlers.http.HTTPDownloadHandler",
        },
        "LOG_LEVEL": "INFO",
    }

    # -------------------- listing --------------------

    def start_requests(self):
        for u in self.start_urls:
            yield scrapy.Request(
                u,
                callback=self.parse,
                headers={"Referer": "https://heartofthecity.co.nz/"},
                meta={"playwright": False, "handle_httpstatus_list": [403, 429, 503]},
                dont_filter=True,
            )

    def parse(self, response):
        if response.status in (403, 429, 503):
            self.logger.warning("Blocked (%s) at %s", response.status, response.url)
            # Persist body so CI artifact step can help debugging
            try:
                with open("hotc_blocked_http.html", "w", encoding="utf-8") as f:
                    f.write(response.text)
            except Exception:
                pass
            return

        base = response.url

        # Detail pages look like /auckland-events/<slug>
        for href in response.css('a[href^="/auckland-events/"]::attr(href)').getall():
            url = urljoin(base, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if parts and parts[0] == "auckland-events":
                if len(parts) == 2 and parts[1] not in AGGREGATOR_TAILS:
                    yield response.follow(
                        url,
                        callback=self.parse_event,
                        headers={"Referer": base},
                        meta={"playwright": False, "handle_httpstatus_list": [403, 429, 503]},
                    )

        # Explore within the events section only (aggregator/category pages)
        for href in response.css('a[href*="/auckland-events/"]::attr(href)').getall():
            url = urljoin(base, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if parts and parts[0] == "auckland-events":
                if len(parts) == 1 or (len(parts) == 2 and parts[1] in AGGREGATOR_TAILS):
                    yield response.follow(
                        url,
                        callback=self.parse,
                        headers={"Referer": base},
                        meta={"playwright": False, "handle_httpstatus_list": [403, 429, 503]},
                    )

        # Simple pagination (server-side "?page=")
        for href in response.css('a[href*="?page="]::attr(href)').getall():
            yield response.follow(
                urljoin(base, href),
                callback=self.parse,
                headers={"Referer": base},
                meta={"playwright": False, "handle_httpstatus_list": [403, 429, 503]},
            )

    # -------------------- helpers --------------------

    def _extract_categories(self, response):
        # tags + breadcrumb categories (prune generic crumbs)
        cats = []
        cats.extend([clean(x) for x in response.css("a[rel='tag']::text").getall() if clean(x)])
        cats.extend([clean(x) for x in response.css(".field--name-field-categories a::text").getall() if clean(x)])
        cats.extend([clean(x) for x in response.css("nav.breadcrumb a::text").getall() if clean(x)])
        cats = [c for c in cats if c and c.lower() not in {"home", "events", "what's on", "what’s on"}]
        # de-duplicate preserving order
        seen = set()
        out = []
        for c in cats:
            if c not in seen:
                out.append(c)
                seen.add(c)
        return out[:8]

    def _extract_location(self, response, jsonld_objs):
        loc = {
            "name": None,
            "address": None,
            "city": "Auckland",
            "region": "Auckland",
            "country": "New Zealand",
            "latitude": None,
            "longitude": None,
        }
        try:
            for obj in (jsonld_objs or []):
                v = obj.get("location") or {}
                if isinstance(v, dict):
                    loc["name"] = loc["name"] or clean(v.get("name"))
                    addr = v.get("address") or {}
                    if isinstance(addr, dict):
                        addr_text = ", ".join(
                            [addr.get(k) for k in ["streetAddress", "addressLocality", "postalCode"] if addr.get(k)]
                        )
                        loc["address"] = loc["address"] or clean(addr_text)
                        loc["city"] = clean(addr.get("addressLocality")) or loc["city"]
                        loc["region"] = clean(addr.get("addressRegion")) or loc["region"]
                        loc["country"] = clean(addr.get("addressCountry")) or loc["country"]
                    geo = v.get("geo") or {}
                    if isinstance(geo, dict):
                        loc["latitude"] = geo.get("latitude") or loc["latitude"]
                        loc["longitude"] = geo.get("longitude") or loc["longitude"]
                    break
        except Exception:
            pass

        if not loc.get("name"):
            loc["name"] = clean(
                response.css(
                    ".field--name-field-venue .field__item::text, .event-venue::text, [class*='location'] ::text"
                ).get()
            )
        if not loc.get("address"):
            loc["address"] = clean(
                response.css(".field--name-field-address .field__item::text, [class*='address'] ::text").get()
            )

        return loc

    def _extract_price(self, response, jsonld_objs):
        # JSON-LD price if available
        p, ccy, _ = price_from_jsonld(jsonld_objs)
        if isinstance(p, (int, float)):
            return {
                "currency": (ccy or "NZD"),
                "min": float(p),
                "max": float(p),
                "text": None,
                "free": (float(p) == 0.0),
            }

        # Visible price text (common blocks)
        price_text = " ".join(response.css("[class*='price'], .price ::text").getall()) or \
                     " ".join(response.xpath("//*[contains(translate(text(),'PRICE','price'),'price')]/text()").getall())
        if price_text:
            return parse_prices(price_text)

        # Tickets block nearby
        tix_text = " ".join(
            response.xpath(
                "//*[contains(translate(text(),'TICKETS','tickets'),'tickets')]/following::text()[position()<5]"
            ).getall()
        )
        if tix_text:
            return parse_prices(tix_text)

        return {"currency": "NZD", "min": None, "max": None, "text": None, "free": False}

    def _opening_hours_text(self, response):
        bits = []
        bits.extend([clean(x) for x in response.css("time::attr(datetime), time::text").getall() if clean(x)])
        bits.extend(
            [
                clean(x)
                for x in response.css(
                    ".field--name-field-date .field__item::text, .event-date::text, .event-time::text"
                ).getall()
                if clean(x)
            ]
        )
        bits.extend(
            [clean(x) for x in response.xpath("//dl/dt[contains(.,'Time')]/following-sibling::dd[1]//text()").getall() if clean(x)]
        )
        bits.extend(
            [clean(x) for x in response.xpath("//dl/dt[contains(.,'Hours')]/following-sibling::dd[1]//text()").getall() if clean(x)]
        )
        bits = [b for b in bits if b]
        if bits:
            s = re.sub(r"\s+", " ", " | ".join(bits)).strip()
            return s[:400]
        return None

    def _operating_months(self, response):
        blob = " ".join(response.xpath("//body//text()").getall())
        months = nz_months(blob)
        return months

    # -------------------- detail --------------------

    def parse_event(self, response):
        if response.status in (403, 429, 503):
            self.logger.warning("Blocked (%s) at detail: %s", response.status, response.url)
            return

        jsonld_objs = parse_jsonld(response.text)

        name = clean(response.css("h1::text").get()) or clean(
            response.css('meta[property="og:title"]::attr(content)').get()
        )
        if not name:
            try:
                for obj in (jsonld_objs or []):
                    n = obj.get("name")
                    if isinstance(n, str) and n.strip():
                        name = n.strip()
                        break
            except Exception:
                pass
        if not name:
            self.logger.debug("No title on %s", response.url)
            return

        url = response.url
        record = {
            "id": make_id(url),
            "record_type": "event",
            "name": name,
            "categories": self._extract_categories(response),
            "url": url,
            "source": "heartofthecity.co.nz",
            "location": self._extract_location(response, jsonld_objs),
            "price": self._extract_price(response, jsonld_objs),
            "opening_hours": self._opening_hours_text(response),
            "operating_months": self._operating_months(response),
            "data_collected_at": (
                response.headers.get("Date", b"").decode().strip()
                or datetime.now(timezone.utc).isoformat()
            ),
        }

        # Emit ONLY the requested keys
        yield {
            k: record.get(k)
            for k in [
                "id",
                "record_type",
                "name",
                "categories",
                "url",
                "source",
                "location",
                "price",
                "opening_hours",
                "operating_months",
                "data_collected_at",
            ]
        }
