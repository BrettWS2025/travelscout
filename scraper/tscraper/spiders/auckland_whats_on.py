import re
from urllib.parse import urljoin, urlparse
from datetime import datetime
import scrapy

from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_prices, build_embedding_text

BASE = "https://heartofthecity.co.nz"
LIST_URL = f"{BASE}/activities/entertainment-activities"

# Detail pages appear across sections: /section/subsection/slug
DETAIL_PATH_RE = re.compile(r"^/[a-z0-9\-]+/[a-z0-9\-]+/[a-z0-9\-]+/?$", re.I)
PHONE_RE = re.compile(r"\b(?:\+?64|0)\d[\d\s\-]{6,}\b")

class AucklandHotCEntertainmentSpider(scrapy.Spider):
    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    custom_settings = {
        "ROBOTSTXT_OBEY": False,
        "DEPTH_LIMIT": 2,
        "CLOSESPIDER_PAGECOUNT": 4000,
        "TWISTED_REACTOR": "twisted.internet.asyncioreactor.AsyncioSelectorReactor",
        "DOWNLOAD_HANDLERS": {
            "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
            "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
        },
        "PLAYWRIGHT_BROWSER_TYPE": "chromium",
        "PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT": 25000,
        "DEFAULT_REQUEST_HEADERS": {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/123.0 Safari/537.36",
            "Accept-Language": "en-NZ,en;q=0.9",
        },
        "LOG_LEVEL": "INFO",
    }

    def start_requests(self):
        yield scrapy.Request(LIST_URL, callback=self.parse_listing, meta={"playwright": True})

    def parse_listing(self, response: scrapy.http.Response):
        for href in response.css("a::attr(href)").getall():
            if not href or href.startswith("#"):
                continue
            absu = urljoin(response.url, href)
            path = urlparse(absu).path.rstrip("/")

            # Skip events hub; this spider is for activities/places
            if path.startswith("/auckland-events"):
                continue

            if DETAIL_PATH_RE.match(path):
                yield scrapy.Request(absu, callback=self.parse_place, meta={"playwright": True})

    def parse_place(self, response: scrapy.http.Response):
        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        price_text = clean(" ".join(response.xpath(
            "//*[contains(text(),'$') or contains(translate(.,'FREE','free'),'free')]//text()"
        ).getall()))
        price = parse_prices(price_text or "")

        # Address: grab the first plausible address line near the top
        address = clean(" ".join(response.xpath(
            "(//h1/following::p | //h1/following::div)[position()<=10]"
            "[contains(., 'Street') or contains(., 'Road') or contains(., 'Quay') or contains(., 'Avenue') or contains(., 'Lane')]//text()"
        ).getall())) or None

        # Phone: scan text following H1
        phone = None
        for t in response.xpath("//h1/following::text()").getall():
            t = clean(t)
            if not t:
                continue
            m = PHONE_RE.search(t)
            if m:
                phone = m.group(0)
                break

        website = response.xpath("//a[contains(.,'Website')]/@href").get()
        if website:
            website = urljoin(url, website)

        hours_block = clean(" ".join(response.xpath(
            "//*[contains(., 'Opening hours')]/following::*[self::p or self::li or self::div][position()<=12]//text()"
        ).getall())) or None

        img = response.xpath(
            "//img[contains(@src,'.jpg') or contains(@src,'.jpeg') or contains(@src,'.png')]/@src"
        ).get()
        if img and img.startswith("/"):
            img = urljoin(url, img)

        item = TravelScoutItem(
            id=make_id(url),
            record_type="place",
            name=name,
            description=desc,
            categories=["Activities & Attractions", "Entertainment"],
            tags=[],
            url=url,
            source="heartofthecity.co.nz",
            images=[img] if img else [],
            location={
                "name": None,
                "address": address,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            price=price,
            booking={"url": website, "email": None, "phone": phone},
            event_dates=None,
            opening_hours=hours_block,
            operating_months=None,
            data_collected_at=datetime.now().astimezone().isoformat(),
            text_for_embedding=build_embedding_text(
                name, desc, {"address": address, "city": "Auckland", "region": "Auckland"},
                None, price.get("text") if price else None, ["Activities & Attractions","Entertainment"]
            ),
        )
        yield item.to_dict()
