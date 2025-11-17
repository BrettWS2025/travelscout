import re
from urllib.parse import urljoin, urlparse
from datetime import datetime
import scrapy

from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_prices, build_embedding_text

BASE = "https://heartofthecity.co.nz"
LIST_URL = f"{BASE}/activities/entertainment-activities"

# Detail pages live under various sections: /section/subsection/slug
def is_place_detail(path: str) -> bool:
    seg = path.strip("/").split("/")
    return len(seg) == 3 and all(seg)

PHONE_RE = re.compile(r"\b(?:\+?64|0)\d[\d\s\-]{6,}\b")

class AucklandWhatsOnSpider(scrapy.Spider):
    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz","www.heartofthecity.co.nz"]

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
        if self.test_url:
            yield scrapy.Request(self.test_url, callback=self.parse_place)
            return

        yield scrapy.Request(LIST_URL, callback=self.parse_listing)

    def parse_listing(self, response: scrapy.http.Response):
        anchors = response.css("a::attr(href)").getall()
        total = 0
        enqueued = 0

        for href in anchors:
            if not href or href.startswith("#"):
                continue
            absu = urljoin(response.url, href)
            path = urlparse(absu).path.rstrip("/")

            # Skip event pages (handled by the events spider)
            if path.startswith("/auckland-events"):
                continue

            if is_place_detail(path):
                total += 1
                enqueued += 1
                yield scrapy.Request(absu, callback=self.parse_place)
            else:
                total += 1

        self.logger.info("[auckland_whats_on] scanned=%d enqueued_detail=%d url=%s",
                         total, enqueued, response.url)

    def parse_place(self, response: scrapy.http.Response):
        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            self.logger.debug("[auckland_whats_on] no H1 on %s", url)
            return

        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        price_text = clean(" ".join(response.xpath(
            "//*[contains(text(),'$') or contains(translate(.,'FREE','free'),'free')]//text()"
        ).getall()))
        price = parse_prices(price_text or "")

        # Address: first street-like line near the top
        address = clean(" ".join(response.xpath(
            "(//h1/following::p | //h1/following::div)[position()<=12]"
            "[contains(., 'Street') or contains(., 'Road') or contains(., 'Quay') or contains(., 'Avenue') or contains(., 'Lane')]//text()"
        ).getall())) or None

        # Phone
        phone = None
        for t in response.xpath("//h1/following::text()").getall():
            t = clean(t)
            if not t:
                continue
            m = PHONE_RE.search(t)
            if m:
                phone = m.group(0)
                break

        # Website link
        website = response.xpath("//a[contains(.,'Website')]/@href").get()
        if website:
            website = urljoin(url, website)

        # Opening hours
        hours_block = clean(" ".join(response.xpath(
            "//*[contains(., 'Opening hours')]/following::*[self::p or self::li or self::div][position()<=12]//text()"
        ).getall())) or None

        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.png')]/@src").get()
        if img and img.startswith("/"):
            img = urljoin(url, img)

        item = TravelScoutItem(
            id=make_id(url),
            record_type="place",
            name=name,
            description=desc,
            categories=["Activities & Attractions","Entertainment"],
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
