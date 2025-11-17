import re
from urllib.parse import urljoin, urlparse
from datetime import datetime, time
import scrapy
from dateutil import parser as dp

from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_date_range, parse_prices, build_embedding_text

BASE = "https://heartofthecity.co.nz"
ROOT = f"{BASE}/auckland-events"

CATEGORY_SLUGS = {
    "today","tomorrow","this-week","this-weekend","whats-on-this-month",
    "food-drink-events","food-and-drink-events","theatre","exhibitions",
    "music-events","festivals"
}

def is_event_detail(path: str) -> bool:
    # matches /auckland-events/<slug>
    seg = path.strip("/").split("/")
    return len(seg) == 2 and seg[0] == "auckland-events"

class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz","www.heartofthecity.co.nz"]

    custom_settings = {
        # Keep it polite and bounded
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
        # Single-page test mode (great for troubleshooting):
        if self.test_url:
            yield scrapy.Request(self.test_url, callback=self.parse_event)
            return

        # Crawl the hub + common category pages (server-rendered)
        yield scrapy.Request(ROOT, callback=self.parse_listing)
        for slug in CATEGORY_SLUGS:
            yield scrapy.Request(f"{ROOT}/{slug}", callback=self.parse_listing)

    def parse_listing(self, response: scrapy.http.Response):
        anchors = response.css("a::attr(href)").getall()
        total = 0
        enqueued = 0

        for href in anchors:
            if not href or href.startswith("#"):
                continue
            absu = urljoin(response.url, href)
            path = urlparse(absu).path.rstrip("/")

            # Follow categories to harvest more cards
            if path.startswith("/auckland-events/"):
                tail = path.split("/")[-1]
                if tail in CATEGORY_SLUGS:
                    total += 1
                    yield scrapy.Request(absu, callback=self.parse_listing)
                    continue

            # Enqueue event detail pages
            if is_event_detail(path):
                total += 1
                enqueued += 1
                yield scrapy.Request(absu, callback=self.parse_event)

        self.logger.info("[auckland_events] scanned=%d enqueued_detail=%d url=%s",
                         total, enqueued, response.url)

    def parse_event(self, response: scrapy.http.Response):
        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            self.logger.debug("[auckland_events] no H1 on %s", url)
            return

        venue = clean(response.xpath("(//h1/following::a[1]/text())[1]").get())
        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        price_text = clean(" ".join(response.xpath(
            "//*[contains(text(),'$') or contains(translate(.,'FREE','free'),'free')]//text()"
        ).getall()))
        price = parse_prices(price_text or "")

        # Prefer a 'Dates' label, fall back to the first "DATE | TIME" text
        date_text = clean(" ".join(
            response.xpath("//*[normalize-space()='Dates']/following::text()[normalize-space()][1]").getall()
        )) or clean(" ".join(
            response.xpath("//*[contains(text(),'|') and contains(text(),',')][1]//text()").getall()
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

        booking_url = response.xpath(
            "//a[contains(.,'Book Tickets') or contains(.,'Buy Tickets')]/@href"
        ).get()
        if booking_url:
            booking_url = urljoin(url, booking_url)

        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.png')]/@src").get()
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
