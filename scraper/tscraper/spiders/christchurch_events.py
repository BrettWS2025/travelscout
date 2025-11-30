# scraper/tscraper/spiders/generic_events.py
# -*- coding: utf-8 -*-
import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit, urlunsplit

import scrapy
from parsel import Selector

try:
    from scrapy_playwright.page import PageMethod  # enabled by your settings
except Exception:  # pragma: no cover
    PageMethod = None


class GenericEventsSpider(scrapy.Spider):
    """
    A configurable events spider you can reuse for different sites by
    passing CLI args instead of changing code.

    Required CLI args for a new site:
      -a base=https://example.com/events               (listing hub)
      -a domain=example.com                            (allowed domain)
      -a allow='^https://(?:www\\.)?example\\.com/events/[^/?#]+$'  (detail URL regex)

    Helpful optional args:
      -a linksel="a[href*='/events/']::attr(href)"     (listing link selector)
      -a more="button:has-text('See more')||..."       (custom 'load more' selectors, '||'-separated)
      -a load_more=60                                  (max auto-expand cycles)
      -a pages=0-40                                    (also try ?page=N for that range)
      -a sitemap=https://example.com/sitemap.xml       (explicit sitemap)
      -a js_listing=true|false                         (default true)
    """
    name = "christchurch_events"

    custom_settings = {
        # Keep polite; FEEDS is provided by your workflow at runtime
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_TIMEOUT": 60,
        "DUPEFILTER_CLASS": "scrapy.dupefilters.RFPDupeFilter",
    }

    # ---------- init & config ----------
    def __init__(
        self,
        base: str = "https://www.christchurchnz.com/visit/whats-on/listing",
        domain: str = "christchurchnz.com",
        allow: str = '^https://(?:www\\.)?christchurch\\.com/visit/whats-on/listing[^/?#]+$',
        linksel: str = "a[href*='/visit/whats-on//listing']::attr(href)",
        more: str = "",
        load_more: str = "60",
        pages: str | None = None,
        sitemap: str | None = None,
        js_listing: str = "true",
        *args, **kwargs,
    ):
        super().__init__(*args, **kwargs)

        if not base or not domain or not allow:
            raise ValueError("Please provide -a base=..., -a domain=..., -a allow=...")

        self.base = base.rstrip("/")
        self.domain = domain
        self.allow_re = re.compile(allow)
        self.linksel = linksel
        self.js_listing = str(js_listing).strip().lower() != "false"

        # see-more selectors (|| separated)
        self.more_selectors = [s.strip() for s in (more or "").split("||") if s.strip()] or [
            "button:has-text('Load more')",
            "button:has-text('See more')",
            "button:has-text('Show more')",
            "a:has-text('Load more')",
            "[data-drupal-views-infinite-scroll] button",
        ]

        try:
            self.load_more = max(0, int(str(load_more).strip()))
        except Exception:
            self.load_more = 60

        # pages=a-b
        self.page_range = None
        if pages:
            m = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", str(pages))
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                if b >= a:
                    self.page_range = list(range(a, b + 1))

        self.sitemap_url = sitemap or self._default_sitemap(self.base)
        self._seen: set[str] = set()

        # start URLs
        self.start_urls = [self.base]
        self.allowed_domains = [self.domain, f"www.{self.domain}"]

    @staticmethod
    def _default_sitemap(base_url: str) -> str:
        parts = urlsplit(base_url)
        return urlunsplit((parts.scheme, parts.netloc, "/sitemap.xml", "", ""))

    # ---------- helpers ----------
    @staticmethod
    def _clean(s: str | None) -> str | None:
        if not s:
            return None
        s = re.sub(r"\s+", " ", s).strip()
        return s or None

    @staticmethod
    def _join_text(nodes) -> str | None:
        parts = [re.sub(r"\s+", " ", x).strip() for x in nodes or []]
        parts = [p for p in parts if p]
        return " ".join(parts) if parts else None

    def _normalize_detail_url(self, href: str) -> str | None:
        if not href:
            return None
        absu = urljoin(self.base, href)
        scheme, netloc, path, _, _ = urlsplit(absu)
        if not scheme or not netloc or not path:
            return None
        # strip query/fragment
        clean = urlunsplit((scheme, netloc, path.rstrip("/"), "", ""))
        return clean if self.allow_re.match(clean) else None

    def _parse_dates(self, s: str | None) -> tuple[str | None, str | None]:
        if not s:
            return None, None
        txt = s.replace("–", "-").strip()
        if re.search(r"\bToday\b|\bNow\b", txt, flags=re.I):
            return None, None
        months = {
            "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
            "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
            "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
            "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
        }
        def to_iso(day: int, mon_name: str, year: int | None) -> str | None:
            m = months.get(mon_name.lower())
            if not (m and year):
                return None
            return f"{year:04d}-{m:02d}-{day:02d}"
        dm = re.findall(r"(\d{1,2})\s+([A-Za-z]{3,9})", txt)
        yrs = [int(y) for y in re.findall(r"\b(19|20)\d{2}\b", txt)]  # lenient
        yrs = [int("".join(y)) if isinstance(y, tuple) else int(y) for y in yrs]
        if not dm:
            return None, None
        if len(dm) == 1:
            d1, m1 = int(dm[0][0]), dm[0][1]
            y1 = yrs[0] if yrs else None
            return to_iso(d1, m1, y1), None
        d1, m1 = int(dm[0][0]), dm[0][1]
        d2, m2 = int(dm[1][0]), dm[1][1]
        if len(yrs) == 1:
            y1 = y2 = yrs[0]
        elif len(yrs) >= 2:
            y1, y2 = yrs[0], yrs[1]
        else:
            y1 = y2 = None
        return to_iso(d1, m1, y1), to_iso(d2, m2, y2)

    def _extract_top_meta(self, response: scrapy.http.Response) -> dict:
        # Generic, but you may tweak this per site
        meta_texts = [self._clean(t) for t in response.xpath("//h1/following::ul[1]/li//text()").getall()]
        meta_texts = [t for t in meta_texts if t]
        date_text = meta_texts[0] if meta_texts else None
        price = None
        location = None
        for t in meta_texts:
            if "$" in t or re.search(r"\bFREE\b", t, flags=re.I):
                price = t
                break
        for t in meta_texts:
            if t == date_text or t == price:
                continue
            if re.search(r"View times|Plan your route|Plan your transport|Purchase tickets", t, flags=re.I):
                continue
            location = t
            break
        return {"date_text": date_text, "price": price, "location": location}

    # ---------- crawling ----------
    def start_requests(self):
        # Listing (JS or not)
        if self.js_listing:
            yield scrapy.Request(
                self.base,
                callback=self.parse_listing_with_playwright,
                meta={"playwright": True, "playwright_include_page": True},
                dont_filter=True,
            )
            if self.page_range:
                for n in self.page_range:
                    url = f"{self.base}?page={n}"
                    yield scrapy.Request(
                        url,
                        callback=self.parse_listing_with_playwright,
                        meta={"playwright": True, "playwright_include_page": True},
                        dont_filter=True,
                    )
        else:
            yield scrapy.Request(self.base, callback=self.parse_listing, dont_filter=True)
            if self.page_range:
                for n in self.page_range:
                    url = f"{self.base}?page={n}"
                    yield scrapy.Request(url, callback=self.parse_listing, dont_filter=True)

        # Sitemap pass (best-effort)
        if self.sitemap_url:
            yield scrapy.Request(self.sitemap_url, callback=self.parse_sitemap_index, dont_filter=True)

    async def parse_listing_with_playwright(self, response: scrapy.http.Response):
        page = response.meta["playwright_page"]
        try:
            await page.wait_for_selector(self.linksel, timeout=15000)
        except Exception:
            pass

        last_count = 0
        stagnant_rounds = 0
        for _ in range(self.load_more):
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(700)
            except Exception:
                pass

            clicked = False
            for sel in self.more_selectors:
                try:
                    loc = page.locator(sel).first
                    if await loc.is_visible():
                        await loc.click()
                        clicked = True
                        await page.wait_for_timeout(1200)
                        break
                except Exception:
                    continue

            html = await page.content()
            sel = Selector(text=html)
            hrefs = set(sel.css(self.linksel).getall())
            normalized = {self._normalize_detail_url(h) for h in hrefs}
            normalized.discard(None)

            if len(normalized) > last_count:
                last_count = len(normalized)
                stagnant_rounds = 0
            else:
                stagnant_rounds += 1

            if not clicked and stagnant_rounds >= 3:
                break

        html = await page.content()
        await page.close()

        sel = Selector(text=html)
        for h in sel.css(self.linksel).getall():
            u = self._normalize_detail_url(h)
            if u and u not in self._seen:
                self._seen.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    def parse_listing(self, response: scrapy.http.Response):
        for h in response.css(self.linksel).getall():
            u = self._normalize_detail_url(h)
            if u and u not in self._seen:
                self._seen.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    def parse_sitemap_index(self, response: scrapy.http.Response):
        for loc in response.xpath("//loc/text()").getall():
            if loc.endswith(".xml"):
                yield scrapy.Request(loc, callback=self.parse_sitemap_leaf, dont_filter=True)
            else:
                u = self._normalize_detail_url(loc)
                if u and u not in self._seen:
                    self._seen.add(u)
                    yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    def parse_sitemap_leaf(self, response: scrapy.http.Response):
        for loc in response.xpath("//url/loc/text()").getall():
            u = self._normalize_detail_url(loc)
            if u and u not in self._seen:
                self._seen.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    # ---------- detail pages ----------
    def parse_event(self, response: scrapy.http.Response):
        # Title
        title = self._clean(response.css("h1::text").get()) \
            or self._clean(response.css("meta[property='og:title']::attr(content)").get()) \
            or self._clean(response.css("title::text").get())

        # Description
        desc = self._join_text(response.css(".field--name-body p::text, .field--name-body li::text").getall()) \
            or self._join_text(response.css("article p::text, main p::text").getall()) \
            or self._clean(response.css("meta[name='description']::attr(content)").get())

        # Meta (dates/price/location) – heuristic, tweak if needed per site
        meta = self._extract_top_meta(response)
        dates_text = meta.get("date_text")
        price = meta.get("price")
        location = meta.get("location")

        st, en = self._parse_dates(dates_text)

        # Categories
        cats = response.css("[class*='category'] a::text, .tags a::text").getall()
        cats = [self._clean(c) for c in cats if self._clean(c)] or None

        # Image
        image = response.css("meta[property='og:image']::attr(content)").get() \
            or response.css("meta[name='twitter:image']::attr(content)").get()
        if not image:
            img = response.css("article img::attr(src), main img::attr(src)").get()
            if img:
                image = urljoin(response.url, img)

        yield {
            "source": self.domain.split(".")[0],  # simple label; override if you prefer
            "url": response.url,
            "title": title,
            "description": desc,
            "dates": {"start": st, "end": en, "text": dates_text},
            "price": price,
            "location": location,
            "categories": cats or None,
            "image": image,
            "updated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        }
