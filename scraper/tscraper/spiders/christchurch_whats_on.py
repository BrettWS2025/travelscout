import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy


BASE = "https://www.christchurchnz.com"
ROOT = f"{BASE}/visit/whats-on/"

# Match detail pages like:
#   /visit/whats-on/<slug>
#   /visit/whats-on/listing/<slug> or <slug>-<id>
DETAIL_RE = re.compile(
    r"^/visit/whats-on/(?:listing/)?(?!subscribe|search|categories|category|tag|about|contact|news|events/?$)[A-Za-z0-9\-]+(?:-\d+)?/?$"
)


class ChristchurchWhatsOnSpider(scrapy.Spider):
    """
    Christchurch — What's On (lean fields)

    Emits ONLY:
      id, record_type, name, categories, url, source,
      location, price, opening_hours, operating_months, data_collected_at
    """

    name = "christchurch_whats_on"
    allowed_domains = ["christchurchnz.com", "www.christchurchnz.com"]

    # paginate server-side pages explicitly
    MAX_PAGES = 25

    custom_settings = {
        # You can override output with -O on the CLI if you prefer
        "FEEDS": {
            "data/WhatsOn_Christchurch.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
        "DOWNLOAD_DELAY": 0.35,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.3,
        "AUTOTHROTTLE_MAX_DELAY": 4.0,
        "CONCURRENT_REQUESTS": 8,
        "TELNETCONSOLE_ENABLED": False,
        "ROBOTSTXT_OBEY": True,
        "USER_AGENT": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
    }

    # ---------------- helpers ----------------
    @staticmethod
    def _clean(s: str | None) -> str:
        if not s:
            return ""
        return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()

    @staticmethod
    def _hash_id(url: str) -> str:
        return hashlib.md5(url.encode("utf-8")).hexdigest()[:16]

    def _extract_address(self, response) -> str | None:
        # Common “Address” block under event info
        txt = " ".join(
            response.xpath("//*[normalize-space()='Address']/following::*[1]//text()").getall()
        )
        txt = self._clean(txt)
        return txt or None

    def _extract_price(self, response) -> dict:
        """
        Simple price sniff: look for $ amounts or 'Free' near pricing blocks.
        Returns a compact price object; text omitted by request.
        """
        block = " ".join(
            response.xpath(
                "//*[contains(., 'Ticket pricing') or contains(., 'Pricing') or contains(translate(.,'FREE','free'),'free')]//text()"
            ).getall()
        )
        if not block:
            block = " ".join(response.xpath("//article//text()[normalize-space()]").getall())
        block = self._clean(block)

        # filter out obvious transport/parking promos if present
        block = re.sub(r"(?i)(parking|car ?park|public transport)[^$]{0,120}\$[0-9.,]+", "", block)

        amounts = [
            float(m.replace(",", ""))
            for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", block)
        ]
        amounts = [a for a in amounts if 0 <= a < 2000]
        is_free = bool(re.search(r"\bfree\b", block, re.I)) and (not amounts or min(amounts) == 0)

        return {
            "currency": "NZD",
            "min": min(amounts) if amounts else None,
            "max": max(amounts) if amounts else None,
            "text": None,   # not requested
            "free": bool(is_free),
        }

    # --------------- crawl ---------------
    def start_requests(self):
        yield scrapy.Request(ROOT, callback=self.parse_listing, headers={"Accept-Language": "en-NZ,en;q=0.9"})
        for p in range(2, self.MAX_PAGES + 1):
            yield scrapy.Request(
                f"{ROOT}?page={p}",
                callback=self.parse_listing,
                headers={"Accept-Language": "en-NZ,en;q=0.9"},
            )

    def parse_listing(self, response: scrapy.http.Response):
        found = 0
        for href in response.css("a[href]::attr(href)").getall():
            if not href or href.startswith("#"):
                continue
            url = urljoin(BASE, href.split("#")[0])
            path = urlparse(url).path
            if DETAIL_RE.match(path):
                found += 1
                yield response.follow(url, callback=self.parse_event)
        if found:
            self.logger.info("Found %d detail links on %s", found, response.url)

    def parse_event(self, response: scrapy.http.Response):
        url = response.url
        name = self._clean(response.xpath("//h1/text()").get())
        if not name:
            self.logger.debug("Skipping (no title): %s", url)
            return

        # Minimal fields only (as requested)
        address = self._extract_address(response)
        price = self._extract_price(response)

        item = {
            "id": self._hash_id(url),
            "record_type": "event",
            "name": name,
            "categories": ["Events"],
            "url": url,
            "source": "christchurchnz.com",
            "location": {
                "name": None,
                "address": address,
                "city": "Christchurch" if address and "christchurch" in address.lower() else None,
                "region": "Canterbury",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": price,
            "opening_hours": None,
            "operating_months": None,
            "data_collected_at": datetime.now(timezone.utc).isoformat(),
        }
        yield item
