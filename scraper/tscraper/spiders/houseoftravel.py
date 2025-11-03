import re
import json
import hashlib
import scrapy
from urllib.parse import urlparse

from tscraper.items import PackageItem

BASE = "https://www.houseoftravel.co.nz"

# Detail URL allow/deny rules
ALLOW = [
    r"^/deals/(?!$)[a-z0-9-]+(?:/[a-z0-9-]+)*/?$",
    r"^/holidays/(?!$)[a-z0-9-]+(?:/[a-z0-9-]+)*/?$",
    r"^/cruises/.+/sailings/[a-z0-9-]+/?$",
]
DENY = [
    r"^/deals/?$", r"^/deals/[^/]+/?$",                     # listing & category
    r"^/holidays/?$", r"^/holidays/[^/]+/?$",               # listing & category
    r"^/cruises/?$", r"^/cruises/[^/]+/?$",                 # top & category
    r"/search", r"/accommodation", r"/hot-deals",           # other directories we don't want
]

class HouseOfTravelSpider(scrapy.Spider):
    name = "houseoftravel"
    allowed_domains = ["houseoftravel.co.nz"]
    start_urls = [f"{BASE}/deals", f"{BASE}/holidays", f"{BASE}/cruises"]
    custom_settings = {
    "DOWNLOAD_DELAY": 0.7,
    "AUTOTHROTTLE_ENABLED": True,
    "CLOSESPIDER_TIMEOUT": 1800,  # keep runs bounded
}

    # ----------------------------
    # Helpers
    # ----------------------------
    def _pid(self, url, title, price):
        return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()

    def _norm(self, s: str) -> str:
        return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "").strip())

    def _has_currency_marker(self, t: str) -> bool:
        return bool(re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", t or "", re.I))

    def _parse_price_text(self, text: str):
        """
        Extract numeric price only when a currency marker is nearby.
        Supports: $2,499 | NZD 2499 | AU$7,770 | USD 1,999.00
        """
        if not text:
            return None
        t = self._norm(text).replace(",", "")
        if not self._has_currency_marker(t):
            return None
        t = re.sub(r"(?<=\$)\s+", "", t)  # $ 2 499 -> $2499
        m = re.search(
            r"(?:NZD|AUD|USD)?\s*(?:NZ\$|AU\$|US\$|\$)\s*([0-9]{2,7}(?:\.[0-9]{1,2})?)"
            r"|(?:NZD|AUD|USD)\s*([0-9]{2,7}(?:\.[0-9]{1,2})?)",
            t, re.I
        )
        if not m:
            return None
        amt = m.group(1) or m.group(2)
        try:
            return float(amt)
        except Exception:
            return None

    def _detect_currency(self, *texts):
        blob = " ".join(self._norm(t) for t in texts if t)
        if re.search(r"\bNZD\b|NZ\$", blob, re.I): return "NZD"
        if re.search(r"\bAUD\b|AU\$", blob, re.I): return "AUD"
        if re.search(r"\bUSD\b|US\$", blob, re.I): return "USD"
        return "NZD"  # default for this site

    def _extract_days_nights(self, body_text: str, hero: str):
        t = f"{hero} {body_text}"
        m_days = re.search(r"(\d{1,3})\s*days?", t, re.I)
        m_nights = re.search(r"(\d{1,3})\s*nights?", t, re.I)
        days = int(m_days.group(1)) if m_days else None
        nights = int(m_nights.group(1)) if m_nights else None
        if days and (not nights or nights != days - 1):
            nights = max(days - 1, 1)
        duration_days = days or (nights + 1 if nights else None)
        return nights, duration_days

    def _extract_destinations(self, response, hero: str):
        """
        Try hero route 'A to B'; else last slug from URL (cleaned).
        """
        t = self._norm(hero)
        dests = []
        if "|" in t:
            after = t.split("|", 1)[1].strip()
            parts = re.split(r"\s+to\s+|\s*-\s*", after, flags=re.I)
            for p in parts:
                p = re.sub(r"[^A-Za-z\s'\-&,()]", "", p).strip()
                p = re.sub(r"\s{2,}", " ", p)
                if p:
                    dests.append(p)

        if not dests:
            u = urlparse(response.url)
            segs = [s for s in u.path.split("/") if s]
            # prefer last meaningful segment (skip common dirs)
            segs = [s for s in segs if s not in ("deals", "holidays", "cruises", "sailings")]
            if segs:
                tail = segs[-1]
                tail = re.sub(r"-?(cmp[a-z]{2}\d{3,}|crs)$", "", tail)  # strip product codes like cmpsa2526, ...-crs
                tail = re.sub(r"[-_]+", " ", tail).strip()
                if tail:
                    dests.append(tail.title())

        # de-dup preserve order
        seen, uniq = set(), []
        for d in dests:
            if d not in seen:
                uniq.append(d); seen.add(d)
        return uniq

    def _extract_inclusions(self, response):
        """
        Bullets under headings like "What's Included", "Inclusions", "Includes".
        """
        ul = response.xpath(
            "("
            "//h2|//h3|//h4"
            ")[contains(translate(normalize-space(.), 'INCLUSIONSWHAT S INCLUDEDINCLUDED', 'inclusionswhat s includedincluded'), 'included') or "
            "contains(translate(normalize-space(.), 'INCLUSIONS', 'inclusions'), 'inclusions')]"
            "/following::ul[1]/li//text()"
        ).getall()
        bullets = [self._norm(x) for x in ul if self._norm(x)]
        return {"raw": bullets} if bullets else {}

    def _extract_sale_end(self, response):
        txt = self._norm(" ".join(
            response.xpath("//*[self::h3 or self::h4][contains(translate(., 'SALE ENDS', 'sale ends'), 'sale ends')]/following::*[1]//text()").getall()
        ))
        return txt or None

    def _extract_price_from_ldjson(self, response):
        """
        Look for schema.org Offers in JSON-LD.
        """
        for node in response.xpath("//script[@type='application/ld+json']/text()").getall():
            try:
                data = json.loads(node.strip())
            except Exception:
                continue
            # normalise to list
            objs = data if isinstance(data, list) else [data]
            for obj in objs:
                offers = obj.get("offers")
                if not offers:
                    continue
                offers = offers if isinstance(offers, list) else [offers]
                for off in offers:
                    price = off.get("price")
                    currency = (off.get("priceCurrency") or "").upper() or None
                    if price:
                        try:
                            price_f = float(str(price).replace(",", ""))
                            return price_f, currency
                        except Exception:
                            continue
        return None, None

    def _allowed_link(self, href: str) -> bool:
        if not href:
            return False
        try:
            p = urlparse(href)
            path = p.path if (p.scheme or p.netloc) else href
        except Exception:
            path = href
        if any(re.search(d, path) for d in DENY):
            return False
        return any(re.search(a, path) for a in ALLOW)

    # ----------------------------
    # Crawl
    # ----------------------------
    def parse(self, response):
        # follow only detail links (incl. cruise sailings)
        for href in response.xpath("//a/@href").getall():
            if self._allowed_link(href):
                yield response.follow(href, callback=self.parse_detail)

        # pagination (common 'next' rel across templates)
        next_page = response.css(
    "a[rel='next']::attr(href), a.pagination__next::attr(href), "
    ".pagination__link--next::attr(href), .pager__next::attr(href)"
    ).get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    # ----------------------------
    # Detail
    # ----------------------------
    def parse_detail(self, response):
        # Title
        title = self._norm(response.css("h1::text, .c-hero__title::text").get())

        # Hero subtext sometimes shows "X nights | A to B"
        hero = self._norm(" ".join(response.css(".c-hero__subtext ::text, .hero__subtext ::text").getall()))

        # ---- PRICE (multi-source, currency-aware) ----
        # 1) Common price classes/blocks
        price_candidates = " ".join(response.css(
            ".price, .price-from, .deal-price, .pricing, .c-price, .price__value, .hot-price, .product-price, [class*='price']"
        ).xpath(".//text()").getall())
        price_text_1 = self._norm(price_candidates)

        # 2) After 'Priced From' / 'From' labels (headings or definition lists)
        price_text_2 = self._norm(" ".join(response.xpath(
            # dt -> dd (definition list)
            "//dl[.//dt[contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]]/dd[1]//text()"
            " | "
            # heading 'Priced From' → immediate following text or first block sibling
            "//*[self::h2 or self::h3 or self::h4][contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]/following::text()[1]"
            " | "
            "//*[self::h2 or self::h3 or self::h4][contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]/following::*[self::span or self::strong or self::p or self::div][1]//text()"
        ).getall()))

        # 3) Pricing section (scan a bit deeper)
        price_text_3 = self._norm(" ".join(response.xpath(
            "//*[self::h2 or self::h3][contains(translate(., 'PRICING', 'pricing'), 'pricing')]/following::*[position()<=60]//text()"
        ).getall()))

        # 4) JSON-LD schema Offers
        ld_price, ld_currency = self._extract_price_from_ldjson(response)

        # 5) Body fallback only if currency marker exists
        body_text = self._norm(" ".join(response.xpath("//body//text()").getall()))
        body_price_text = body_text if self._has_currency_marker(body_text) else ""

        # Pick the first valid price
        price = (
            self._parse_price_text(price_text_1)
            or self._parse_price_text(price_text_2)
            or self._parse_price_text(price_text_3)
            or ld_price
            or self._parse_price_text(body_price_text)
        )

        # Basis detection (per person / twin share)
        basis_blob = " ".join([price_text_1, price_text_2, price_text_3, body_text])
        price_basis = "per_person" if re.search(r"\bper\s*person\b|twin\s*share|\bpp\b", basis_blob, re.I) else "total"

        # Currency detection
        currency = ld_currency or self._detect_currency(price_text_1, price_text_2, price_text_3, body_text)

        # ---- Duration / Destinations / Inclusions / Sale Ends ----
        nights, duration_days = self._extract_days_nights(body_text, hero)
        destinations = self._extract_destinations(response, hero)
        includes = self._extract_inclusions(response)
        sale_ends_at = self._extract_sale_end(response)

        # Keep only sensible prices
        if not (isinstance(price, (int, float)) and price >= 99):
            return

        item = PackageItem(
            package_id=self._pid(response.url, title, price),
            source="houseoftravel",
            url=response.url,
            title=title,
            destinations=destinations,
            duration_days=duration_days,
            nights=nights,
            price=price,
            currency=(currency or "NZD"),
            price_basis=price_basis,
            includes=includes,
            hotel={"name": None, "stars": None, "room_type": None},
            sale_ends_at=sale_ends_at,
        )
        yield item.model_dump()
