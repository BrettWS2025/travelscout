import re
import hashlib
import scrapy
from urllib.parse import urlparse

from tscraper.items import PackageItem

BASE = "https://www.worldtravellers.co.nz"

# allow real deal pages only; avoid root /deals and destinations tree
ALLOW = [
    r"^/deals/(?!$)[a-z0-9-]+(?:/[a-z0-9-]+)*/?$",
]
DENY = [
    r"^/deals/?$",          # listing root
    r"^/destinations/?$",   # destinations root
    r"^/destinations/",     # destination landing pages
]

class WorldTravellersSpider(scrapy.Spider):
    name = "worldtravellers"
    allowed_domains = ["worldtravellers.co.nz"]
    start_urls = [f"{BASE}/deals", f"{BASE}/deals/cruise"]
    custom_settings = {"DOWNLOAD_DELAY": 0.8}

    # ----------------------------
    # Helpers
    # ----------------------------
    def _pid(self, url, title, price):
        return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()

    def _norm_space(self, s: str) -> str:
        # collapse spaces incl. NBSP/thin space
        return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "").strip())

    def _has_currency_marker(self, t: str) -> bool:
        return bool(re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", t, re.I))

    def _parse_price_text(self, text: str):
        """
        Extract numeric price but ONLY if currency markers are present.
        Accepts: $7,770 | NZD 7,770 | AU$7,770 | USD 1,999.00
        """
        if not text:
            return None
        # Normalise & strip thousand separators
        t = self._norm_space(text)
        if not self._has_currency_marker(t):
            return None

        # Remove spaces between currency and amount (AU$ 7 770 -> AU$7770)
        t = t.replace(",", "")
        t = re.sub(r"(?<=\$)\s+", "", t)

        # Prefer patterns with a currency sign or code near the number
        m = re.search(
            r"(?:NZD|AUD|USD)?\s*(?:NZ\$|AU\$|US\$|\$)\s*([0-9]{3,7}(?:\.[0-9]{1,2})?)"
            r"|(?:NZD|AUD|USD)\s*([0-9]{3,7}(?:\.[0-9]{1,2})?)",
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
        blob = " ".join(self._norm_space(t) for t in texts if t)
        if re.search(r"\bNZD\b|NZ\$", blob, re.I):
            return "NZD"
        if re.search(r"\bAUD\b|AU\$", blob, re.I):
            return "AUD"
        if re.search(r"\bUSD\b|US\$", blob, re.I):
            return "USD"
        # default site currency
        return "NZD"

    def _extract_days_nights(self, body_text: str, hero_sub: str):
        """
        Prefer 'X days' / 'X Nights' from the hero subtext; else look in body.
        Nights = days - 1 (if days present).
        """
        t = f"{hero_sub} {body_text}"
        m_days = re.search(r"(\d{1,3})\s*days?", t, re.I)
        m_nights = re.search(r"(\d{1,3})\s*nights?", t, re.I)

        days = int(m_days.group(1)) if m_days else None
        nights = int(m_nights.group(1)) if m_nights else None
        if days and (not nights or nights != days - 1):
            nights = max(days - 1, 1)
        duration_days = days or (nights + 1 if nights else None)
        return nights, duration_days

    def _extract_destinations(self, response, hero_sub: str):
        """
        Parse destinations from hero 'CityA to CityB' (cruise often has this).
        Fallback: last path segment from /deals/... URL.
        """
        t = self._norm_space(hero_sub)
        # Common noise words
        t = re.sub(r"\b(round\s*trip|roundtrip)\b", "", t, flags=re.I)

        dests = []
        if "|" in t:
            after_bar = t.split("|", 1)[1].strip()
            parts = re.split(r"\s+to\s+|\s*-\s*", after_bar, flags=re.I)
            for p in parts:
                p = re.sub(r"[^A-Za-z\s'\-&,()]", "", p).strip()
                p = re.sub(r"\s{2,}", " ", p)
                if p and len(p) > 1:
                    dests.append(p)

        if not dests:
            u = urlparse(response.url)
            segments = [s for s in (u.path or "").split("/") if s]
            segs = [s for s in segments if s not in ("deals", "cruise")]
            if segs:
                tail = segs[-1].replace("-", " ")
                tail = re.sub(r"\b(on|with|sale|and|the|in|to|from|pp)\b", "", tail, flags=re.I).strip()
                if tail:
                    dests.append(tail.title())

        seen = set(); unique = []
        for d in dests:
            if d not in seen:
                unique.append(d); seen.add(d)
        return unique

    def _extract_inclusions(self, response):
        """
        Pull bullets under headings like:
        "What's Included" / "Inclusions" / "Included".
        """
        ul = response.xpath(
            "("
            "//h2[normalize-space(.)=\"What's Included\" or contains(translate(., 'INCLUSIONS', 'inclusions'),'inclusions') or contains(translate(., 'INCLUDED', 'included'),'included')]"
            "|//h3[normalize-space(.)=\"What's Included\" or contains(translate(., 'INCLUSIONS', 'inclusions'),'inclusions') or contains(translate(., 'INCLUDED', 'included'),'included')]"
            ")"
            "/following::ul[1]/li//text()"
        ).getall()
        bullets = [self._norm_space(x) for x in ul if self._norm_space(x)]
        return {"raw": bullets} if bullets else {}

    def _extract_sale_end(self, response):
        """
        'Sale Ends' appears occasionally near Deal Details.
        """
        txt = self._norm_space(" ".join(
            response.xpath("//*[self::h3 or self::h4][contains(translate(., 'SALE ENDS', 'sale ends'), 'sale ends')]/following::*[1]//text()").getall()
        ))
        return txt or None

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
        # follow only 'deal' detail links
        for href in response.xpath("//a/@href").getall():
            if self._allowed_link(href):
                yield response.follow(href, callback=self.parse_detail)

        # pagination
        next_page = response.css('a[rel="next"]::attr(href)').get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    # ----------------------------
    # Detail
    # ----------------------------
    def parse_detail(self, response):
        # Title
        title = self._norm_space(response.css("h1::text, .c-hero__title::text").get())

        # Hero subtext (contains days + route like "12 Nights | Lautoka to Sydney")
        hero_subtext = self._norm_space(" ".join(response.css(".c-hero__subtext ::text").getall()))

        # -------- PRICE: robust, currency-aware ----------
        # 1) Old selector used on many pages
        price_text_1 = self._norm_space(" ".join(response.css("span.deal-details__value ::text").getall()))

        # 2) Nearest text after a 'Priced From' label (dt/dd or heading/sibling)
        price_text_2 = self._norm_space(" ".join(
            response.xpath(
                # dl/dt -> dd
                "//dl[contains(@class,'deal-details')]//dt[contains(translate(., 'PRICED FROM', 'priced from'), 'priced from')]/following-sibling::dd[1]//text()"
                " | "
                # h3/h4 'Priced From' then first sibling block
                "//*[self::h3 or self::h4][contains(translate(., 'PRICED FROM', 'priced from'), 'priced from')]/following::*[self::span or self::strong or self::p or self::div][1]//text()"
            ).getall()
        ))

        # 3) Text inside the 'Pricing' section (first 20 descendants after the heading)
        pricing_section = self._norm_space(" ".join(
            response.xpath("//*[self::h2 or self::h3][contains(translate(., 'PRICING', 'pricing'), 'pricing')]/following::*[position()<=20]//text()").getall()
        ))

        # 4) Body fallback: ONLY if a currency marker is in the body (avoid '2024/2026' years)
        body_text = self._norm_space(" ".join(response.xpath("//body//text()").getall()))
        body_price_text = body_text if self._has_currency_marker(body_text) else ""

        # Calculate price using the first valid source
        price = (
            self._parse_price_text(price_text_1)
            or self._parse_price_text(price_text_2)
            or self._parse_price_text(pricing_section)
            or self._parse_price_text(body_price_text)
        )

        # Basis detection (prefer near-price text, then body)
        basis_blob = " ".join([price_text_1, price_text_2, pricing_section])
        price_basis = "per_person" if re.search(r"\bper\s*person\b|twin\s*share", basis_blob + " " + body_text, re.I) else "total"

        # Currency detection
        currency = self._detect_currency(price_text_1, price_text_2, pricing_section, body_text)

        # -------- Duration / Destinations / Inclusions / Sale Ends ----------
        nights, duration_days = self._extract_days_nights(body_text, hero_subtext)
        destinations = self._extract_destinations(response, hero_subtext)
        includes = self._extract_inclusions(response)
        sale_ends_at = self._extract_sale_end(response)

        # Keep only sensible prices
        if not (isinstance(price, (int, float)) and price >= 99):
            return

        item = PackageItem(
            package_id=self._pid(response.url, title, price),
            source="worldtravellers",
            url=response.url,
            title=title,
            destinations=destinations,           # e.g. ["Papeete", "Society Islands"] or ["Lautoka", "Sydney"]
            duration_days=duration_days,         # e.g. 13 when 12 nights
            nights=nights,                       # e.g. 12
            price=price,                         # numeric price
            currency=currency,                   # NZD/AUD/USD where detected
            price_basis=price_basis,             # "per_person" or "total"
            includes=includes,                   # {"raw": [...]} when present
            hotel={"name": None, "stars": None, "room_type": None},
            sale_ends_at=sale_ends_at,
        )
        yield item.model_dump()
