import re
import json
import hashlib
import scrapy
from urllib.parse import urljoin

from scrapy.http import Request
from scrapy_playwright.page import PageMethod

from tscraper.items import PackageItem

BASE = "https://www.flightcentre.co.nz"

LISTING_START_URLS = [
    f"{BASE}/deals",
    f"{BASE}/holidays",
    f"{BASE}/cruises",
    f"{BASE}/tours",
    f"{BASE}/holidays/fj",
    f"{BASE}/holidays/ck",
    f"{BASE}/holidays/au",
    f"{BASE}/holidays/us",
    f"{BASE}/holidays/jp",
    f"{BASE}/holidays/nz",
]

# --- Playwright network interception to block heavy assets (faster, friendlier) ---
async def block_resources(route):
    r = route.request
    if r.resource_type in {"image", "media", "font", "stylesheet"}:
        await route.abort()
    else:
        await route.continue_()

class FlightCentreSpider(scrapy.Spider):
    name = "flightcentre"
    allowed_domains = ["flightcentre.co.nz", "www.flightcentre.co.nz"]

    # Hard caps so a run never spins forever
    MAX_LISTINGS = 60     # cap listing pages followed (tune up/down)
    MAX_PRODUCTS = 1500   # safety cap for product pages

    custom_settings = {
        # Politeness
        "ROBOTSTXT_OBEY": True,
        "USER_AGENT": "AirNZ-TravelScoutBot/1.0 (+contact: data@airnz.co.nz)",

        # Throttle for JS-heavy site
        "CONCURRENT_REQUESTS": 8,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 4,
        "DOWNLOAD_DELAY": 1.5,
        "RANDOMIZE_DOWNLOAD_DELAY": True,

        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 1.0,
        "AUTOTHROTTLE_MAX_DELAY": 8.0,
        "AUTOTHROTTLE_TARGET_CONCURRENCY": 2.0,

        # Don’t wait forever
        "DOWNLOAD_TIMEOUT": 20,
        "PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT": 15000,  # 15s

        # Limit Playwright concurrency to avoid hammering
        "PLAYWRIGHT_MAX_CONTEXTS": 2,
        "PLAYWRIGHT_MAX_PAGES_PER_CONTEXT": 2,

        # Safety stop conditions (choose one or both)
        "CLOSESPIDER_TIMEOUT": 1800,   # 30 minutes hard stop
        # "CLOSESPIDER_ITEMCOUNT": 2000,  # or cap total items

        # Clearer progress logs
        "LOGSTATS_INTERVAL": 30,
        # Fewer retries on JS pages
        "RETRY_TIMES": 1,
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.seen_listings = set()
        self.listing_count = 0
        self.product_count = 0

    def start_requests(self):
        for url in LISTING_START_URLS:
            yield Request(
                url,
                callback=self.parse_listing,
                meta={
                    "playwright": True,
                    "playwright_context": "listing",
                    "playwright_page_goto_kwargs": {"wait_until": "domcontentloaded", "timeout": 15000},
                    "playwright_page_methods": [
                        PageMethod("route", "**/*", block_resources),
                        PageMethod("wait_for_load_state", "domcontentloaded"),
                        # Brief scroll to nudge lazy cards without going wild
                        PageMethod("evaluate", "window.scrollBy(0, document.body.scrollHeight)"),
                        PageMethod("wait_for_timeout", 500),
                    ],
                },
            )

    # ------ Listing parsing -------------------------------------------------
    def parse_listing(self, response):
        if self.listing_count >= self.MAX_LISTINGS:
            return

        url_no_query = response.url.split("?")[0]
        if url_no_query in self.seen_listings:
            return
        self.seen_listings.add(url_no_query)
        self.listing_count += 1

        # Product detail links
        for href in set(response.css("a[href*='/product/']::attr(href)").getall()):
            url = response.urljoin(href).split("?")[0]
            # rely on Scrapy’s dupefilter (NO dont_filter=True)
            yield scrapy.Request(url, callback=self.parse_product)

        # Follow a small, filtered set of other listing pages (bounded)
        for href in set(response.css("a[href^='/holidays/']::attr(href)").getall() +
                        response.css("a[href^='/deals']::attr(href)").getall() +
                        response.css("a[href^='/cruises']::attr(href)").getall() +
                        response.css("a[href^='/tours']::attr(href)").getall()):
            url = response.urljoin(href).split("?")[0]
            if any(s in url for s in ["/stores", "/help", "/blog", "/window-seat"]):
                continue
            if url in self.seen_listings or self.listing_count >= self.MAX_LISTINGS:
                continue
            yield Request(
                url,
                callback=self.parse_listing,
                meta={
                    "playwright": True,
                    "playwright_context": "listing",
                    "playwright_page_goto_kwargs": {"wait_until": "domcontentloaded", "timeout": 15000},
                    "playwright_page_methods": [
                        PageMethod("route", "**/*", block_resources),
                        PageMethod("wait_for_load_state", "domcontentloaded"),
                        PageMethod("evaluate", "window.scrollBy(0, document.body.scrollHeight)"),
                        PageMethod("wait_for_timeout", 400),
                    ],
                },
            )

    # ------ Product parsing -------------------------------------------------
    def parse_product(self, response):
        if self.product_count >= self.MAX_PRODUCTS:
            return
        self.product_count += 1

        body_text = " ".join(response.xpath("//body//text()").getall())
        body_text = self._norm_space(body_text)

        title = (
            self._norm_space(response.css("h1::text").get())
            or self._meta_title(response)
            or self._rx_first(r"^#\s*(.+?)\s*(?:Deal number|$)", body_text)
            or "Flight Centre Deal"
        )

        deal_number = self._rx_first(r"Deal number:\s*([0-9]{6,})", body_text)
        package_id = f"flightcentre-{deal_number}" if deal_number else self._make_id(response.url, title)

        price, currency = self._price_from_text(body_text)
        price_basis = "per_person" if re.search(r"\bper\s+person\b", body_text, re.I) else "total"

        nights = self._rx_int(r"(\d{1,2})-night (?:cruise|holiday|package)", body_text)
        if nights is None:
            nights = self._rx_int(r"(\d{1,2})\s*nights?", body_text)
        duration_days = nights + 1 if isinstance(nights, int) else 0

        destinations = self._destinations_from_itinerary(body_text)
        if not destinations:
            region = self._rx_first(
                r"\b(Africa|Asia|Australia|Canada|Caribbean|Central America|Europe|Fiji|France|French Polynesia|Germany|Greece|Hawaii|Iceland|Indonesia|Italy|Japan|Maldives|Malaysia|Mexico|Netherlands|New Caledonia|New Zealand|Portugal|Samoa|Singapore|South Africa|South Pacific|Spain|Switzerland|Tahiti|Thailand|UAE|United Arab Emirates|United Kingdom|United States|USA|Vanuatu|Vietnam)\b",
                body_text,
            )
            if region:
                destinations = [region]

        includes = self._infer_includes(body_text)
        sale_ends_at = self._rx_first(
            r"(?:This deal expires|On sale until)\s*([0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{4})",
            body_text,
        )

        item = PackageItem(
            package_id=package_id,
            source="flightcentre",
            url=response.url.split("?")[0],
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
        import re as _re
        return _re.sub(r"[\u00A0\u202F\s]+", " ", (s or "")).strip()

    def _meta_title(self, response) -> str | None:
        t = response.css("meta[property='og:title']::attr(content), title::text").get()
        return self._norm_space(t) if t else None

    def _make_id(self, url: str, title: str) -> str:
        raw = f"{url}|{title}".encode("utf-8")
        import hashlib as _hash
        return "flightcentre-" + _hash.md5(raw).hexdigest()[:16]

    def _rx_first(self, pattern: str, text: str) -> str | None:
        import re as _re
        m = _re.search(pattern, text, re.I)
        return m.group(1).strip() if m else None

    def _rx_int(self, pattern: str, text: str):
        import re as _re
        m = _re.search(pattern, text, re.I)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                return None
        return None

    def _price_from_text(self, text: str):
        import re as _re
        if not text:
            return None, None
        t = text.replace(",", " ")
        t = _re.sub(r"(?<=\$)\s+", "", t)
        m = _re.search(
            r"Price\s*from\s*(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9\s]{2,})(?:\.\d{1,2})?",
            t, _re.I,
        )
        if m:
            num = float(_re.sub(r"\s+", "", m.group(1)))
            ccy = "NZD"
            cm = _re.search(r"(NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", t[m.start():m.end()], _re.I)
            if cm:
                sym = cm.group(1).upper()
                ccy = {"NZD": "NZD", "AUD": "AUD", "USD": "USD", "NZ$": "NZD", "AU$": "AUD", "US$": "USD", "$": "NZD"}.get(sym, "NZD")
            return num, ccy
        m2 = _re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9,]{2,})(?:\.\d{1,2})?\s*(?:per\s+person|pp)", text, _re.I)
        if m2:
            num = float(m2.group(1).replace(",", ""))
            return num, "NZD"
        return None, None

    def _destinations_from_itinerary(self, text: str):
        import re as _re
        dests = []
        for m in _re.finditer(r"\bDay\s+\d+\s+([A-Za-z][A-Za-z\s\-\.'&()]+?)(?:,| - |—|\.)", text):
            loc = self._norm_space(m.group(1))
            loc = _re.sub(r",.*$", "", loc).strip()
            if loc and loc not in dests:
                dests.append(loc)
        if not dests:
            m2 = _re.search(r"\b(South Pacific|Europe|Asia|Australia|New Zealand|Fiji|Cook Islands|Vanuatu|Tahiti|Japan|USA|United States)\b", text, _re.I)
            if m2:
                dests = [m2.group(1).strip()]
        return dests

    def _infer_includes(self, text: str) -> dict:
        import re as _re
        t = text.lower()
        flights = bool(_re.search(r"\breturn\s+.*flights?\b|\bflights?\s+included\b", t))
        hotel = bool(_re.search(r"\b\d+\s*(?:night|nights)\s+(?:accommodation|stay|hotel)\b|\bhotel\s+included\b", t))
        transfers = None
        if "transfers are additional" in t:
            transfers = False
        elif _re.search(r"\btransfers?\s+included\b|\breturn\s+private\s+airport\s+transfers?\b", t):
            transfers = True
        board = None
        if _re.search(r"\bbreakfast\s+daily\b|\bdaily\s+breakfast\b", t):
            board = "breakfast"
        elif _re.search(r"\ball-?inclusive\b", t):
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
