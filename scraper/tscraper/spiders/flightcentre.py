# scraper/tscraper/spiders/flightcentre.py
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
    # Main hubs where "Show more holidays" appears
    f"{BASE}/holidays",
    f"{BASE}/deals",
    f"{BASE}/cruises",
    f"{BASE}/tours",

    # Region/country hubs (broad, cheap to request; high card density)
    f"{BASE}/holidays/fj",  f"{BASE}/holidays/ck",  f"{BASE}/holidays/au",
    f"{BASE}/holidays/us",  f"{BASE}/holidays/ca",  f"{BASE}/holidays/gb",
    f"{BASE}/holidays/eu",  f"{BASE}/holidays/jp",  f"{BASE}/holidays/fr",
    f"{BASE}/holidays/sg",  f"{BASE}/holidays/ae",  f"{BASE}/holidays/nz",
    f"{BASE}/holidays/th",  f"{BASE}/holidays/id",  f"{BASE}/holidays/vn",
    f"{BASE}/holidays/mx",
]

# Detail page patterns
PRODUCT_RE = re.compile(r"^https?://(?:www\.)?flightcentre\.co\.nz/product/\d+/?$")
HOLIDAY_RE = re.compile(r"^https?://(?:www\.)?flightcentre\.co\.nz/holidays/.+-NZ\d+/?$", re.I)

# ---- Playwright helpers ----
async def block_resources(route):
    req = route.request
    if req.resource_type in {"image", "media", "font", "stylesheet"}:
        await route.abort()
    else:
        await route.continue_()

def _js_click_show_more_until_stable(max_clicks: int):
    """
    Click 'Show more' / 'Load more' repeatedly until either:
    - MAX clicks reached, OR
    - card count stops increasing, OR
    - the button disappears.
    """
    return PageMethod("evaluate", f"""
        async () => {{
          const MAX = {int(max_clicks)};
          let clicks = 0;

          function countCards() {{
            const set = new Set();
            document.querySelectorAll("a[href*='/holidays/'], [data-href*='/holidays/'], [data-url*='/holidays/'], [data-link*='/holidays/']")
              .forEach(el => {{
                const href = el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('data-link') || '';
                if (/\\-NZ\\d+\\/?$/.test(href)) {{
                  try {{ set.add(new URL(href, location.href).pathname); }} catch(_){}
                }}
              }});
            return set.size;
          }}

          function findBtn() {{
            const nodes = Array.from(document.querySelectorAll('button, a'));
            return nodes.find(el => /\\b(show|load|view)\\s*more\\b/i.test(el.textContent || '') ||
                                    /show\\s*more\\s*holidays/i.test(el.textContent || '') ||
                                    /more\\s*results/i.test(el.textContent || '') ||
                                    /aria-label/i.test([...el.attributes].map(a=>a.name).join('')) && /more/i.test(el.getAttribute('aria-label')||''));
          }}

          let prev = countCards();
          while (clicks < MAX) {{
            const btn = findBtn();
            if (!btn) break;
            btn.click();
            clicks++;
            await new Promise(r => setTimeout(r, 900));
            window.scrollBy(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 700));
            const now = countCards();
            if (now <= prev) break;  // no growth -> stop
            prev = now;
          }}
        }}
    """)

def _js_infinite_scroll(cycles: int = 8, pause_ms: int = 400):
    return PageMethod("evaluate", f"""
        async () => {{
          for (let i = 0; i < {int(cycles)}; i++) {{
            window.scrollBy(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, {int(pause_ms)}));
          }}
        }}
    """)

