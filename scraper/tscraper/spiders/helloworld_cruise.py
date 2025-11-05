import re
import json
import hashlib
import scrapy
from urllib.parse import urlparse
from scrapy.spiders import SitemapSpider

from tscraper.items import PackageItem

BASE = "https://helloworld.gocruising.co.nz"

# Example detail URLs:
# /cruise/fly-stay-cruise-australias-kimberley-PON52500/
# /cruise/emblematic-antarctica-PON53481/
# /cruise/fly-cruise-the-riches-of-mekong-AMA53287/
# /cruise/south-pacific-escape-CEL53238/
# /cruise/a-journey-through-...-EXP53328/
# /cruise/fly-cruise-the-jade-seas-OCE53548/
ALLOW = [r"^/cruise/[a-z0-9-]+-[A-Z]{3,4}\d{4,6}/?$"]
DENY  = [r"^/$", r"/search"]

class HelloworldCruiseSpider(SitemapSpider):
    name = "helloworld_cruise"
    allowed_domains = ["helloworld.gocruising.co.nz"]
    sitemap_urls = [f"{BASE}/sitemap.xml"]
    sitemap_rules = [(r"/cruise/[a-z0-9-]+-[A-Z]{3,4}\d{4,6}/", "parse_detail")]
    custom_settings = {"DOWNLOAD_DELAY": 1.0}

    def start_requests(self):
        for r in super().start_requests():
            yield r
        # fallback crawl from home page if sitemap unavailable
        yield scrapy.Request(f"{BASE}/", callback=self.parse_listing)

    # ---------- helpers ----------
    def _pid(self, url, title, price):
        return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()

    def _norm(self, s: str) -> str:
        return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "").strip())

    def _has_currency(self, t: str) -> bool:
        return bool(re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", t or "", re.I))

    def _parse_price_text(self, text: str):
        if not text:
            return None
        t = self._norm(text).replace(",", "")
        if not self._has_currency(t):
            return None
        t = re.sub(r"(?<=\$)\s+", "", t)
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
        t = self._norm(hero)
        dests = []
        if "|" in t:
            after = t.split("|", 1)[1].strip()
            parts = re.split(r",|\s+to\s+|\s*-\s*", after, flags=re.I)
            for p in parts:
                p = re.sub(r"[^A-Za-z\s'\-]", "", p).strip()
                if p:
                    dests.append(p)
        if not dests:
            u = urlparse(response.url)
            segs = [s for s in (u.path or "").split("/") if s]
            if segs and segs[0] == "cruise":
                slug = segs[-1]
                slug = re.sub(r"-[A-Z]{3,4}\d{4,6}$", "", slug)  # drop product code suffix
                slug = re.sub(r"[-_]+", " ", slug).strip().title()
                if slug:
                    dests.append(slug)
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

    def _price_from_ldjson(self, response):
        for node in response.xpath("//script[@type='application/ld+json']/text()").getall():
            try:
                data = json.loads(node.strip())
            except Exception:
                continue
            objs = data if isinstance(data, list) else [data]
            for obj in objs:
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
        if any(re.search(d, path, re.I) for d in DENY):
            return False
        return any(re.search(a, path, re.I) for a in ALLOW)

    # ---------- fallback list crawl ----------
    def parse_listing(self, response):
        for href in response.xpath("//a/@href").getall():
            if self._allowed_link(href):
                yield response.follow(href, callback=self.parse_detail)
        for nxt in response.css("a[rel='next']::attr(href), .pagination__link::attr(href), .pagination__next::attr(href)").getall():
            yield response.follow(nxt, callback=self.parse_listing)

    # ---------- detail ----------
    def parse_detail(self, response):
        title = self._norm(" ".join(response.css("h1 *::text, h1::text").getall())) \
             or self._norm(response.css("meta[property='og:title']::attr(content)").get()) \
             or self._norm(response.css("title::text").get())

        hero = self._norm(" ".join(response.css(".c-hero__subtext ::text, .hero__subtext ::text").getall()))
        body = self._norm(" ".join(response.xpath("//body//text()").getall()))

        price_text_1 = self._norm(" ".join(response.css(
            ".price, .price-from, .deal-price, .pricing, .c-price, .price__value, .product-price, [class*='price']"
        ).xpath(".//text()").getall()))
        price_text_2 = self._norm(" ".join(response.xpath(
            "//dl[.//dt[contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]]/dd[1]//text()"
            " | "
            "//*[self::h2 or self::h3 or self::h4][contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]/following::text()[1]"
            " | "
            "//*[self::h2 or self::h3 or self::h4][contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]/following::*[self::span or self::strong or self::p or self::div][1]//text()"
        ).getall()))
        price_text_3 = self._norm(" ".join(response.xpath(
            "//*[self::h2 or self::h3][contains(translate(., 'PRICING', 'pricing'), 'pricing')]/following::*[position()<=60]//text()"
        ).getall()))
        ld_price, ld_currency = self._price_from_ldjson(response)
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
            source="helloworld_cruise",
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
