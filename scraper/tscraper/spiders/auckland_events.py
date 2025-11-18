import json
import re
from urllib.parse import urljoin, urlparse
from datetime import datetime, timezone
from email.utils import format_datetime

import scrapy
from w3lib.html import remove_tags

# Listing pages to seed from
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


class AucklandEventsSpider(scrapy.Spider):
    """
    Heart of the City — Events spider (LEAN OUTPUT)

    Emits ONLY the following fields per record:
      id, record_type, name, url, source, location, price, event_dates,
      opening_hours, operating_months, data_collected_at
    """

    name = "auckland_events_lean"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]
    start_urls = START_URLS

    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": True,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.6,
        "CONCURRENT_REQUESTS": 4,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.5,
        "AUTOTHROTTLE_MAX_DELAY": 6.0,
        "CLOSESPIDER_PAGECOUNT": 3000,
        "FEEDS": {
            "data/Events.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
    }

    # --------------- listing ---------------

    def parse(self, response):
        # detail pages look like /auckland-events/<slug>
        for href in response.css('a[href^="/auckland-events/"]::attr(href)').getall():
            url = urljoin(response.url, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if len(parts) == 2 and parts[0] == "auckland-events" and parts[1] not in AGGREGATOR_TAILS:
                yield response.follow(url, callback=self.parse_event, headers={"Referer": response.url})

        # keep exploring inside the events section only
        for href in response.css('a[href*="/auckland-events/"]::attr(href)').getall():
            url = urljoin(response.url, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if parts and parts[0] == "auckland-events":
                if len(parts) == 1 or (len(parts) == 2 and parts[1] in AGGREGATOR_TAILS):
                    yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

        # simple pagination
        for href in response.css('a[href*="?page="]::attr(href)').getall():
            yield response.follow(urljoin(response.url, href), callback=self.parse, headers={"Referer": response.url})

    # --------------- helpers ---------------

    @staticmethod
    def _clean(s: str) -> str:
        if not s:
            return ""
        s = remove_tags(s)
        s = re.sub(r"\s+", " ", s).strip()
        return s

    @staticmethod
    def _only_http_urls(urls):
        out, seen = [], set()
        for u in urls:
            if not u or not u.startswith("http"):
                continue
            if u in seen:
                continue
            seen.add(u)
            out.append(u)
        return out[:10]

    def _event_article(self, response):
        # best effort to scope to the article body only
        node = response.css("article.node--type-event")
        if not node:
            node = response.css("article")
        return node if node else response

    def _from_ldjson(self, response):
        """Try to pull clean fields from JSON-LD Event blocks."""
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
                if b.get("@type") in ("Event", ["Event"]):
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
                    # offers / price
                    offers = b.get("offers")
                    if isinstance(offers, dict):
                        out.setdefault("priceCurrency", offers.get("priceCurrency"))
                        out.setdefault("price", offers.get("price"))
                    elif isinstance(offers, list) and offers:
                        cur = offers[0].get("priceCurrency")
                        prc = offers[0].get("price")
                        out.setdefault("priceCurrency", cur)
                        out.setdefault("price", prc)
        return out

    @staticmethod
    def _split_sentences(text: str):
        # Split on sentence-ish boundaries while keeping it cheap
        return [t.strip() for t in re.split(r"[\n\r•\u2022]+|(?<=\.)\s+", text) if t.strip()]

    def _extract_price(self, scope, ld):
        """Return a compact price object, filtering car-park/transport promos."""
        currency = "NZD"

        # Prefer JSON-LD if present and sane
        if ld.get("price"):
            try:
                val = float(str(ld["price"]).replace(",", ""))
                if 0 <= val < 2000:
                    return {
                        "currency": ld.get("priceCurrency") or currency,
                        "min": val,
                        "max": val,
                        "text": f"${val:g}",
                        "free": val == 0.0,
                    }
            except Exception:
                pass

        # Otherwise look for dollar amounts or 'free' in the article ONLY
        raw = " ".join(
            scope.xpath(
                ".//*[contains(text(),'$') or contains(translate(text(),'FREE','free'),'free')]//text()"
            ).getall()
        )
        raw = self._clean(raw)

        # Filter out obvious non-ticketing promos
        banned = (
            "parking", "car park", "carpark", "public transport", "transport",
            "kids ride free", "ride free", "evening rate", "weekend rate",
        )
        sentences = [s for s in self._split_sentences(raw) if s and not any(b in s.lower() for b in banned)]
        filtered_text = " ".join(sentences)

        amounts = [
            float(m.replace(",", ""))
            for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", filtered_text)
        ]
        amounts = [a for a in amounts if 0 <= a < 2000]

        is_free = " free " in f" {filtered_text.lower()} "
        if amounts:
            return {
                "currency": currency,
                "min": min(amounts),
                "max": max(amounts),
                "text": filtered_text[:140] or None,
                "free": is_free and min(amounts) == 0.0,
            }
        if is_free:
            return {"currency": currency, "min": 0.0, "max": 0.0, "text": "Free", "free": True}
        return {"currency": currency, "min": None, "max": None, "text": None, "free": False}

    def _extract_dates(self, scope, ld):
        # JSON-LD first
        start = ld.get("startDate") or None
        end = ld.get("endDate") or None
