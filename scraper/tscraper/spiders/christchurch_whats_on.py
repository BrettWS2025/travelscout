import re
from urllib.parse import urljoin, urlparse
from datetime import datetime
import scrapy

from tscraper.items import make_id
from tscraper.utils import clean, parse_prices

BASE = "https://www.christchurchnz.com"
ROOT = f"{BASE}/visit/whats-on/"

# Match only detail pages:
#   /visit/whats-on/listing/<slug-or-slug-id>
#   /visit/whats-on/<slug>
EVENT_PATH_RE = re.compile(
    r"^/visit/whats-on/(?:listing/)?(?!subscribe|search|categories|category|tag|about|contact|news|events/?$)[a-z0-9\-]+(?:-\d+)?/?$",
    re.I,
)

class ChristchurchWhatsOnSpider(scrapy.Spider):
    name = "christchurch_whats_on"
    allowed_domains = ["christchurchnz.com", "www.christchurchnz.com"]

    # Cap pagination to a sane bound; bump if needed
    MAX_PAGES = 25

    custom_settings = {
        # You can override with `-O data/Christchurch_Whats_On.jsonl`
        "FEEDS": {
            "data/Christchurch_Whats_On.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
        "CLOSESPIDER_PAGECOUNT": 4000,
        # keep ROBOTSTXT_OBEY as your project default (True in your logs)
    }

    def start_requests(self):
        # Seed the paginated server pages explicitly (avoids JS infinite scroll)
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
            if EVENT_PATH_RE.match(urlparse(url).path):
                yield response.follow(url, callback=self.parse_event)

    def parse_event(self, response: scrapy.http.Response):
        url = response.url.split("#")[0]
        name = clean(response.xpath("//h1/text()").get())
        if not name:
            return

        # Address/venue (simple, robust pulls)
        address = clean(
            " ".join(
                response.xpath(
                    "//*[normalize-space()='Address']/following::*[1]//text()"
                ).getall()
            )
        ) or None

        # Opening hours (rare on event pages; keep best-effort)
        hours_text = clean(
            " ".join(
                response.xpath(
                    "//*[contains(., 'Opening hours')]/following::*[1]//text()"
                ).getall()
            )
        ) or None

        # Operating months (unlikely for events; left as None by default)
        operating_months = None

        # Price (Ticket pricing / Pricing block, or $/Free mentions)
        price_block = clean(
            " ".join(
                response.xpath(
                    "//*[contains(., 'Ticket pricing') or contains(., 'Pricing')]/following::*[1]//text()"
                ).getall()
            )
        ) or clean(
            " ".join(
                response.xpath(
                    "//p[contains(.,'$') or contains(.,'Free') or contains(.,'free')]//text()"
                ).getall()
            )
        )
        price = parse_prices(price_block or "")

        item = {
            "id": make_id(url),
            "record_type": "event",
            "name": name,
            "categories": ["Events"],
            "url": url,
            "source": "christchurchnz.com",
            "location": {
                "name": None,
                "address": address,
                "city": "Christchurch" if address and "Christchurch" in address else None,
                "region": "Canterbury",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": price,
            "opening_hours": {"text": hours_text} if hours_text else None,
            "operating_months": operating_months,
            "data_collected_at": datetime.now().astimezone().isoformat(),
        }

        yield item
