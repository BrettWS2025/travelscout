# scraper/tscraper/spiders/christchurch_whats_on.py
import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy


class ChristchurchWhatsOnSpider(scrapy.Spider):
    """
    ChristchurchNZ — Things to do (detail pages)

    Emits ONLY:
      id, record_type, name, categories, url, source,
      location, price, opening_hours, operating_months, data_collected_at
    """

    name = "christchurch_whats_on"
    allowed_domains = ["christchurchnz.com", "www.christchurchnz.com"]
    start_urls = ["https://www.christchurchnz.com/visit/things-to-do/"]

    custom_settings = {
        "USER_AGENT": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit(537.36) (KHTML, like Gecko) "
            "Chrome/127.0.0.0 Safari/537.36"
        ),
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_DELAY": 0.4,
        "CONCURRENT_REQUESTS": 12,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.5,
        "AUTOTHROTTLE_MAX_DELAY": 6.0,
        "DEPTH_LIMIT": 6,
        "FEEDS": {
            "data/Things_to_do.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
    }

    PATH_PREFIX = "/visit/things-to-do/"

    # ---------- helpers ----------
    @staticmethod
    def _clean(s: str | None) -> str:
        if not s:
            return ""
        s = re.sub(r"\s+", " ", s)
        return s.replace("\xa0", " ").strip()

    @staticmethod
    def _hash_id(url: str) -> str:
        return hashlib.md5(url.encode("utf-8")).hexdigest()[:16]

    def _primary_category(self, url: str) -> list[str]:
        """
        Christchurch version: default to 'Activities & Attractions'.
        If we can infer a subcategory from breadcrumbs, include it second.
        """
        # This returns a list of categories, already including primary
        # We fill subcategory later in parse_place if available.
        return ["Activities & Attractions"]

    # ---------- crawl ----------
    def parse(self, response: scrapy.http.Response):
        # Follow only internal links within /visit/things-to-do/
        for href in response.css("a[href^='/visit/things-to-do/']::attr(href)").getall():
            url = urljoin(response.url, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]

            # detail pages look like /visit/things-to-do/listing/<slug> or sometimes /visit/things-to-do/<slug>
            is_detail = (
                (len(parts) >= 4 and parts[0] == "visit" and parts[1] == "things-to-do" and parts[2] == "listing")
                or (len(parts) >= 3 and parts[0] == "visit" and parts[1] == "things-to-do" and parts[2] not in {"listing", "search", "categories", "category", "tag"})
            )

            if is_detail:
                yield response.follow(url, callback=self.parse_place, headers={"Referer": response.url})
            else:
                yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

        # simple pagination
        for href in response.css("a[href*='?page=']::attr(href)").getall():
            yield response.follow(urljoin(response.url, href.split("#")[0]), callback=self.parse)

    def parse_place(self, response: scrapy.http.Response):
        url = response.url.split("#")[0]

        # Name
        name = self._clean(response.xpath("//h1/text()").get())
        if not name:
            return

        # Categories: try breadcrumb or page tags; normalize to primary first
        cats = []
        # breadcrumb example selectors (be defensive)
        crumb_bits = response.css("nav.breadcrumb a::text, .breadcrumb a::text").getall()
        crumb_bits = [self._clean(c) for c in crumb_bits if self._clean(c)]
        # harvest any page-tag-like elements that mention 'things-to-do'
        tag_bits = response.xpath("//a[contains(@href,'things-to-do')]/text()").getall()
        tag_bits = [self._clean(c) for c in tag_bits if self._clean(c)]

        subcat = None
        # pick a plausible subcategory (skip the site root crumbs)
        for c in crumb_bits + tag_bits:
            if c and c.lower() not in ("home", "visit", "things to do"):
                subcat = c
                break

        categories = self._primary_category(url)
        if subcat and subcat not in categories:
            categories.append(subcat)

        # Address
        address = self._clean(
            " ".join(response.xpath("//*[normalize-space()='Address']/following::*[1]//text()").getall())
        ) or None

        # Opening hours (free-text)
        hours_text = self._clean(
            " ".join(response.xpath("//*[contains(., 'Opening hours')]/following::*[1]//text()").getall())
        ) or None

        # Operating months (best-effort)
        months_text = self._clean(
            " ".join(response.xpath("//*[contains(., 'Months of operation')]/following::*[1]//text()").getall())
        ) or None

        # Price (coarse: look for typical pricing blocks or $/Free mentions)
        price_block = self._clean(
            " ".join(
                response.xpath(
                    "//*[contains(., 'Pricing and Conditions') or contains(., 'Ticket pricing') or contains(., 'Pricing')]/following::*[1]//text()"
                ).getall()
            )
        ) or self._clean(
            " ".join(response.xpath("//p[contains(.,'$') or contains(.,'Free') or contains(.,'free')]//text()").getall())
        )

        # parse into compact price object (NZD default)
        currency = "NZD"
        min_price = max_price = None
        free = False
        if price_block:
            # collect $ amounts (ignore absurd values)
            nums = [m.replace(",", "") for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", price_block)]
            vals = []
            for n in nums:
                try:
                    v = float(n)
                    if 0 <= v < 2000:
                        vals.append(v)
                except Exception:
                    pass
            if vals:
                min_price = min(vals)
                max_price = max(vals)
            free = bool(re.search(r"\bfree\b", price_block, re.I)) and (min_price is None or min_price == 0.0)

        item = {
            "id": self._hash_id(url),
            "record_type": "place",
            "name": name,
            "categories": categories or ["Activities & Attractions"],
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
            "price": {
                "currency": currency,
                "min": min_price,
                "max": max_price,
                "text": None,
                "free": bool(free),
            },
            "opening_hours": {"text": hours_text} if hours_text else None,
            "operating_months": months_text or None,
            "data_collected_at": datetime.now(timezone.utc).isoformat(),
        }

        yield item
