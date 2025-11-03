import re
import json
import hashlib
from urllib.parse import urlparse
from typing import Optional, Tuple

import scrapy
from scrapy.spiders import SitemapSpider
from tscraper.items import PackageItem

class FlightcentreSitemapSpider(SitemapSpider):
    name = "flightcentre_sitemap"
    allowed_domains = ["flightcentre.co.nz"]
    sitemap_urls = ["https://www.flightcentre.co.nz/sitemap.xml"]
    sitemap_rules = [
        (r"/product/\d{6,}/?$", "parse_detail"),
        (r"/holidays/(?!types/|destinations/|inspiration/)[a-z0-9-]+/[a-z0-9-]+(?:-NZ\d{3,})?/?$", "parse_detail"),
        (r"/deals?/[a-z0-9-]+(?:-NZ\d{3,})?/?$", "parse_detail"),
    ]
    custom_settings = {"DOWNLOAD_DELAY": 0.8}

    # ------- helpers (same patterns as crawl spider) -------
    def _pid(self, url, title, price): return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()
    def _norm(self, s: str) -> str: return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "").strip())
    def _has_currency(self, t: str) -> bool: return bool(re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", t or "", re.I))
    def _parse_price_text(self, text: str) -> Optional[float]:
        if not text: return None
        t = self._norm(text).replace(",", "")
        if not self._has_currency(t): return None
        t = re.sub(r"(?<=\$)\s+", "", t)
        m = re.search(r"(?:NZD|AUD|USD)?\s*(?:NZ\$|AU\$|US\$|\$)\s*([0-9]{2,7}(?:\.[0-9]{1,2})?)|(?:NZD|AUD|USD)\s*([0-9]{2,7}(?:\.[0-9]{1,2})?)", t, re.I)
        if not m: return None
        amt = m.group(1) or m.group(2)
        try: return float(amt)
        except Exception: return None
    def _detect_currency(self, *texts) -> str:
        blob = " ".join(self._norm(t) for t in texts if t)
        if re.search(r"\bNZD\b|NZ\$", blob, re.I): return "NZD"
        if re.search(r"\bAUD\b|AU\$", blob, re.I): return "AUD"
        if re.search(r"\bUSD\b|US\$", blob, re.I): return "USD"
        return "NZD"
    def _extract_days_nights(self, body: str) -> Tuple[Optional[int], Optional[int]]:
        m_days = re.search(r"(\d{1,3})\s*days?", body, re.I)
        m_nights = re.search(r"(\d{1,3})\s*nights?", body, re.I)
        days = int(m_days.group(1)) if m_days else None
        nights = int(m_nights.group(1)) if m_nights else None
        if days and (not nights or nights != days - 1):
            nights = max(days - 1, 1)
        duration_days = days or (nights + 1 if nights else None)
        return nights, duration_days

    def _price_from_ldjson(self, response):
        for node in response.xpath("//script[@type='application/ld+json']/text()").getall():
            try: data = json.loads(node.strip())
            except Exception: continue
            objs = data if isinstance(data, list) else [data]
            for obj in objs:
                offers = obj.get("offers") or obj.get("aggregateOffer")
                if not offers: continue
                offers = offers if isinstance(offers, list) else [offers]
                for off in offers:
                    price = off.get("price") or off.get("lowPrice") or off.get("highPrice")
                    currency = (off.get("priceCurrency") or "").upper() or None
                    valid_until = off.get("priceValidUntil")
                    if price:
                        try: return float(str(price).replace(",", "")), currency, valid_until
                        except Exception: continue
        return None, None, None

    # ------- detail -------
    def parse_detail(self, response):
        title = self._norm(" ".join(response.css("h1 *::text, h1::text").getall())) \
             or self._norm(response.css("meta[property='og:title']::attr(content)").get()) \
             or self._norm(response.css("title::text").get())

        body = self._norm(" ".join(response.xpath("//body//text()").getall()))
        price_block = self._norm(" ".join(response.css("[class*='price'], .price, [data-test*='price']").xpath(".//text()").getall()))
        price_from  = self._norm(" ".join(response.xpath(
            "//dl[.//dt[contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]]/dd[1]//text()"
            " | //*[(self::h2 or self::h3 or self::h4) and contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]/following::text()[1]"
            " | //*[(self::h2 or self::h3 or self::h4) and contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]/following::*[self::span or self::strong or self::p or self::div][1]//text()"
        ).getall()))
        price_pricing = self._norm(" ".join(response.xpath(
            "//*[self::h2 or self::h3][contains(translate(., 'PRICING', 'pricing'), 'pricing')]/following::*[position()<=60]//text()"
        ).getall()))
        ld_price, ld_currency, price_valid_until = self._price_from_ldjson(response)
        body_price_text = body if self._has_currency(body) else ""

        price = (
            self._parse_price_text(price_block)
            or self._parse_price_text(price_from)
            or self._parse_price_text(price_pricing)
            or ld_price
            or self._parse_price_text(body_price_text)
        )
        if not (isinstance(price, (int, float)) and price >= 99):
            return

        currency = ld_currency or self._detect_currency(price_block, price_from, price_pricing, body)
        basis_blob = " ".join([price_block, price_from, price_pricing, body])
        price_basis = "per_person" if re.search(r"\bper\s*person\b|twin\s*share|\bpp\b", basis_blob, re.I) else "total"

        nights, duration_days = self._extract_days_nights(body)

        item = PackageItem(
            package_id=self._pid(response.url, title, price),
            source="flightcentre",
            url=response.url,
            title=title,
            destinations=[],
            duration_days=duration_days,
            nights=nights,
            price=price,
            currency=currency or "NZD",
            price_basis=price_basis,
            includes={},
            hotel={"name": None, "stars": None, "room_type": None},
            sale_ends_at=price_valid_until,
        )
        yield item.model_dump()
