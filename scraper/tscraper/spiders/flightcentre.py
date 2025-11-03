import re
import json
import hashlib
import scrapy
from urllib.parse import urljoin, urlparse

from scrapy.http import Request
from scrapy_playwright.page import PageMethod

from tscraper.items import PackageItem

BASE = "https://www.flightcentre.co.nz"

LISTING_START_URLS = [
    # High level landings
    f"{BASE}/deals",
    f"{BASE}/holidays",
    f"{BASE}/cruises",
    f"{BASE}/tours",
    # A few popular destinations to boost recall (pages lazily load cards)
    f"{BASE}/holidays/fj",  # Fiji
    f"{BASE}/holidays/ck",  # Cook Islands
    f"{BASE}/holidays/au",  # Australia
    f"{BASE}/holidays/us",  # USA
    f"{BASE}/holidays/jp",  # Japan
    f"{BASE}/holidays/nz",  # New Zealand
]

class FlightCentreSpider(scrapy.Spider):
    name = "flightcentre"
    allowed_domains = ["flightcentre.co.nz", "www.flightcentre.co.nz"]
    custom_settings = {
        # Be polite; listings are JS-heavy, details are mostly SSR.
        "DOWNLOAD_DELAY": 1.0,
        "CONCURRENT_REQUESTS": 8,
        # Project-level Playwright is enabled in settings.py already.
        # If you ever need to bypass robots ONLY for this spider, you could set:
        # "ROBOTSTXT_OBEY": True,
    }

    def start_requests(self):
        # Use Playwright on listing pages to hydrate product cards.
        for url in LISTING_START_URLS:
            yield Request(
                url,
                callback=self.parse_listing,
                meta={
                    "playwright": True,
                    "playwright_page_methods": [
                        PageMethod("wait_for_load_state", "domcontentloaded"),
                        # Nudge lazy components to load more cards
                        PageMethod("evaluate", "window.scrollBy(0, document.body.scrollHeight)"),
                        PageMethod("wait_for_timeout", 700),
                        PageMethod("evaluate", "window.scrollBy(0, document.body.scrollHeight)"),
                        PageMethod("wait_for_timeout", 700),
                    ],
                },
            )

    # ------ Listing parsing -------------------------------------------------

    def parse_listing(self, response):
        # Collect any product detail links
        product_links = set(
            response.css("a[href*='/product/']::attr(href)").getall()
        )
        for href in product_links:
            url = response.urljoin(href).split("?")[0]
            yield scrapy.Request(url, callback=self.parse_product, dont_filter=True)

        # Opportunistically follow more listings (limited/focused)
        more_listings = set()
        more_listings.update(response.css("a[href^='/holidays/']::attr(href)").getall())
        more_listings.update(response.css("a[href^='/deals']::attr(href)").getall())
        more_listings.update(response.css("a[href^='/cruises']::attr(href)").getall())
        more_listings.update(response.css("a[href^='/tours']::attr(href)").getall())

        for href in more_listings:
            url = response.urljoin(href)
            if any(s in url for s in ["/stores", "/help", "/blog", "/window-seat"]):
                continue
            yield Request(
                url,
                callback=self.parse_listing,
                meta={
                    "playwright": True,
                    "playwright_page_methods": [
                        PageMethod("wait_for_load_state", "domcontentloaded"),
                        PageMethod("evaluate", "window.scrollBy(0, document.body.scrollHeight)"),
                        PageMethod("wait_for_timeout", 700),
                    ],
                },
            )

    # ------ Product parsing -------------------------------------------------

    def parse_product(self, response):
        # Raw text for robust regex fallback
        body_text = " ".join(response.xpath("//body//text()").getall())
        body_text = self._norm_space(body_text)

        # --- Title ---
        title = (
            self._norm_space(response.css("h1::text").get())
            or self._meta_title(response)
            or self._rx_first(r"^#\s*(.+?)\s*(?:Deal number|$)", body_text)
            or "Flight Centre Deal"
        )

        # --- Deal number (used for package_id when present) ---
        deal_number = self._rx_first(r"Deal number:\s*([0-9]{6,})", body_text)
        package_id = f"flightcentre-{deal_number}" if deal_number else self._make_id(response.url, title)

        # --- Price & currency ---
        price, currency = self._price_from_text(body_text)
        price_basis = "per_person" if re.search(r"\bper\s+person\b", body_text, re.I) else "total"

        # --- Nights / duration ---
        nights = self._rx_int(r"(\d{1,2})-night (?:cruise|holiday|package)", body_text)
        if nights is None:
            nights = self._rx_int(r"(\d{1,2})\s*nights?", body_text)
        duration_days = nights + 1 if isinstance(nights, int) else 0

        # --- Destinations ---
        destinations = self._destinations_from_itinerary(body_text)
        if not destinations:
            region = self._rx_first(
                r"\b(Africa|Asia|Australia|Canada|Caribbean|Central America|Europe|Fiji|France|French Polynesia|Germany|Greece|Hawaii|Iceland|Indonesia|Italy|Japan|Maldives|Malaysia|Mexico|Netherlands|New Caledonia|New Zealand|Portugal|Samoa|Singapore|South Africa|South Pacific|Spain|Switzerland|Tahiti|Thailand|UAE|United Arab Emirates|United Kingdom|United States|USA|Vanuatu|Vietnam)\b",
                body_text,
            )
            if region:
                destinations = [region]

        # --- Includes ---
        includes = self._infer_includes(body_text)

        # --- Sale/end date ---
        sale_ends_at = self._rx_first(
            r"(?:This deal expires|On sale until)\s*([0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{4})",
            body_text,
        )

        item = PackageItem(
            package_id=package_id,
            source="flightcentre",
            url=response.url,
            title=title,
            destinations=destinations or [],
            duration_days=duration_days,
            nights=nights,
            price=price or 0.0,
            currency=currency or "NZD",
            price_basis=price_basis,
            includes=includes,
            hotel={"name": None, "stars": None, "room_type": None},
            sale_ends_at=sale_ends_at,
        )
        yield item.model_dump()

    # ------ Helpers ---------------------------------------------------------

    def _norm_space(self, s: str) -> str:
        return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "")).strip()

    def _meta_title(self, response) -> str | None:
        t = response.css("meta[property='og:title']::attr(content), title::text").get()
        return self._norm_space(t) if t else None

    def _make_id(self, url: str, title: str) -> str:
        raw = f"{url}|{title}".encode("utf-8")
        return "flightcentre-" + hashlib.md5(raw).hexdigest()[:16]

    def _rx_first(self, pattern: str, text: str) -> str | None:
        m = re.search(pattern, text, re.I)
        return m.group(1).strip() if m else None

    def _rx_int(self, pattern: str, text: str):
        m = re.search(pattern, text, re.I)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                return None
        return None

    def _price_from_text(self, text: str):
        """
        Extract a numeric 'Price from $x' and currency marker if present.
        Default currency is NZD for the NZ site.
        """
        if not text:
            return None, None
        # normalize thousand separators and spaces after currency symbol
        t = text.replace(",", " ")
        t = re.sub(r"(?<=\$)\s+", "", t)
        # Look for 'Price from $ 3 489'
        m = re.search(
            r"Price\s*from\s*(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9\s]{2,})(?:\.\d{1,2})?",
            t,
            re.I,
        )
        if m:
            num = float(re.sub(r"\s+", "", m.group(1)))
            ccy = "NZD"
            cm = re.search(r"(NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", t[m.start():m.end()], re.I)
            if cm:
                sym = cm.group(1).upper()
                ccy = {"NZD": "NZD", "AUD": "AUD", "USD": "USD", "NZ$": "NZD", "AU$": "AUD", "US$": "USD", "$": "NZD"}.get(sym, "NZD")
            return num, ccy

        # Fallback: any $1234 near 'per person'
        m2 = re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9,]{2,})(?:\.\d{1,2})?\s*(?:per\s+person|pp)", text, re.I)
        if m2:
            num = float(m2.group(1).replace(",", ""))
            return num, "NZD"
        return None, None

    def _destinations_from_itinerary(self, text: str):
        # Extract proper nouns after 'Day N ' up to comma/period
        dests = []
        for m in re.finditer(r"\bDay\s+\d+\s+([A-Za-z][A-Za-z\s\-\.'&()]+?)(?:,| - |—|\.)", text):
            loc = self._norm_space(m.group(1))
            # Clean heavy descriptions like 'Sydney, Australia' -> 'Sydney'
            loc = re.sub(r",.*$", "", loc).strip()
            if loc and loc not in dests:
                dests.append(loc)
        if not dests:
            m2 = re.search(r"\b(South Pacific|Europe|Asia|Australia|New Zealand|Fiji|Cook Islands|Vanuatu|Tahiti|Japan|USA|United States)\b", text, re.I)
            if m2:
                dests = [m2.group(1).strip()]
        return dests

    def _infer_includes(self, text: str) -> dict:
        t = text.lower()
        flights = bool(re.search(r"\breturn\s+.*flights?\b|\bflights?\s+included\b", t))
        hotel = bool(re.search(r"\b\d+\s*(?:night|nights)\s+(?:accommodation|stay|hotel)\b|\bhotel\s+included\b", t))
        transfers = None
        if "transfers are additional" in t:
            transfers = False
        elif re.search(r"\btransfers?\s+included\b|\breturn\s+private\s+airport\s+transfers?\b", t):
            transfers = True
        board = None
        if re.search(r"\bbreakfast\s+daily\b|\bdaily\s+breakfast\b", t):
            board = "breakfast"
        elif re.search(r"\ball-?inclusive\b", t):
            board = "all-inclusive"
        activities = []
        if "onboard spending money" in t or "onboard credit" in t:
            activities.append("onboard credit")
        return {
            "flights": flights or None,
            "hotel": hotel or None,
            "board": board,
            "transfers": transfers,
            "activities": activities or None,
        }
