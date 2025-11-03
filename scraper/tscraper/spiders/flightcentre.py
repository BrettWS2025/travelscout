import re
import json
import hashlib
import scrapy
from urllib.parse import urlparse, urljoin
from typing import Tuple, Optional, List

from tscraper.items import PackageItem

BASE = "https://www.flightcentre.co.nz"

# STRICT detail URL patterns (no categories/listings)
PRODUCT_DETAIL = re.compile(r"^/product/\d{6,}/?$", re.I)
HOLIDAY_DETAIL = re.compile(
    r"^/holidays/(?!types/|destinations/|inspiration/)[a-z0-9-]+/[a-z0-9-]+-NZ\d{3,}/?$",
    re.I,
)
DEAL_DETAIL = re.compile(r"^/deals?/[a-z0-9-]+-NZ\d{3,}/?$", re.I)

# Things to never follow
DENY = [
    r"/holidays/types/",
    r"/holidays/destinations/",
    r"/holidays/?$",
    r"/accommodation/search",
    r"/cruises/?$",
    r"\?.*\b(page|q|sort|destinations)=",
]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/119.0.0.0 Safari/537.36"
)


class FlightcentreSpider(scrapy.Spider):
    name = "flightcentre"
    allowed_domains = ["flightcentre.co.nz"]
    start_urls = [f"{BASE}/holidays", f"{BASE}/deals"]
    custom_settings = {"DOWNLOAD_DELAY": 0.8}

    def __init__(self, seeds: str = "", *args, **kwargs):
        """
        Optional: space-separated list of explicit detail URLs to guarantee crawling
        (useful while testing).
        Example:
          scrapy crawl flightcentre -a "seeds=https://www.flightcentre.co.nz/holidays/au-qld-port-douglas/4-star-port-douglas-with-great-barrier-reef-cruise-NZ44981 https://www.flightcentre.co.nz/holidays/au-qld-hamilton-island/hamilton-island-romantic-indulgence-at-qualia-NZ52497"
        """
        super().__init__(*args, **kwargs)
        self.seed_urls: List[str] = [u for u in (seeds or "").split() if u.strip()]

    # ---------------- helpers ----------------
    def _pid(self, url, title, price):
        return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()

    def _norm(self, s: str) -> str:
        return re.sub(r"[\u00A0\u202F\s]+", " ", (s or "").strip())

    def _has_currency(self, t: str) -> bool:
        return bool(re.search(r"(?:NZD|AUD|USD|NZ\$|AU\$|US\$|\$)", t or "", re.I))

    def _parse_price_text(self, text: str) -> Optional[float]:
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

    def _detect_currency(self, *texts) -> str:
        blob = " ".join(self._norm(t) for t in texts if t)
        if re.search(r"\bNZD\b|NZ\$", blob, re.I):
            return "NZD"
        if re.search(r"\bAUD\b|AU\$", blob, re.I):
            return "AUD"
        if re.search(r"\bUSD\b|US\$", blob, re.I):
            return "USD"
        return "NZD"

    def _extract_days_nights(self, body: str, hero: str) -> Tuple[Optional[int], Optional[int]]:
        t = f"{hero} {body}"
        m_days = re.search(r"(\d{1,3})\s*days?", t, re.I)
        m_nights = re.search(r"(\d{1,3})\s*nights?", t, re.I)
        days = int(m_days.group(1)) if m_days else None
        nights = int(m_nights.group(1)) if m_nights else None
        if days and (not nights or nights != days - 1):
            nights = max(days - 1, 1)
        duration_days = days or (nights + 1 if nights else None)
        return nights, duration_days

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
                    valid_until = off.get("priceValidUntil")
                    if price:
                        try:
                            return float(str(price).replace(",", "")), currency, valid_until
                        except Exception:
                            continue
        return None, None, None

    def _denied(self, path: str) -> bool:
        return any(re.search(d, path) for d in DENY)

    def _detail_url_or_none(self, base_url: str, href: str) -> Optional[str]:
        if not href:
            return None
        abs_url = urljoin(base_url, href)
        try:
            p = urlparse(abs_url)
        except Exception:
            return None
        if p.netloc != urlparse(BASE).netloc:
            return None
        path = p.path or "/"
        if self._denied(path):
            return None
        if PRODUCT_DETAIL.match(path) or HOLIDAY_DETAIL.match(path) or DEAL_DETAIL.match(path):
            return abs_url
        return None

    # ---------------- crawl ----------------
    def start_requests(self):
        # 1) Explicit seeds (guarantee we fetch your known-good detail pages)
        for u in self.seed_urls:
            yield scrapy.Request(
                u,
                callback=self.parse_detail,
                meta={
                    "playwright": True,
                    "playwright_context_kwargs": {"locale": "en-NZ", "user_agent": UA},
                    "playwright_page_methods": [
                        ("wait_for_load_state", "networkidle"),
                        ("evaluate", "document.querySelector('#onetrust-accept-btn-handler, button:has-text(\\'Accept\\')')?.click?.()"),
                        ("wait_for_timeout", 900),
                    ],
                },
                dont_filter=True,
            )

        # 2) Listing pages (scroll + click “Load more” a few times)
        listing_methods = [
            ("wait_for_load_state", "networkidle"),
            ("evaluate", "document.querySelector('#onetrust-accept-btn-handler, button:has-text(\\'Accept\\')')?.click?.()"),
        ]
        # 5 cycles of scroll + load-more click (simple one-liners for reliability)
        for _ in range(5):
            listing_methods.append(("evaluate", "window.scrollTo(0, document.body.scrollHeight)"))
            listing_methods.append(("wait_for_timeout", 700))
            # Try clicking common load-more buttons
            listing_methods.append((
                "evaluate",
                """
                (()=>{
                  const labels = [/load more/i, /show more/i, /more results/i];
                  for (const sel of ['button','a']) {
                    const btns = Array.from(document.querySelectorAll(sel));
                    const hit = btns.find(b => labels.some(rx => rx.test((b.textContent||''))));
                    if (hit && !hit.disabled) { hit.click(); return true; }
                  }
                  return false;
                })();
                """,
            ))
            listing_methods.append(("wait_for_timeout", 900))

        for url in self.start_urls:
            yield scrapy.Request(
                url,
                callback=self.parse,
                meta={
                    "playwright": True,
                    "playwright_context_kwargs": {"locale": "en-NZ", "user_agent": UA},
                    "playwright_page_methods": listing_methods,
                },
                dont_filter=True,
            )

    def parse(self, response):
        # Detail links only
        for href in response.xpath("//a/@href").getall():
            allow = self._detail_url_or_none(response.url, href)
            if allow:
                yield scrapy.Request(
                    allow,
                    callback=self.parse_detail,
                    meta={
                        "playwright": True,
                        "playwright_context_kwargs": {"locale": "en-NZ", "user_agent": UA},
                        "playwright_page_methods": [
                            ("wait_for_load_state", "networkidle"),
                            ("evaluate", "document.querySelector('#onetrust-accept-btn-handler, button:has-text(\\'Accept\\')')?.click?.()"),
                            ("wait_for_timeout", 700),
                        ],
                    },
                    dont_filter=True,
                )

        # Pagination if present
        for nxt in response.css("a[rel='next']::attr(href), a.pagination__link::attr(href)").getall():
            yield response.follow(
                nxt,
                callback=self.parse,
                meta={
                    "playwright": True,
                    "playwright_context_kwargs": {"locale": "en-NZ", "user_agent": UA},
                    "playwright_page_methods": [("wait_for_load_state", "networkidle"), ("wait_for_timeout", 600)],
                },
            )

    # ---------------- detail ----------------
    def parse_detail(self, response):
        # Title (strip marketing suffix)
        raw_title = self._norm(" ".join(response.css("h1 *::text, h1::text").getall())) \
                 or self._norm(response.css("meta[property='og:title']::attr(content)").get()) \
                 or self._norm(response.css("title::text").get())
        title = re.sub(r"\bEssential holiday info.*$", "", raw_title, flags=re.I).strip()

        hero = self._norm(" ".join(response.css(".c-hero__subtext ::text, .hero__subtext ::text").getall()))
        body = self._norm(" ".join(response.xpath("//body//text()").getall()))

        # Multiple price signals + JSON-LD
        price_block = self._norm(" ".join(response.css(
            "[class*='price'], .price, [data-test*='price'], [data-testid*='price'], [data-qa*='price']"
        ).xpath(".//text()").getall()))
        price_from = self._norm(" ".join(response.xpath(
            "//dl[.//dt[contains(translate(., 'PRICED FROMFROM', 'priced fromfrom'), 'from')]]/dd[1]//text()"
            " | //*[(self::h2 or self::h3 or self::h4) and contains(translate(., 'FROM', 'from'), 'from')]/following::text()[1]"
            " | //*[(self::h2 or self::h3 or self::h4) and contains(translate(., 'FROM', 'from') )]/following::*[self::span or self::strong or self::p or self::div][1]//text()"
        ).getall()))
        price_pricing = self._norm(" ".join(response.xpath(
            "//*[self::h2 or self::h3][contains(translate(., 'PRICING', 'pricing'), 'pricing')]/following::*[position()<=60]//text()"
        ).getall()))
        ld_price, ld_currency, price_valid_until = self._price_from_ldjson(response)
        body_price_text = body if self._has_currency(body) else ""

        price = (
            self._parse_price_text(price_block)
            | self._parse_price_text(price_from)
            | self._parse_price_text(price_pricing)
            | ld_price
            | self._parse_price_text(body_price_text)
        )
        # Python's `or` short-circuits; above uses bitwise OR to allow numbers (floats) without truthiness surprises.
        # Fallback using 'or' if bitwise chain returned None
        price = price or self._parse_price_text(price_block) or self._parse_price_text(price_from) or self._parse_price_text(price_pricing) or ld_price or self._parse_price_text(body_price_text)

        if not (isinstance(price, (int, float)) and price >= 99):
            return

        currency = ld_currency or self._detect_currency(price_block, price_from, price_pricing, body)
        basis_blob = " ".join([price_block, price_from, price_pricing, body])
        price_basis = "per_person" if re.search(r"\bper\s*person\b|twin\s*share|\bpp\b", basis_blob, re.I) else "total"

        nights, duration_days = self._extract_days_nights(body, hero)

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
