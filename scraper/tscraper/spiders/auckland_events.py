import re
from urllib.parse import urljoin, urlparse

import scrapy
from w3lib.html import remove_tags


EVENT_LISTING_START_URLS = [
    # broad “events” landing & groupings that contain event cards we can follow
    "https://heartofthecity.co.nz/auckland-events",
    "https://heartofthecity.co.nz/auckland-events/this-month",
    "https://heartofthecity.co.nz/auckland-events/this-week",
    "https://heartofthecity.co.nz/auckland-events/this-weekend",
    "https://heartofthecity.co.nz/auckland-events/today",
    "https://heartofthecity.co.nz/auckland-events/tomorrow",
    "https://heartofthecity.co.nz/auckland-events/next-7-days",
    "https://heartofthecity.co.nz/auckland-events/next-30-days",
    # category hubs that regularly surface detail pages
    "https://heartofthecity.co.nz/auckland-events/music-events",
    "https://heartofthecity.co.nz/auckland-events/theatre",
    "https://heartofthecity.co.nz/auckland-events/exhibitions",
    "https://heartofthecity.co.nz/auckland-events/festivals",
    "https://heartofthecity.co.nz/auckland-events/food-drink-events",
    "https://heartofthecity.co.nz/auckland-events/sports-events",
]

AGGREGATOR_SLUGS = {
    "today", "tomorrow", "this-week", "this-weekend", "this-month",
    "next-7-days", "next-30-days",
    "music-events", "theatre", "exhibitions", "festivals",
    "food-drink-events", "sports-events", "event", "search", "events",
}

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)


