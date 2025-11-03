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
    # popular regions (JS listings)
    f"{BASE}/holidays/fj",
    f"{BASE}/holidays/ck",
    f"{BASE}/holidays/au",
    f"{BASE}/holidays/us",
    f"{BASE}/holidays/jp",
    f"{BASE}/holidays/nz",
]

# Patterns for detail pages
PRODUCT_RE   = re.compile(r"^https?://(?:www\.)?flightcentre\.co\.nz/product/\d+/?$")
HOLIDAY_RE   = re.compile(r"^https?://(?:www\.)?flightcentre\.co\.nz/holidays/.+-NZ\d+/?$", re.I)

# --- Block heavy assets when rendering JS listings ---
async def block_resources(route):
    req = route.request
    if req.resource_type in {"image", "media", "font", "stylesheet"}:
        await route.abort()
    else:
        await route.continue_()

class FlightCentreSpider(scrapy.Spider):
    name = "flightcentre"
    allowed_domains = ["flightcentre.co.nz", "www.flightcentre.co.nz"]

    # Hard caps to keep runs predictable and polite
    MAX_LISTINGS = 60      # how many listing pages to visit
    MAX_PRODUCTS = 2000    # safety cap for detail pages
    MAX_LOAD_MORE = 5      # clicks on "Load more" per listing

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "USER_AGENT": "TravelScoutBot/1.0 (+contact: data@travelscout.example)",
        "CONCURRENT_REQUESTS": 8,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 4,
        "DOWNLOAD_DELAY": 1.5,
        "RANDOMIZE_DOWNLOAD_DELAY": True,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 1.0,
        "AUTOTHROTTLE_MAX_DELAY": 8.0,
        "AUTOTHROTTLE_TARGET_CONCURRENCY": 2.0,
        "DOWNLOAD_TIMEOUT": 20,
        "RETRY_TIMES": 1,
        "PLAYWRIGHT_MAX_CONTEXTS": 2,
        "PLAYWRIGHT_MAX_PAGES_PER_CONTEXT": 2,
        "PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT": 15000,
        "LOGSTATS_INTERVAL": 30,
        "CLOSESPIDER_TIMEOUT": 1800,  # hard stop at ~30 min
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.seen_listings = set()
        self.listing_count = 0
        self.product_count = 0

    # ---------- Entry ----------
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
                        # Try to load more cards a few times (if button exists)
                        *self._load_more_js(self.MAX_LOAD_MORE),
                    ],
                },
            )

    # ---------- Listings ----------
    def parse_listing(self, response):
        if self.listing_count >= self.MAX_LISTINGS:
            return

        url_no_qs = response.url.split("?")[0]
        if url_no_qs in self.seen_listings:
            return
        self.seen_listings.add(url_no_qs)
        self.listing_count += 1

        # Collect detail links from listings (both /product/ and /holidays/...-NZ#####)
        for href in set(response.css("a[href]::attr(href)").getall()):
            url = response.urljoin(href).split("?")[0]
            if PRODUCT_RE.match(url) or HOLIDAY_RE.match(url):
                # Let Scrapy's dupefilter handle repeats (no dont_filter=True)
                yield Request(url, callback=self.parse_detail)

        # Follow more listings (bounded + filtered)
        more = set()
        more.update(response.css("a[href^='/holidays/']::attr(href)").getall())
        more.update(response.css("a[href^='/deals']::attr(href)").getall())
        more.update(response.css("a[href^='/cruises']::attr(href)").getall())
        more.update(response.css("a[href^='/tours']::attr(href)").getall())

        for href in more:
            if self.listing_count >= self.MAX_LISTINGS:
                break
            url = response.urljoin(href).split("?")[0]
            if any(x in url for x in ("/stores", "/help", "/blog", "/window-seat")):
                continue
            if url in self.seen_listings:
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
                        *self._load_more_js(min(2, self.MAX_LOAD_MORE)),
                    ],
                },
            )

    # ---------- Details ----------
    def parse_detail(self, response):
        if self.product_count >= self.MAX_PRODUCTS:
            return
        self.product_count += 1

        body_text = self._norm(" ".join(response.xpath("//body//text()").getall()))
        url = response.url.split("?")[0]

        # Title
        title = (
            self._norm(response.css("h1::text").get())
            or self._meta_title(response)
            or "Flight Centre Deal"
        )

        # Deal number for package_id (from /holidays/...-NZ##### or "Deal number: ######")
        deal_from_path = self._rx_first(r"-NZ(\d+)$", url)
        deal_in_text = self._rx_first(r"Deal number:\s*([0-9]{5,})", body_text)
        deal_number = deal_from_path or deal_in_text
        package_id = f"flightcentre-{deal_number}" if deal_number else self._make_id(url, title)

        # ---- PRICE extraction (JSON-LD → meta → text) ----
        price, currency = self._price_from_jsonld(response)
        if not price:
            price, currency = self._price_from_meta(response)
        if not price:
            price, currency = self._price_from_text(body_text)
        currency = currency or "NZD"

        # Basis
        basis = "per_person" if re.search(r"\b(per\s+person|pp|twin\s+share)\b", body_text, re.I) else "total"

        # Nights / duration
        nights = self._rx_int(r"(\d{1,2})-night (?:cruise|holiday|package)", body_text) \
                 or self._rx_int(r"(\d{1,2})\s*nights?", body_text)
        duration_days = (nights + 1) if isinstance(nights, int) else 0

        # Destinations
        destinations = self._destinations(body_text)
        if not destinations:
            reg = self._rx_first(
                r"\b(Africa|Asia|Australia|Canada|Caribbean|Central America|Europe|Fiji|France|French Polynesia|Germany|Greece|Hawaii|Iceland|Indonesia|Italy|Japan|Maldives|Malaysia|Mexico|Netherlands|New Caledonia|New Zealand|Portugal|Samoa|Singapore|South Africa|South Pacific|Spain|Switzerland|Tahiti|Thailand|UAE|United Arab Emirates|United Kingdom|United States|USA|Vanuatu|Vietnam)\b",
                body_text,
            )
            if reg:
                destinations = [reg]

        includes = self._infer_includes(body_text)
        sale_ends_at = self._rx_first(
            r"(?:This deal expires|On sale until|Sale ends)\s*([0-9]{1,2}\s*[A-Za-z]{3,9}\s*[0-9]{4})",
            body_text,
        )

        item = PackageItem(
            package_id=package_id,
            source="flightcentre",
            url=url,
            title=title,
            destinations=destinations or [],
            duration_days=duration_days,
            nights=nights,
            price=price or 0.0,
            currency=currency,
            price_basis=basis,
            includes=includes,
            hotel={"name": None, "stars": None, "room_type": None},
            sale_ends_at=sale_ends_at,
        )
        yield item.model_dump()

    # ---------- Helpers ----------
    def _load_more_js(self, max_clicks: int):
        # try to click buttons/links that say 'load more' up to N times
        js = f"""
        () => {{
          let clicks = 0;
          const MAX = {int(max_clicks)};
          function findBtn() {{
            const nodes = Array.from(document.querySelectorAll('button, a'));
            return nodes.find(el => /load more|show more|view more/i.test(el.textContent || ''));
          }}
          return new Promise(async (resolve) => {{
            while (clicks < MAX) {{
              const btn = findBtn();
              if (!btn) break;
              btn.click();
              clicks++;
              await new Promise(r => setTimeout(r, 700));
            }}
            resolve();
          }});
        }}
        """
        return [PageMethod("evaluate", js), PageMethod("wait_for_timeout", 400)]

    def _norm(self, s: str) -> str:
        return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "")).strip()

    def _meta_title(self, response) -> str | None:
        t = response.css("meta[property='og:title']::attr(content), title::text").get()
        return self._norm(t) if t else None

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

    # ---- Price extractors ----
    def _price_from_jsonld(self, response):
        for raw in response.css("script[type='application/ld+json']::text").getall():
            try:
                data = json.loads(raw)
            except Exception:
                # Sometimes multiple JSON blocks concatenated; try to split rudimentarily
                for chunk in re.split(r"}\s*{", raw):
                    try:
                        data = json.loads("{" + chunk + "}" if not chunk.strip().startswith("{") else chunk)
                    except Exception:
                        continue
                    p, c = self._scan_jsonld(data)
                    if p:
                        return p, c
                continue
            p, c = self._scan_jsonld(data)
            if p:
                return p, c
        return None, None

    def _scan_jsonld(self, node):
        found = []
        def walk(x):
            if isinstance(x, dict):
                t = x.get("@type") or x.get("type")
                if t in ("Offer", "AggregateOffer"):
                    price = x.get("price") or x.get("lowPrice") or x.get("highPrice")
                    ccy = x.get("priceCurrency")
                    if not price and isinstance(x.get("priceSpecification"), dict):
                        ps = x["priceSpecification"]
                        price = ps.get("price")
                        ccy = ccy or ps.get("priceCurrency")
                    if price:
                        try:
                            val = float(re.sub(r"[^\d.]", "", str(price)))
                            found.append((val, ccy))
                        except Exception:
                            pass
                for v in x.values(): walk(v)
            elif isinstance(x, list):
                for v in x: walk(v)
        walk(node)
        if found:
            # choose the lowest advertised price
            return sorted(found, key=lambda t: t[0])[0]
        return None, None

    def _price_from_meta(self, response):
        mp = response.css("meta[itemprop='price']::attr(content)").get()
        mc = response.css("meta[itemprop='priceCurrency']::attr(content)").get()
        if mp:
            try:
                return float(re.sub(r"[^\d.]", "", mp)), (mc or "NZD")
            except Exception:
                return None, None
        return None, None

    def _price_from_text(self, text: str):
        if not text:
            return None, None
        t = text.replace(",", " ")
        t = re.sub(r"(?<=\$)\s+", "", t)
        # Common: "From $3 489 pp", "Price from NZ$3 489", "From $2,999* twin share"
        m = re.search(r"(?:^|\b)(?:from|price\s*from)\s*(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9\s,\.]{2,})", t, re.I)
        if m:
            try:
                num = float(re.sub(r"[^\d.]", "", m.group(1)))
                # infer currency token near the match
                win = t[max(m.start()-12,0):m.end()]
                cm = re.search(r"(NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", win, re.I)
                ccy = {"NZD":"NZD","AUD":"AUD","USD":"USD","NZ$":"NZD","AU$":"AUD","US$":"USD","$":"NZD"}[(cm.group(1).upper() if cm else "$")]
                return num, ccy
            except Exception:
                pass
        # Fallback: any "$1234" near "per person/pp"
        m2 = re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9\s,\.]{2,})\s*(?:per\s+person|pp|twin\s+share)", t, re.I)
        if m2:
            try:
                num = float(re.sub(r"[^\d.]", "", m2.group(1)))
                return num, "NZD"
            except Exception:
                pass
        return None, None

    # ---- Other fields ----
    def _destinations(self, text: str):
        dests = []
        for m in re.finditer(r"\bDay\s+\d+\s+([A-Za-z][A-Za-z\s\-\.'&()]+?)(?:,| - |—|\.)", text):
            loc = self._norm(m.group(1))
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
        return {"flights": flights or None, "hotel": hotel or None, "board": board, "transfers": transfers, "activities": activities or None}
