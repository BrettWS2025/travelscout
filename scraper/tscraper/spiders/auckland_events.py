import json
import re
from urllib.parse import urljoin, urlparse
from datetime import datetime, timezone
from email.utils import format_datetime

import scrapy
from w3lib.html import remove_tags


# -------------------- config --------------------

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

# things like category aggregators / filters we should *not* treat as detail pages
AGGREGATOR_TAILS = {
    "today", "tomorrow", "this-week", "this-weekend", "this-month",
    "next-7-days", "next-30-days",
    "music-events", "theatre", "exhibitions", "festivals",
    "food-drink-events", "sports-events", "events", "event", "search",
}

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)

# -------------------- spider --------------------


class AucklandEventsSpider(scrapy.Spider):
    """
    Heart of the City — Events spider (LEAN OUTPUT)

    Emits ONLY the following fields:
      id, record_type, name, url, source, location, price, event_dates,
      opening_hours, operating_months, data_collected_at
    """

    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]
    start_urls = START_URLS

    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        # Turn robots off here; if you must obey, set to True.
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
        "CLOSESPIDER_PAGECOUNT": 5000,
        "FEEDS": {
            "data/Events.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
        "LOG_LEVEL": "INFO",
    }

    # --------------- listing ---------------

    def parse(self, response):
        base = response.url
        # 1) detail pages under /auckland-events/<slug>
        for href in response.css('a[href^="/auckland-events/"]::attr(href)').getall():
            url = urljoin(base, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if parts and parts[0] == "auckland-events":
                # accept <slug> and ignore aggregator tails
                if len(parts) == 2 and parts[1] not in AGGREGATOR_TAILS:
                    yield response.follow(
                        url,
                        callback=self.parse_event,
                        headers={"Referer": base},
                    )

        # 2) keep exploring the events section for pagination/category pages
        for href in response.css('a[href*="/auckland-events/"]::attr(href)').getall():
            url = urljoin(base, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if parts and parts[0] == "auckland-events":
                if len(parts) == 1 or (len(parts) == 2 and parts[1] in AGGREGATOR_TAILS):
                    yield response.follow(
                        url,
                        callback=self.parse,
                        headers={"Referer": base},
                    )

        # 3) simple pagination ?page=N
        for href in response.css('a[href*="?page="]::attr(href)').getall():
            yield response.follow(
                urljoin(base, href),
                callback=self.parse,
                headers={"Referer": base},
            )

    # --------------- helpers ---------------

    @staticmethod
    def _clean(s: str) -> str:
        if not s:
            return ""
        s = remove_tags(s)
        s = re.sub(r"\s+", " ", s).strip()
        return s

    def _event_article(self, response):
        node = response.css("article.node--type-event")
        if not node:
            node = response.css("article")
        return node if node else response

    def _from_ldjson(self, response):
        """Pull clean fields from JSON-LD Event blocks if present."""
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
                    # location
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
                    # offers / price (use the first)
                    offers = b.get("offers")
                    if isinstance(offers, dict):
                        out.setdefault("priceCurrency", offers.get("priceCurrency"))
                        out.setdefault("price", offers.get("price"))
                    elif isinstance(offers, list) and offers:
                        out.setdefault("priceCurrency", offers[0].get("priceCurrency"))
                        out.setdefault("price", offers[0].get("price"))
        return out

    @staticmethod
    def _split_sentences(text: str):
        return [t.strip() for t in re.split(r"[\n\r•\u2022]+|(?<=\.)\s+", text) if t.strip()]

    def _extract_price(self, s
