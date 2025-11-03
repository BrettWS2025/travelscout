import re
import json
import hashlib
import scrapy
from urllib.parse import urlparse

from tscraper.items import PackageItem

BASE = "https://helloworld.co.nz"

# Allow only real deal pages, e.g. /deal/17506/samoa-with-air-new-zealand
ALLOW = [
    r"^/deal/\d+/?$",
    r"^/deal/\d+/[a-z0-9-]+/?$",
]
DENY = [
    r"^/$",
    r"^/holidays/?$",
    r"^/holidays/.*/top-deals/?$",
    r"/search",
    r"/contact",
    r"/about",
]

STOPWORDS = {"and", "with", "the", "of", "sale", "spring", "exclusive", "new", "year", "experience"}

class HelloWorldSpider(scrapy.Spider):
    name = "helloworld"
    allowed_domains = ["helloworld.co.nz"]
    start_urls = [f"{BASE}/", f"{BASE}/holidays"]
    custom_settings = {"DOWNLOAD_DELAY": 0.7}

    # ----------------------------
    # Helpers
    # ----------------------------
    def _pid(self, url, title, price):
        return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()

    def _norm(self, s: str) -> str:
        return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "").strip())

    def _has_currency(self, t: str) -> bool:
        return bool(re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", t or "", re.I))

    def _parse_price_text(self, text: str):
        """
        Extract numeric price only when a currency marker is present.
        Accepts: $2,499 | NZD 2499 | AU$7,770 | USD 1,999.00
        """
        if not text:
            return None
        t = self._norm(text).replace(",", "")
        if not self._has_currency(t):
            return None
        t = re.sub(r"(?<=\$)\s+", "", t)  # $ 2 499 -> $2499
        m = re.search(
            r"(?:NZD|AUD|USD)?\s*(?:NZ\$|AU\$|US\$|\$)\s*([0-9]{2,7}(?:\.[0-9]{1,2})?)"
            r"|(?:NZD|AUD|USD)\s*([0-9]{2,7}(?:\.[0-9]{1,2})?)",
            t,
            re.I,
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
        return "NZD"

    def _extract_days_nights(self, body: str, hero: str):
        t = f"{hero} {body}"
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
        Try hero text; else last slug words (cleaned). Keeps it simple & scalable.
        """
        t = self._norm(hero)
        # If hero has pattern "X nights | City" or "City, Country", grab trailing piece after '|'
        dests = []
        if "|" in t:
            after = t.split("|", 1)[1].strip()
            parts = re.split(r",|\s+to\s+|\s*-\s*", after, flags=re.I)
            for p in parts:
                p = re.sub(r"[^A-Za-z\s'\-]", "", p).strip()
                if p:
                    dests.append(p)

        if not dests:
            # URL slug fallback
            u = urlparse(response.url)
            segs = [s for s in (u.path or "").split("/") if s]
            if len(segs) >= 2 and segs[0] == "deal":
                slug = segs[-1] if not segs[-1].isdigit() else (segs[-2] if len(segs) > 2 else "")
                slug = slug.replace("-", " ").strip().title()
                # simple cleanup: remove common non-destination words
                words = [w for w in slug.split() if w.lower() not in STOPWORDS]
                if words:
                    dests.append(" ".join(words[:4]))  # keep first few tokens

        # dedupe keep order
        seen, uniq = set(), []
        for d in dests:
            if d and d not in seen:
                uniq.append(d); seen.add(d)
        return uniq

    def _extract_inclusions(self, response):
        ul = response.xpath(
            "("
            "//h2|//h3|//h4"
            ")[contains(translate(normalize-space(.), 'INCLUSIONSWHAT S INCLUDEDINCLUDED', 'inclusionswhat s includedincluded'), 'included') or "
            "contains(translate(normalize-space(.), 'INCLUSIONS', 'inclusions'), 'inclusions')]"
            "/following::ul[1]/li//text()"
        ).getall()
        bullets = [self._norm(x) for x in ul if self._norm(x)]
        return {"raw": bullets} if bullets else {}

    def _extract_sale_end(self, body: str):
        m = re.search(r"(sale\s*ends\s*[A-Za-z0-9 ,]+|book\s*by\s*[A-Za-z0-9 ,]+|on\s*sale\s*until\s*[A-Za-z0-9 ,]+)", body, re.I)
        return self._norm(m.group(1)) if m else None

    def _extract_price_from_ldjson(self, response):
        """
        schema.org Offers (Offer/AggregateOffer) if present.
        """
        for node in response.xpath("//script[@type='application/ld+json']/text()").getall():
            try:
                data = json.loads(node.strip())
            except Exception:
                continue
            objs = data if isinstance(data, list) else [data]
            for obj in objs:
                # check both Offer and AggregateOffer
                offers = obj.get("offers") or obj.get("aggregateOffer")
                if not offers:
                    continue
                offers = offers if isinstance(offers, list) else [offers]
                for off in offers:
                    price = off.get("price") or off.get("lowPrice") or off.get("highPrice")
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
        # follow only /deal/<id>/... links
        for href in response.xpath("//a/@href").getall():
            if self._allowed_link(href):
                yield response.follow(href, callback=self.parse_detail)
        # paginate
        for nxt in response.css("a[rel='next']::attr(href), .pagination__next::attr(href)").getall():
            yield response.follow(nxt, callback=self.parse)

    # ----------------------------
    # Detail
    # ----------------------------
    def parse_detail(self, response):
        title = self._norm(response.css("h1::text, .c-hero__title::text, title::text").get())
        hero = self._norm(" ".join(response.css(".c-hero__subtext ::text, .hero__subtext ::text").getall()))
        body = self._norm(" ".join(response.xpath("//body//text()").getall()))

        # Prices:
        # 1) obvious price blocks/classes
        price_text_1 = self._norm(" ".join(response.css(
            ".price, .price-from, .deal-price, .pricing, .c-price, .price__value, .product-price, [class*='price']"
        ).xpath(".//text()").getall()))
        # 2) 'Priced From' / 'From' labels
        price_text_2 = self._norm(" ".join(response.xpath(
            "//dl[.//dt[contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]]/dd[1]//text()"
            " | "
            "//*[self::h2 or self::h3 or self::h4][contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]/following::text()[1]"
            " | "
            "//*[self::h2 or self::h3 or self::h4][contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]/following::*[self::span or self::strong or self::p or self::div][1]//text()"
        ).getall()))
        # 3) JSON-LD
        ld_price, ld_currency = self._extract_price_from_ldjson(response)
        # 4) Pricing section
        price_text_3 = self._norm(" ".join(response.xpath(
            "//*[self::h2 or self::h3][contains(translate(., 'PRICING', 'pricing'), 'pricing')]/following::*[position()<=60]//text()"
        ).getall()))
        # 5) Body fallback only if body actually has a currency marker
        body_price_text = body if self._has_currency(body) else ""

        price = (
            self._parse_price_text(price_text_1)
            or self._parse_price_text(price_text_2)
            or self._parse_price_text(price_text_3)
            or ld_price
            or self._parse_price_text(body_price_text)
        )
        if not (isinstance(price, (int, float)) and price >= 99):
            return

        currency = ld_currency or self._detect_currency(price_text_1, price_text_2, price_text_3, body)

        basis_blob = " ".join([price_text_1, price_text_2, price_text_3, body])
        price_basis = "per_person" if re.search(r"\bper\s*person\b|twin\s*share|\bpp\b", basis_blob, re.I) else "total"

        nights, duration_days = self._extract_days_nights(body, hero)
        destinations = self._extract_destinations(response, hero)
        includes = self._extract_inclusions(response)
        sale_ends_at = self._extract_sale_end(body)

        item = PackageItem(
            package_id=self._pid(response.url, title, price),
            source="helloworld",
            url=response.url,
            title=title,
            destinations=destinations,
            duration_days=duration_days,
            nights=nights,
            price=price,
            currency=currency or "NZD",
            price_basis=price_basis,
            includes=includes,
            hotel={"name": None, "stars": None, "room_type": None},
            sale_ends_at=sale_ends_at,
        )
        yield item.model_dump()
