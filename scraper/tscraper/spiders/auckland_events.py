import re
from urllib.parse import urljoin, urlparse
from datetime import datetime, time
import scrapy
from dateutil import parser as dp

from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_date_range, parse_prices, build_embedding_text

BASE = "https://heartofthecity.co.nz"
ROOT = f"{BASE}/auckland-events"

EVENT_PATH_RE = re.compile(r"^/auckland-events/(?!$)[a-z0-9\-]+/?$", re.I)

class AucklandHotCEventsSpider(scrapy.Spider):
    """
    Heart of the City – Events
    Seeds:
      - /auckland-events (hub)
      - any category links under /auckland-events/* discovered on the hub (e.g. /this-week, /music-events, /this-weekend)
    From listing pages, follow event detail links: /auckland-events/<slug>
    Parse event detail pages: title, description, price, dates, booking link, venue, image.
    """
    name = "auckland_events_hotc"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    custom_settings = {
        # Safety: don't let this spider go wild
        "DEPTH_LIMIT": 2,
        "CLOSESPIDER_PAGECOUNT": 4000,
    }

    def start_requests(self):
        yield scrapy.Request(ROOT, callback=self.parse_listing, headers={"Accept-Language": "en-NZ,en;q=0.9"})

    # -------- Listing pages --------
    def parse_listing(self, response: scrapy.http.Response):
        # 1) Follow to more event listing pages within /auckland-events/*
        for href in response.css('a[href^="/auckland-events/"]::attr(href)').getall():
            absu = urljoin(BASE, href)
            path = urlparse(absu).path
            if path.rstrip("/") == "/auckland-events":
                continue
            # follow category/list pages to harvest more cards
            yield scrapy.Request(absu, callback=self.parse_listing)

        # 2) Harvest event detail links and parse them
        for href in response.css('a[href^="/auckland-events/"]::attr(href)').getall():
            absu = urljoin(BASE, href)
            if EVENT_PATH_RE.match(urlparse(absu).path):
                yield scrapy.Request(absu, callback=self.parse_event)

    # -------- Event detail pages --------
    def parse_event(self, response: scrapy.http.Response):
        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        # First paragraph after H1 as summary
        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        # Venue (often an <a> directly after H1, e.g., "Spark Arena")
        venue = clean(response.xpath("(//h1/following::a[1]/text())[1]").get())

        # Price block: look for obvious price/free signals near top of page
        price_text = clean(" ".join(response.xpath(
            "//*[contains(text(),'$') or contains(translate(.,'FREE','free'),'free')]//text()"
        ).getall()))
        price = parse_prices(price_text or "")

        # Dates: under a 'Dates' heading (e.g., "18 NOV, 2025 | 7pm")
        date_text = clean(" ".join(
            response.xpath("//*[normalize-space()='Dates']/following::text()[normalize-space()][1]").getall()
        )) or None

        # Try our shared parser first
        start_iso, end_iso = parse_date_range(date_text or "")
        # Fallback: handle "DATE | TIME" with no explicit end-time
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

        # Primary image (if present)
        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.jpeg') or contains(@src,'.png')]/@src").get()
        if img and img.startswith("/"):
            img = urljoin(BASE, img)

        # Booking: "Book Tickets" or "Buy Tickets" type links
        booking_url = response.xpath(
            "//a[contains(.,'Book Tickets') or contains(.,'Buy Tickets')]/@href"
        ).get()
        if booking_url:
            booking_url = urljoin(url, booking_url)

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
                "longitude": None
            },
            price=price,
            booking={"url": booking_url, "email": None, "phone": None},
            event_dates={"start": start_iso, "end": end_iso, "timezone": "Pacific/Auckland"},
            opening_hours=None,
            operating_months=None,
            data_collected_at=datetime.now().astimezone().isoformat(),
            text_for_embedding=build_embedding_text(
                name, desc,
                {"address": None, "city": "Auckland", "region": "Auckland"},
                date_text, price.get("text") if price else None, ["Events"]
            )
        )
        yield item.to_dict()