class FlightCentreSpider(scrapy.Spider):
    name = "flightcentre"
    allowed_domains = ["flightcentre.co.nz", "www.flightcentre.co.nz"]

    # Bound the crawl; rely on sitemap spider for breadth
    MAX_LISTINGS = 150       # sweep more region pages
    MAX_PRODUCTS = 5000      # safety cap
    MAX_LOAD_MORE = 50       # more 'Show more' cycles on hubs

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "USER_AGENT": "TravelScoutBot/1.0 (+contact: data@travelscout.example)",
        "CONCURRENT_REQUESTS": 8,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 4,
        "DOWNLOAD_DELAY": 1.1,
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
        "CLOSESPIDER_TIMEOUT": 1800,  # ~30 minutes hard stop
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.seen_listings = set()
        self.listing_count = 0
        self.product_count = 0
        self.seen_detail_urls = set()

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
                        _js_infinite_scroll(8, 400),                      # trigger lazy sections
                        _js_click_show_more_until_stable(self.MAX_LOAD_MORE),
                        _js_infinite_scroll(4, 350),
                    ],
                },
            )

    # ---------- Listings ----------
    def parse_listing(self, response):
        if self.listing_count >= self.MAX_LISTINGS:
            return

        root = response.url.split("?")[0]
        if root in self.seen_listings:
            return
        self.seen_listings.add(root)
        self.listing_count += 1

        # Collect detail links from anchors and common data-* wrappers
        for url in self._extract_detail_urls(response):
            if url in self.seen_detail_urls:
                continue
            self.seen_detail_urls.add(url)
            yield Request(url, callback=self.parse_detail)

        # Follow more listings (bounded)
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
                        _js_infinite_scroll(6, 350),
                        _js_click_show_more_until_stable(min(25, self.MAX_LOAD_MORE)),
                    ],
                },
            )

    def _extract_detail_urls(self, response):
        """
        Extract /holidays/...-NZ##### and /product/###### URLs from:
          - <a href=...>
          - data-href / data-url / data-link
          - onclick handlers like "location.href='...'"
        """
        candidates = set()

        # 1) Plain anchors
        for href in response.css("a[href]::attr(href)").getall():
            u = response.urljoin(href).split("?")[0]
            if PRODUCT_RE.match(u) or HOLIDAY_RE.match(u):
                candidates.add(u)

        # 2) data-* attributes
        for attr in ("data-href", "data-url", "data-link"):
            for href in response.css(f"[{attr}]::attr({attr})").getall():
                u = response.urljoin(href).split("?")[0]
                if PRODUCT_RE.match(u) or HOLIDAY_RE.match(u):
                    candidates.add(u)

        # 3) onclick handlers
        for onclick in response.css("[onclick]::attr(onclick)").getall():
            m = re.search(r"location\\.href\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]", onclick)
            if m:
                u = response.urljoin(m.group(1)).split("?")[0]
                if PRODUCT_RE.match(u) or HOLIDAY_RE.match(u):
                    candidates.add(u)

        return candidates

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

        # Deal number for package_id (from slug -NZ##### or page text)
        deal_from_path = self._rx_first(r"-NZ(\d+)$", url)
        deal_in_text = self._rx_first(r"Deal number:\s*([0-9]{5,})", body_text)
        deal_number = deal_from_path or deal_in_text
        package_id = f"flightcentre-{deal_number}" if deal_number else self._make_id(url, title)

        # If this is a /holidays/... page and we saw a deal number, probe /product/{id} too
        if (deal_number and "flightcentre.co.nz/holidays/" in url):
            product_url = f"{BASE}/product/{deal_number}"
            if product_url not in self.seen_detail_urls:
                self.seen_detail_urls.add(product_url)
                yield response.follow(product_url, callback=self.parse_detail)

        # ---- PRICE extraction: JSON-LD → meta → any JSON → text ----
        price, currency = self._price_from_jsonld(response)
        if not price:
            price, currency = self._price_from_meta(response)
        if not price:
            price, currency = self._price_from_any_json(response)
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
                # handle concatenated blocks
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

    def _price_from_any_json(self, response):
        """
        Some FC detail pages hydrate with embedded JSON (Next.js/data blobs).
        Scan <script type="application/json"> and untyped <script> blocks for common keys.
        """
        KEYS = ("price", "fromPrice", "leadPrice", "amount", "valueInCents")
        for sel in ["script[type='application/json']::text", "script:not([src])::text"]:
            for raw in response.css(sel).getall():
                try:
                    data = json.loads(raw.strip())
                except Exception:
                    continue
                price = self._dig_for_price(data, KEYS)
                if price is not None:
                    try:
                        v = float(re.sub(r"[^\d.]", "", str(price)))
                        ccy = self._dig_for_currency(data) or None
                        return v, ccy
                    except Exception:
                        pass
        return None, None

    def _dig_for_price(self, node, keys):
        found = []
        def walk(x):
            if isinstance(x, dict):
                for k, v in x.items():
                    if any(k.lower() == kk.lower() for kk in keys):
                        found.append(v)
                    walk(v)
            elif isinstance(x, list):
                for v in x: walk(v)
        walk(node)
        return found[0] if found else None

    def _dig_for_currency(self, node):
        for key in ("currency", "priceCurrency"):
            v = self._find_key(node, key)
            if v:
                return str(v).upper()
        return None

    def _find_key(self, node, needle):
        if isinstance(node, dict):
            for k, v in node.items():
                if k.lower() == needle.lower():
                    return v
                out = self._find_key(v, needle)
                if out is not None:
                    return out
        elif isinstance(node, list):
            for v in node:
                out = self._find_key(v, needle)
                if out is not None:
                    return out
        return None

    def _price_from_text(self, text: str):
        if not text:
            return None, None
        t = text.replace(",", " ")
        t = re.sub(r"(?<=\$)\s+", "", t)
        # "From $3 489 pp", "Price from NZ$3 489", "From $2,999* twin share"
        m = re.search(r"(?:^|\b)(?:from|price\s*from)\s*(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)\s*([0-9][0-9\s,\.]{2,})", t, re.I)
        if m:
            try:
                num = float(re.sub(r"[^\d.]", "", m.group(1)))
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
