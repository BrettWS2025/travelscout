import re
from urllib.parse import urljoin, urlparse
from datetime import datetime
import scrapy
from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_date_range, parse_prices, build_embedding_text

BASE = "https://www.christchurchnz.com"
ROOT = f"{BASE}/visit/whats-on/"

# match only detail pages:
#   /visit/whats-on/listing/<slug-or-slug-id>
#   /visit/whats-on/<slug>
EVENT_PATH_RE = re.compile(
    r"^/visit/whats-on/(?:listing/)?(?!subscribe|search|categories|category|tag|about|contact|news|events/?$)[a-z0-9\-]+(?:-\d+)?/?$",
    re.I,
)


class ChristchurchWhatsOnSpider(scrapy.Spider):
    name = "christchurch_events"
    allowed_domains = ["christchurchnz.com", "www.christchurchnz.com"]

    # Cap pagination to a sane bound; bump if you find later pages
    MAX_PAGES = 25

    custom_settings = {
        # Extra hard guard per spider (in addition to global)
        "CLOSESPIDER_PAGECOUNT": 4000,
    }

    def start_requests(self):
        # Seed the paginated server pages explicitly (avoids JS-driven infinite scroll)
        yield scrapy.Request(
            ROOT,
            callback=self.parse_listing,
            headers={"Accept-Language": "en-NZ,en;q=0.9"},
        )
        for p in range(2, self.MAX_PAGES + 1):
            yield scrapy.Request(
                f"{ROOT}?page={p}",
                callback=self.parse_listing,
                headers={"Accept-Language": "en-NZ,en;q=0.9"},
            )

    def parse_listing(self, response: scrapy.http.Response):
        # ONLY push detail pages discovered on these list pages
        for href in response.css("a::attr(href)").getall():
            if not href or href.startswith("#"):
                continue
            url = urljoin(BASE, href)
            path = urlparse(url).path
            if EVENT_PATH_RE.match(path):
                yield response.follow(url, callback=self.parse_event)

        # Do NOT recursively follow more listing pages here.
        # (Prevents crawl explosion.)

    def parse_event(self, response: scrapy.http.Response):
        url = response.url

        # title
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        # Summary
        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        # Date/time: works for "17 Nov 2025 | 7:00 pm - 9:30 pm" and "17 - 19 April 2026"
        date_text = clean(" ".join(
            response.xpath("//*[contains(., 'Event info')]/following::*[1]//text()").getall()
        )) or clean(" ".join(
            response.xpath("//*[contains(., 'Event info')]//text()").getall()
        ))
        start_iso, end_iso = parse_date_range(date_text or "")

        # Address/venue
        address = clean(" ".join(response.xpath("//*[normalize-space()='Address']/following::*[1]//text()").getall()))
        loc_name = address.split(",")[0].strip() if address and "," in address else None

        # Booking / ticket link
        ticket = response.xpath(
            "//a[contains(translate(., 'TICKET', 'ticket'),'ticket') or contains(translate(., 'BUY', 'buy'),'buy')]/@href"
        ).get()
        site = response.xpath("//a[contains(.,'View website')]/@href").get()
        booking_url = urljoin(url, ticket or site) if (ticket or site) else None

        # Price (Ticket pricing / Pricing block, or $/Free mentions)
        price_block = clean(" ".join(
            response.xpath("//*[contains(., 'Ticket pricing') or contains(., 'Pricing')]/following::*[1]//text()").getall()
        )) or clean(" ".join(
            response.xpath("//p[contains(.,'$') or contains(.,'Free') or contains(.,'free')]//text()").getall()
        ))
        price = parse_prices(price_block or "")

        # Hero image
        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.jpeg') or contains(@src,'.png')]/@src").get()
        if img and img.startswith("/"):
            img = urljoin(BASE, img)

        item = TravelScoutItem(
            id=make_id(url),
            record_type="event",
            name=name,
            description=desc,
            categories=["Events"],
            tags=[],
            url=url,
            source="christchurchnz.com",
            images=[img] if img else [],
            location={
                "name": loc_name,
                "address": address,
                "city": "Christchurch" if address and "Christchurch" in address else None,
                "region": "Canterbury",
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
                name, desc, {"address": address, "city": "Christchurch", "region": "Canterbury"},
                date_text, price.get("text") if price else None, ["Events"]
            )
        )
        yield item.to_dict()

        # Optional: follow only *detail* links from this page (not listing)
        for rel in response.css("a::attr(href)").getall():
            if not rel or rel.startswith("#"):
                continue
            absu = urljoin(BASE, rel)
            if EVENT_PATH_RE.match(urlparse(absu).path):
                yield response.follow(absu, callback=self.parse_event)
