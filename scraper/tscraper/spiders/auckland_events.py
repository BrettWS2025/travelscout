import re
from urllib.parse import urljoin, urlparse
from datetime import datetime, time
import scrapy
from dateutil import parser as dp

from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_date_range, parse_prices, build_embedding_text

BASE = "https://heartofthecity.co.nz"
ROOT = f"{BASE}/auckland-events"

# Explicitly treat these as listing/category pages, NOT detail
CATEGORY_SLUGS = {
    "today", "tomorrow", "this-week", "this-weekend", "this-month",
    "whats-on-this-month", "food-drink-events", "food-and-drink-events",
    "theatre", "exhibitions", "music-events", "festivals", "sports-events",
    "family", "free"
}

def is_event_detail_path(path: str) -> bool:
    # True detail looks like /auckland-events/<slug> (exactly 2 segments)
    seg = path.strip("/").split("/")
    if len(seg) != 2 or seg[0] != "auckland-events":
        return False
    tail = seg[1]
    return tail not in CATEGORY_SLUGS and tail != "" and "-" in tail  # sluggy tail

def is_event_detail_page(response: scrapy.http.Response) -> bool:
    """
    Defensive check so we never emit category pages.
    Consider it a detail page if we see a Dates label or a ticket CTA,
    or Drupal event node classes.
    """
    if response.xpath("//*[normalize-space()='Dates']"):
        return True
    if response.xpath("//a[contains(.,'Book Tickets') or contains(.,'Buy Tickets')]"):
        return True
    if response.xpath("//*[contains(@class,'node--type-event') or contains(@class,'node--event')]"):
        return True
    # As a last resort, look for a time separator pattern near the top (e.g. "18 NOV, 2025 | 7pm")
    maybe = clean(" ".join(response.xpath("(//h1/following::p | //h1/following::div)[position()<=6]//text()").getall()))
    return bool(maybe and "|" in maybe and re.search(r"\b\d{1,2}\s?[AP]M\b", maybe, re.I))

class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "DEPTH_LIMIT": 2,
        "CLOSESPIDER_PAGECOUNT": 3000,
        "LOG_LEVEL": "INFO",
        "DEFAULT_REQUEST_HEADERS": {
            "User-Agent": "TravelScoutScraper/1.0 (+https://airnz.co.nz)",
            "Accept-Language": "en-NZ,en;q=0.9",
        },
    }

    def __init__(self, test_url: str = None, **kwargs):
        super().__init__(**kwargs)
        self.test_url = test_url

    def start_requests(self):
        # Single-page test (fastest way to verify selectors)
        if self.test_url:
            yield scrapy.Request(self.test_url, callback=self.parse_event)
            return

        # Crawl the hub + common category pages (server-rendered)
        yield scrapy.Request(ROOT, callback=self.parse_listing)
        for slug in sorted(CATEGORY_SLUGS):
            yield scrapy.Request(f"{ROOT}/{slug}", callback=self.parse_listing)

    def parse_listing(self, response: scrapy.http.Response):
        anchors = response.css("a::attr(href)").getall()
        scanned = 0
        queued = 0

        # Prefer anchors inside obvious event containers if present; fall back to page-wide
        candidate_hrefs = set(anchors) | set(response.xpath(
            "//*[contains(@id,'event') or contains(@class,'event')]//a/@href"
        ).getall())

        for href in candidate_hrefs:
            if not href or href.startswith("#"):
                continue
            absu = urljoin(response.url, href)
            path = urlparse(absu).path.rstrip("/")

            # Follow category/list pages to harvest more cards
            if path == "/auckland-events":
                scanned += 1
                continue
            if path.startswith("/auckland-events/"):
                tail = path.split("/")[-1]
                if tail in CATEGORY_SLUGS:
                    scanned += 1
                    # follow listing
                    yield scrapy.Request(absu, callback=self.parse_listing)
                    continue

            # Queue only true detail paths
            if is_event_detail_path(path):
                scanned += 1
                queued += 1
                yield scrapy.Request(absu, callback=self.parse_event)
            else:
                scanned += 1

        self.logger.info("[auckland_events] scanned=%d enqueued_detail=%d url=%s",
                         scanned, queued, response.url)

    def parse_event(self, response: scrapy.http.Response):
        if not is_event_detail_page(response):
            self.logger.debug("[auckland_events] skipped (not detail) %s", response.url)
            return

        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name or name.lower().strip() in {"events", "what's on", "what’s on"}:
            self.logger.debug("[auckland_events] skipped (bad h1) %s", url)
            return

        venue = clean(response.xpath("(//h1/following::a[1]/text())[1]").get())
        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        # Price cues near the top
        price_text = clean(" ".join(response.xpath(
            "(//h1/following::p | //h1/following::li | //h1/following::div)[position()<=20][contains(.,'$') or contains(translate(.,'FREE','free'),'free')]//text()"
        ).getall()))
        price = parse_prices(price_text or "")

        # Dates
        date_text = clean(" ".join(
            response.xpath("//*[normalize-space()='Dates']/following::text()[normalize-space()][1]").getall()
        )) or clean(" ".join(
            response.xpath("(//h1/following::p | //h1/following::div)[position()<=8][contains(.,'|')]//text()").getall()
        ))
        start_iso, end_iso = parse_date_range(date_text or "")
        if (not start_iso and date_text and "|" in date_text):
            try:
                dpart, tpart = [x.strip() for x in date_text.split("|", 1)]
                d = dp.parse(dpart, dayfirst=True)
                st = dp.parse(tpart).time()
                start_iso = datetime.combine(d.date(), st).isoformat()
                end_iso = datetime.combine(d.date(), time(23, 59, 59)).isoformat()
            except Exception:
                start_iso, end_iso = None, None

        # Booking link
        booking_url = response.xpath(
            "//a[contains(.,'Book Tickets') or contains(.,'Buy Tickets')]/@href"
        ).get()
        if booking_url:
            booking_url = urljoin(url, booking_url)

        # Image
        img = response.xpath("(//img[contains(@src,'.jpg') or contains(@src,'.png')])[1]/@src").get()
        if img and img.startswith("/"):
            img = urljoin(url, img)

        item = TravelScoutItem(
            id=make_id(url),
            record_type="event",
            name=name,
            description=desc,
            categories=["Events"],
            tags=[],
            url=url,
            source="heartofthecity.co.nz",
            images=[img] if img else [],
            location={
                "name": venue,
                "address": None,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            price=price,
            booking={"url": booking_url, "email": None, "phone": None},
            event_dates={"start": start_iso, "end": end_iso, "timezone": "Pacific/Auckland"},
            opening_hours=None,
            operating_months=None,
            data_collected_at=datetime.now().astimezone().isoformat(),
            text_for_embedding=build_embedding_text(
                name, desc, {"address": None, "city": "Auckland", "region": "Auckland"},
                date_text, price.get("text") if price else None, ["Events"]
            ),
        )
        yield item.to_dict()
