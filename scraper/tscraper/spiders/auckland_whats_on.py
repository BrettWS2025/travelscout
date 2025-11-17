import re
from urllib.parse import urljoin, urlparse
from datetime import datetime
import scrapy

from tscraper.items import TravelScoutItem, make_id
from tscraper.utils import clean, parse_prices, build_embedding_text

BASE = "https://heartofthecity.co.nz"
LIST_URL = f"{BASE}/activities/entertainment-activities"

DETAIL_ALLOW = re.compile(r"^/[a-z0-9\-/]+/[a-z0-9\-/]+/[a-z0-9\-]+/?$", re.I)

ADDR_RE = re.compile(
    r"\b\d{1,5}\s+[A-Z][A-Za-z]*(?:\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Quay|Square|Place|Terrace|Way|Boulevard|Blvd))\b.*",
    re.I,
)
PHONE_RE = re.compile(r"\b(?:\+?64|0)\d[\d\s\-]{6,}\b")

class AucklandHotCEntertainmentSpider(scrapy.Spider):
    """
    Heart of the City – Entertainment Activities
    Seeds:
      - /activities/entertainment-activities
    From listing sections, follow detail pages (paths vary across site sections).
    Parse place detail: title, description, price cues, address, phone, website, hours, image.
    """
    name = "auckland_entertainment_hotc"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]

    custom_settings = {
        "DEPTH_LIMIT": 2,
        "CLOSESPIDER_PAGECOUNT": 4000,
    }

    def start_requests(self):
        yield scrapy.Request(LIST_URL, callback=self.parse_listing, headers={"Accept-Language": "en-NZ,en;q=0.9"})

    def parse_listing(self, response: scrapy.http.Response):
        # Follow plausible detail links from the listing sections
        for href in response.css("a::attr(href)").getall():
            if not href or href.startswith("#"):
                continue
            absu = urljoin(BASE, href)
            path = urlparse(absu).path
            # Detail pages live under assorted sections; match "section/subsection/slug"
            if DETAIL_ALLOW.match(path):
                yield scrapy.Request(absu, callback=self.parse_place)

    def parse_place(self, response: scrapy.http.Response):
        url = response.url
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        # Summary paragraph after H1
        desc = clean(" ".join(response.xpath("(//h1/following::p)[1]//text()").getall())) or None

        # Price cues anywhere on page (deals, "$59pp", "Free")
        price_text = clean(" ".join(response.xpath(
            "//*[contains(text(),'$') or contains(translate(.,'FREE','free'),'free')]//text()"
        ).getall()))
        price = parse_prices(price_text or "")

        # Address & phone: scan visible text following H1
        body_texts = [clean(t) for t in response.xpath("//h1/following::text()").getall()]
        body_texts = [t for t in body_texts if t]
        address = next((t for t in body_texts if ADDR_RE.search(t)), None)
        phone = next((t for t in body_texts if PHONE_RE.search(t)), None)

        # Website link
        website = response.xpath("//a[contains(.,'Website')]/@href").get()
        if website:
            website = urljoin(url, website)

        # Opening hours block (lines under an 'Opening hours' heading)
        hours_block = clean(" ".join(response.xpath(
            "//*[contains(., 'Opening hours')]/following::*[self::p or self::li or self::div][position()<=10]//text()"
        ).getall())) or None

        # Primary image
        img = response.xpath("//img[contains(@src,'.jpg') or contains(@src,'.jpeg') or contains(@src,'.png')]/@src").get()
        if img and img.startswith("/"):
            img = urljoin(BASE, img)

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
                "longitude": None
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
            )
        )
        yield item.to_dict()
