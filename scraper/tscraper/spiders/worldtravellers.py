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
    start_urls = [f"{BASE}/deals"]
    custom_settings = {"DOWNLOAD_DELAY": 0.8}

    # ----------------------------
    # Helpers
    # ----------------------------
    def _pid(self, url, title, price):
        return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()

    def _norm_space(self, s: str) -> str:
        return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "").strip())

    def _parse_price_text(self, text: str):
        """
        Extract numeric price from text like 'From $4,475 per person' -> 4475.0
        """
        t = self._norm_space(text).replace(",", "")
        m = re.search(r"\$\s*([0-9]{2,7}(?:\.[0-9]{1,2})?)", t)
        return float(m.group(1)) if m else None

    def _extract_days_nights(self, body_text: str, hero_sub: str):
        """
        Prefer 'X days' from the hero subtext; else look in the body for 'X days' / 'X nights'.
        Nights = days - 1 (if days present).
        """
        # hero like: "8 days | Vienna to Zurich"
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
        Try to parse destinations from hero 'CityA to CityB'.
        Fallback: pull last path segment(s) from /deals/... URL.
        """
        # Hero subtext sample: "8 days | Vienna to Zurich"
        t = self._norm_space(hero_sub)
        dests = []

        if "|" in t:
            after_bar = t.split("|", 1)[1].strip()
            # Split on ' to ' or ' - ' separators
            parts = re.split(r"\s+to\s+|\s*-\s*", after_bar, flags=re.I)
            for p in parts:
                # strip any trailing descriptors
                p = re.sub(r"[^A-Za-z\s'-]", "", p).strip()
                if p and len(p) > 1:
                    dests.append(p)

        if not dests:
            # fallback from URL path e.g., /deals/asia/phuket-on-sale-with-...
            u = urlparse(response.url)
            segments = [s for s in (u.path or "").split("/") if s]
            # keep human-ish pieces (skip 'deals', pick last 1-2 words)
            segs = [s for s in segments if s not in ("deals",)]
            if segs:
                tail = segs[-1].replace("-", " ")
                # choose a single destination token if last segment is long
                tail = re.sub(r"\b(on|with|sale|and|the|in)\b", "", tail, flags=re.I).strip()
                if tail:
                    dests.append(tail.title())

        # de-dup while preserving order
        seen = set()
        unique = []
        for d in dests:
            if d not in seen:
                unique.append(d)
                seen.add(d)
        return unique

    def _extract_inclusions(self, response):
        """
        Pull bullets under "What's Included" (first UL after that H2).
        """
        # Find the first UL following an H2 whose normalized text is "What's Included"
        ul = response.xpath(
            "//h2[normalize-space(translate(., \"’\", \"'\"))='What’s Included' or "
            "normalize-space(.)=\"What's Included\"]/following::ul[1]/li//text()"
        ).getall()
        bullets = [self._norm_space(x) for x in ul if self._norm_space(x)]
        if bullets:
            return {
                "raw": bullets
            }
        return {}

    def _allowed_link(self, href: str) -> bool:
        if not href:
            return False
        # absolute or relative
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

    def parse_detail(self, response):
        # Title
        title = self._norm_space(response.css("h1::text, .c-hero__title::text").get())

        # Hero subtext (contains days + route like "8 days | Vienna to Zurich")
        hero_subtext = self._norm_space(" ".join(response.css(".c-hero__subtext ::text").getall()))

        # Price block under "Deal Details" → "Priced From" (span.deal-details__value)
        # Example: "$4,475 per person"
        price_block_text = self._norm_space(" ".join(response.css("span.deal-details__value ::text").getall()))
        price = self._parse_price_text(price_block_text)
        price_basis = "per_person" if re.search(r"\bper\s*person\b", price_block_text, re.I) else "total"

        # Body text for auxiliary matches
        body_text = self._norm_space(" ".join(response.xpath("//body//text()").getall()))

        # Duration/nights
        nights, duration_days = self._extract_days_nights(body_text, hero_subtext)

        # Destinations
        destinations = self._extract_destinations(response, hero_subtext)

        # Inclusions (bullets)
        includes = self._extract_inclusions(response)

        # Currency heuristic (site is NZD-priced)
        currency = "NZD"

        # Guard: keep only pages with a sensible price
        if not (isinstance(price, (int, float)) and price >= 99):
            return

        item = PackageItem(
            package_id=self._pid(response.url, title, price),
            source="worldtravellers",
            url=response.url,
            title=title,
            destinations=destinations,           # e.g. ["Vienna", "Zurich"] or ["Phuket"]
            duration_days=duration_days,         # e.g. 8
            nights=nights,                       # e.g. 7
            price=price,                         # this is already the per-person price (see price_basis)
            currency=currency,                   # "NZD"
            price_basis=price_basis,             # "per_person" if 'per person' detected
            includes=includes,                   # {"raw": [...]} when present
            hotel={"name": None, "stars": None, "room_type": None},
            sale_ends_at=None,                   # add a site-specific selector if you find one consistently
        )
        yield item.model_dump()
