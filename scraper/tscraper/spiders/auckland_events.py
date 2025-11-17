import re
from urllib.parse import urljoin, urlparse
from datetime import datetime, time
import scrapy
from dateutil import parser as dp

from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_date_range, parse_prices, build_embedding_text

BASE = "https://heartofthecity.co.nz"
ROOT = f"{BASE}/auckland-events"

# Detail pages look like: /auckland-events/<slug>
EVENT_DETAIL_RE = re.compile(r"^/auckland-events/[a-z0-9\-]+/?$", re.I)

# Known category/listing slugs under /auckland-events/ that are NOT detail pages
CATEGORY_SLUGS = {
    "today", "tomorrow", "this-week", "this-weekend", "whats-on-this-month",
    "food-drink-events", "food-and-drink-events", "theatre", "exhibitions",
    "music-events", "festivals"
}

class AucklandHotCEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    custom_settings = {
        "DEPTH_LIMIT": 2,
        "CLOSESPIDER_PAGECOUNT": 4000,
    }

    def start_requests(self):
        # Seed the main hub and a few common list pages
        yield scrapy.Request(ROOT, callback=self.parse_listing, headers={"Accept-Language": "en-NZ,en;q=0.9"})
        for slug in CATEGORY_SLUGS:
            yield scrapy.Request(f"{ROOT}/{slug}", callback=self.parse_listing, headers={"Accept-Language": "en-NZ,en;q=0.9"})

    def parse_listing(self, response: scrapy.http.Response):
        # Harvest absolute/relative anchors, filter by path
        for href in response.css("a::attr(href)").getall():
            if not href or href.startswith("#"):
                continue
            absu = urljoin(response.url, href)
            path = urlparse(absu).path.rstrip("/")

            # Follow category/list pages to find more cards
            if path.startswith("/auckland-events/"):
                tail = path.split("/")[-1]
                if tail in CATEGORY_SLUGS:
                    yield scrapy.Request(absu, callback=self.parse_listing)
                    continue

            # Follow detail pages
            if EVENT_DETAIL_RE.match(path):
                yield scrapy.Request(absu, callback=self.parse_event)

    def parse_event(self, response: scrapy.http.Response):
        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        venue = clean(response.xpath("(//h1/following::a[1]/text())[1]").get())
        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        price_text = clean(" ".join(response.xpath(
            "//*[contains(text(),'$') or contains(translate(.,'FREE','free'),'free')]//text()"
        ).getall()))
        price = parse_prices(price_text or "")

        date_text = clean(" ".join(
            response.xpath("//*[normalize-space()='Dates']/following::text()[normalize-space()][1]").getall()
        )) or None
        start_iso, end_iso = parse_date_range(date_text or "")
        if (not start_iso and date_text and "|" in date_text):
            try:
                dpart, tpart = [x.strip() for x in date_text.split("|", 1)]
                d = dp.parse(dpart, dayfirst=True)
                st = dp.parse(tpart).time()
                start = datetime.combine(d.date(), st)
                end = datetime.combine(d.date(), time(23, 59, 59))
                start_iso, end_iso = start.isoformat(), end.isoformat()
            except Exception:
                start_iso, end_iso = None, None

        booking_url = response.xpath(
            "//a[contains(.,'Book Tickets') or contains(.,'Buy Tickets')]/@href"
        ).get()
        if booking_url:
            booking_url = urljoin(url, booking_url)

        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.jpeg') or contains(@src,'.png')]/@src").get()
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
