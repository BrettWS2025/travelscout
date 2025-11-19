@@ -1,5 +1,5 @@
import re
from urllib.parse import urljoin
from urllib.parse import urljoin, urlparse
from datetime import datetime
import scrapy
from tscraper.items import TravelScoutItem, make_id
@@ -8,82 +8,82 @@
BASE = "https://www.christchurchnz.com"
ROOT = f"{BASE}/visit/whats-on/"

EVENT_PATTERNS = (
    re.compile(r"^/visit/whats-on/listing/[A-Za-z0-9\-]+(?:-\d+)?/?$"),
    re.compile(r"^/visit/whats-on/[A-Za-z0-9\-]+/?$"),   # e.g. /visit/whats-on/supercars-christchurch
# match only detail pages:
#   /visit/whats-on/listing/<slug-or-slug-id>
#   /visit/whats-on/<slug>
EVENT_PATH_RE = re.compile(
    r"^/visit/whats-on/(?:listing/)?(?!subscribe|search|categories|category|tag|about|contact|news|events/?$)[a-z0-9\-]+(?:-\d+)?/?$",
    re.I,
)

class ChristchurchWhatsOnSpider(scrapy.Spider):
    name = "christchurch_whats_on"
    allowed_domains = ["christchurchnz.com", "www.christchurchnz.com"]

    # Crawl JS-driven pagination endpoints explicitly (safe upper bound; adjust if needed)
    MAX_PAGES = 20
    # Cap pagination to a sane bound; bump if you find later pages
    MAX_PAGES = 25

    custom_settings = {
        # Extra hard guard per spider (in addition to global)
        "CLOSESPIDER_PAGECOUNT": 4000,
    }

    def start_requests(self):
        # Page 1 is the root; include root + explicit pages to discover server-rendered cards
        # Seed the paginated server pages explicitly (avoids JS-driven infinite scroll)
        yield scrapy.Request(ROOT, callback=self.parse_listing, headers={"Accept-Language": "en-NZ,en;q=0.9"})
        for p in range(2, self.MAX_PAGES + 1):
            yield scrapy.Request(f"{ROOT}?page={p}", callback=self.parse_listing, headers={"Accept-Language": "en-NZ,en;q=0.9"}, dont_filter=True)
            yield scrapy.Request(f"{ROOT}?page={p}", callback=self.parse_listing, headers={"Accept-Language": "en-NZ,en;q=0.9"})

    def parse_listing(self, response: scrapy.http.Response):
        # harvest every candidate event URL on the page
        hrefs = set(x.strip() for x in response.css("a::attr(href)").getall())
        for h in hrefs:
            if not h or h.startswith("#"):
        # ONLY push detail pages discovered on these list pages
        for href in response.css("a::attr(href)").getall():
            if not href or href.startswith("#"):
                continue
            url = urljoin(BASE, h)
            path = "/" + "/".join(url.split("/", 3)[3:])  # keep path portion
            if any(pat.match(path) for pat in EVENT_PATTERNS):
                yield scrapy.Request(url, callback=self.parse_event)
            url = urljoin(BASE, href)
            path = urlparse(url).path
            if EVENT_PATH_RE.match(path):
                yield response.follow(url, callback=self.parse_event)

        # Be thorough: follow any internal "what's on" links recursively to discover more anchors
        for h in hrefs:
            if h.startswith("/visit/whats-on/") and "subscribe" not in h:
                yield scrapy.Request(urljoin(BASE, h), callback=self.parse_listing, dont_filter=True)
        # Do NOT recursively follow more listing pages here.
        # (Prevents crawl explosion.)

    def parse_event(self, response: scrapy.http.Response):
        url = response.url

        # title
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        # summary/description (first paragraph after H1 works well across pages)
        # Summary
        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        # date/time block (handles "17 Nov 2025 | 7:00 pm - 9:30 pm"
        # and ranges like "17 - 19 April 2026")
        # Date/time: works for "17 Nov 2025 | 7:00 pm - 9:30 pm" and "17 - 19 April 2026"
        date_text = clean(" ".join(
            response.xpath("//*[contains(., 'Event info')]/following::*[1]//text()").getall()
        )) or clean(" ".join(
            response.xpath("//*[contains(., 'Event info')]//text()").getall()
        ))
        start_iso, end_iso = parse_date_range(date_text or "")

        # address / venue (these labels are present on listing pages)
        # Address/venue
        address = clean(" ".join(response.xpath("//*[normalize-space()='Address']/following::*[1]//text()").getall()))
        loc_name = None
        if address and "," in address:
            loc_name = address.split(",")[0].strip()
        loc_name = address.split(",")[0].strip() if address and "," in address else None

        # booking / ticket link (covers “View website” & “Ticket info/Buy tickets” variants)
        # Booking / ticket link
        ticket = response.xpath(
            "//a[contains(translate(., 'TICKET', 'ticket'),'ticket') or contains(translate(., 'BUY', 'buy'),'buy')]/@href"
        ).get()
        site = response.xpath("//a[contains(.,'View website')]/@href").get()
        booking_url = urljoin(url, ticket or site) if (ticket or site) else None

        # price (covers "Ticket pricing …", "Pricing …", and generic $/Free mentions)
        # Price (Ticket pricing / Pricing block, or $/Free mentions)
        price_block = clean(" ".join(
            response.xpath("//*[contains(., 'Ticket pricing') or contains(., 'Pricing')]/following::*[1]//text()").getall()
        )) or clean(" ".join(
            response.xpath("//p[contains(.,'$') or contains(.,'Free') or contains(.,'free')]//text()").getall()
        ))
        price = parse_prices(price_block or "")

        # image
        # Hero image
        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.jpeg') or contains(@src,'.png')]/@src").get()
        if img and img.startswith("/"):
            img = urljoin(BASE, img)
@@ -120,7 +120,10 @@ def parse_event(self, response: scrapy.http.Response):
        )
        yield item.to_dict()

        # Deepen discovery via "Related events" section on each detail page
        # Optional: follow only *detail* links from this page (not listing)
        for rel in response.css("a::attr(href)").getall():
            if rel and rel.startswith("/visit/whats-on/"):
                yield scrapy.Request(urljoin(BASE, rel), callback=self.parse_event, dont_filter=True)
            if not rel or rel.startswith("#"):
                continue
            absu = urljoin(BASE, rel)
            if EVENT_PATH_RE.match(urlparse(absu).path):
                yield response.follow(absu, callback=self.parse_event)