class AucklandEventsSpider(scrapy.Spider):
    """
    Crawl Heart of the City event detail pages, e.g.
      https://heartofthecity.co.nz/auckland-events/giant-christmas-tree-lighting
      https://heartofthecity.co.nz/auckland-events/pop-present-american-art-virginia-museum-fine-arts
      https://heartofthecity.co.nz/auckland-events/metallica-m72-pop-shop
    and write JSONL to data/Events.jsonl
    """
    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]
    start_urls = EVENT_LISTING_START_URLS

    custom_settings = {
        # keep it polite, avoid antibot issues, and don’t roam the whole site
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": True,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.8,
        "CONCURRENT_REQUESTS": 4,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.5,
        "AUTOTHROTTLE_MAX_DELAY": 6.0,
        "DNS_TIMEOUT": 20,
        "CLOSESPIDER_PAGECOUNT": 3000,  # safety valve
        # write/append directly to the unified file you requested
        "FEEDS": {
            "data/Events.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
    }

    def parse(self, response):
        # 1) detail page links that look like /auckland-events/<slug>
        for href in response.css('a[href^="/auckland-events/"]::attr(href)').getall():
            url = urljoin(response.url, href.split("#")[0])
            p = urlparse(url)
            parts = [x for x in p.path.split("/") if x]
            if len(parts) == 2 and parts[0] == "auckland-events" and parts[1] not in AGGREGATOR_SLUGS:
                yield response.follow(url, callback=self.parse_event, headers={"Referer": response.url})

        # 2) follow other listing pages within /auckland-events/* only
        for href in response.css('a[href*="/auckland-events/"]::attr(href)').getall():
            url = urljoin(response.url, href.split("#")[0])
            p = urlparse(url)
            parts = [x for x in p.path.split("/") if x]
            if parts and parts[0] == "auckland-events":
                # skip obvious aggregators & duplicates
                if len(parts) == 1 or (len(parts) == 2 and parts[1] in AGGREGATOR_SLUGS):
                    yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

        # 3) very simple pagination (rare; some lists use ?page=)
        for href in response.css('a[href*="?page="]::attr(href)').getall():
            url = urljoin(response.url, href)
            yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

    # -----------------------
    # helpers
    # -----------------------
    @staticmethod
    def _clean_text_list(texts):
        return [re.sub(r"\s+", " ", t).strip() for t in texts if t and re.sub(r"\s+", " ", t).strip()]

    @staticmethod
    def _extract_price(text):
        # returns min_price, max_price, price_text
        if not text:
            return None, None, ""
        price_text = " ".join(AucklandEventsSpider._clean_text_list([text]))
        amounts = [float(x.replace(",", "")) for x in re.findall(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)", price_text)]
        if amounts:
            return min(amounts), max(amounts), price_text
        return None, None, price_text

    def parse_event(self, response):
        # guard: must look like a detail page
        if not response.css("h1"):
            return

        title = (response.css("h1::text").get() or "").strip()

        # venue is usually the first link after H1 (e.g., Spark Arena)
        venue = (response.xpath("//h1/following::a[1]/text()").get() or "").strip()
        if venue and len(venue) > 120:
            venue = ""

        # date block: text following the label “Dates”
        date_block = " ".join(self._clean_text_list(
            response.xpath("//*[normalize-space()='Dates']/following::*[1]//text()").getall()
        ))
        # fallback: sometimes the date is near the top hero area
        if not date_block:
            date_block = " ".join(self._clean_text_list(
                response.css(".node--type-event .field--name-field-date *::text, .content .date *::text").getall()
            ))

        # description: take a few paragraphs from body areas
        description = " ".join(self._clean_text_list(
            response.css(
                ".field--name-field-intro p::text, .field--name-body p::text, .node__content p::text"
            ).getall()[:6]
        ))

        # price sniff: look for $... or 'Free' anywhere in relevant content blocks
        price_scope = " ".join(self._clean_text_list(
            response.xpath(
                "//*[contains(., '$') or contains(translate(., 'FREE', 'free'), 'free')]//text()"
            ).getall()
        )) or " ".join(self._clean_text_list(response.css(".node__content *::text").getall()))
        pmin, pmax, ptxt = self._extract_price(price_scope)
        is_free = (" free " in f" {price_scope.lower()} ")

        # images
        images = []
        og = response.css('meta[property="og:image"]::attr(content)').get()
        if og:
            images.append(og)
        images.extend([urljoin(response.url, s) for s in response.css("article img::attr(src), .content img::attr(src)").getall()])
        # de-dup while keeping order
        seen = set()
        images = [x for x in images if not (x in seen or seen.add(x))]

        # booking / more info
        booking_url = None
        for sel in [
            "//a[contains(translate(., 'BUY', 'buy'), 'buy') and contains(translate(., 'TICKET', 'ticket'), 'ticket')]/@href",
            "//a[contains(translate(., 'BOOK', 'book'), 'book')]/@href",
            "//a[contains(translate(., 'MORE INFO', 'more info'), 'more info')]/@href",
        ]:
            href = response.xpath(sel).get()
            if href:
                booking_url = urljoin(response.url, href)
                break

        # categories from breadcrumb chips near the bottom/top
        categories = self._clean_text_list(response.css("a[href*='/auckland-events/']::text, .tags a::text").getall())
        if not categories:
            categories = ["Events"]

        record = {
            "id": f"{abs(hash(response.url)) & 0xFFFFFFFFFFFF:016x}",
            "record_type": "event",
            "name": title,
            "description": description or None,
            "categories": categories,
            "tags": [],
            "url": response.url,
            "source": "heartofthecity.co.nz",
            "images": images[:10],
            "location": {
                "name": venue or None,
                "address": None,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": {
                "currency": "NZD",
                "min": pmin if pmin is not None else (0.0 if is_free else None),
                "max": pmax if pmax is not None else (0.0 if is_free else None),
                "text": ptxt or None,
                "free": is_free,
            },
            "booking": {
                "url": booking_url,
                "email": None,
                "phone": None,
            },
            "event_dates": {
                "start": None,
                "end": None,
                "timezone": "Pacific/Auckland",
                "text": date_block or None,  # keep raw text for later parsing if needed
            },
            "opening_hours": None,
            "operating_months": None,
            "data_collected_at": self._now_iso(response),
            "text_for_embedding": self._embed_text(title, description, venue, date_block, ptxt),
        }
        yield record

    @staticmethod
    def _now_iso(response):
        # avoid importing datetime utils everywhere
        import datetime, pytz
        return datetime.datetime.now(pytz.UTC).isoformat()

    @staticmethod
    def _embed_text(title, description, venue, date_block, price_text):
        bits = [title or "", description or "", venue or "", date_block or "", price_text or ""]
        return " | ".join([remove_tags(b).strip() for b in bits if b])
