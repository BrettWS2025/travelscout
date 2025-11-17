import json
import re
from urllib.parse import urljoin, urlparse

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

ALLOWED_CATEGORIES = {
    "Exhibitions", "Music Events", "Theatre", "Festivals",
    "Sports Events", "Food & Drink Events"
}

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)


class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]
    start_urls = START_URLS

    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": True,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.7,
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
    def _shorten(s: str, n: int = 600) -> str:
        s = (s or "").strip()
        return (s[: n - 1] + "…") if len(s) > n else s

    @staticmethod
    def _only_http_urls(urls):
        out, seen = [], set()
        for u in urls:
            if not u:
                continue
            if not u.startswith("http"):
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
                            out.setdefault("address", " ".join(filter(None, [
                                addr.get("streetAddress"),
                                addr.get("addressLocality"),
                                addr.get("postalCode")
                            ])).strip() or None)
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

    def _extract_categories(self, scope):
        txt = " ".join(scope.css(".meta__details *::text, .node__content *::text").getall())
        cats = []
        for label in ALLOWED_CATEGORIES:
            if re.search(rf"\b{re.escape(label)}\b", txt, re.I):
                cats.append(label)
        return cats or ["Events"]

    def _extract_price(self, scope, ld):
        # Prefer JSON-LD if present and looks sane
        currency = "NZD"
        if ld.get("price"):
            try:
                val = float(str(ld["price"]).replace(",", ""))
                if 0 <= val < 2000:
                    return {"currency": ld.get("priceCurrency") or currency,
                            "min": val, "max": val, "text": f"${val:g}", "free": val == 0.0}
            except Exception:
                pass

        # Otherwise look for $ amounts inside the article ONLY (avoid header/footer)
        text = " ".join(scope.xpath(".//*[contains(text(),'$') or contains(translate(text(),'FREE','free'),'free')]//text()").getall())
        text = self._clean(text)
        # only values that have a leading $
        amounts = [float(m.replace(",", "")) for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", text)]
        amounts = [a for a in amounts if 0 <= a < 2000]  # sanity cap
        is_free = " free " in f" {text.lower()} "
        if amounts:
            return {"currency": currency, "min": min(amounts), "max": max(amounts),
                    "text": self._shorten(text, 140) or None, "free": is_free and min(amounts) == 0.0}
        if is_free:
            return {"currency": currency, "min": 0.0, "max": 0.0, "text": "Free", "free": True}
        return {"currency": currency, "min": None, "max": None, "text": None, "free": False}

    def _extract_dates(self, scope, ld):
        # Raw date string near the "Dates" label (inside article only)
        date_text = self._clean(" ".join(
            scope.xpath(".//*[normalize-space()='Dates']/following::*[1]//text()").getall()
        ))
        # Fall back to obvious single-line date near the top
        if not date_text:
            date_text = self._clean(" ".join(
                scope.css(".node__content .date *::text").getall()
            ))

        start = ld.get("startDate") or None
        end = ld.get("endDate") or None
        return {
            "start": start,
            "end": end,
            "timezone": "Pacific/Auckland",
            "text": date_text or None,
        }

    # --------------- detail ---------------

    def parse_event(self, response):
        article = self._event_article(response)
        ld = self._from_ldjson(response)

        # title
        title = self._clean(article.css("h1::text").get())
        if not title:
            title = self._clean(response.css('meta[property="og:title"]::attr(content)').get())
        if not title:
            title = ld.get("name") or ""
        if not title:
            return  # no valid event

        # venue: first sensible link/text in the meta area
        venue = None
        for t in article.xpath(".//h1/following::*[self::a or self::span][position()<=8]/text()").getall():
            t = self._clean(t)
            if not t:
                continue
            if t.lower() in {"add to favourites", "show on map", "book tickets", "more info"}:
                continue
            if len(t) <= 80:
                venue = t
                break
        if not venue:
            venue = ld.get("venue") or None

        # description: intro/body paragraphs (scoped + short)
        desc = " ".join([self._clean(x) for x in article.css(
            ".field--name-field-intro p::text, .field--name-body p::text, .node__content p::text"
        ).getall()[:3]])
        desc = self._shorten(desc, 700) or None
        if not desc:
            desc = self._clean(response.css('meta[name="description"]::attr(content)').get()) or None

        # categories (whitelist)
        categories = self._extract_categories(article)

        # images (http/https only)
        imgs = []
        og = response.css('meta[property="og:image"]::attr(content)').get()
        if og:
            imgs.append(og)
        imgs += [urljoin(response.url, s) for s in article.css("img::attr(src)").getall()]
        images = self._only_http_urls(imgs)

        # booking link (inside article only)
        booking = None
        for xp in [
            ".//a[contains(translate(.,'BUY','buy'),'buy') and contains(translate(.,'TICKET','ticket'),'ticket')]/@href",
            ".//a[contains(translate(.,'BOOK','book'),'book')]/@href",
            ".//a[contains(translate(.,'MORE INFO','more info'),'more info')]/@href",
        ]:
            href = article.xpath(xp).get()
            if href:
                booking = urljoin(response.url, href)
                break

        # price + dates
        price = self._extract_price(article, ld)
        event_dates = self._extract_dates(article, ld)

        # build record (lean!)
        record = {
            "id": f"{abs(hash(response.url)) & 0xFFFFFFFFFFFF:016x}",
            "record_type": "event",
            "name": title,
            "description": desc,
            "categories": categories,
            "tags": [],
            "url": response.url,
            "source": "heartofthecity.co.nz",
            "images": images,
            "location": {
                "name": venue or None,
                "address": ld.get("address") or None,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": price,
            "booking": {"url": booking, "email": None, "phone": None},
            "event_dates": event_dates,
            "opening_hours": None,
            "operating_months": None,
            "data_collected_at": response.headers.get("Date", b"").decode() or None,
            "text_for_embedding": " | ".join([x for x in [
                title, (desc or "")[:220], venue or "", (event_dates.get("text") or "")[:120], price.get("text") or ""
            ] if x]),
        }
        yield record
