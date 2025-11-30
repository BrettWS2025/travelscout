# scraper/tscraper/spiders/christchurch_events.py
# -*- coding: utf-8 -*-
import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit, urlunsplit

import scrapy
from parsel import Selector

try:
    from scrapy_playwright.page import PageMethod  # available via settings
except Exception:  # pragma: no cover
    PageMethod = None


class ChristchurchEventsSpider(scrapy.Spider):
    name = "christchurch_events"
    allowed_domains = ["christchurchnz.com", "www.christchurchnz.com"]
    start_urls = ["https://www.christchurchnz.com/visit/whats-on/"]

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_TIMEOUT": 60,
        "DUPEFILTER_CLASS": "scrapy.dupefilters.RFPDupeFilter",
    }

    # Optional CLI args:
    #   -a load_more=80
    #   -a listing_pages=0-40  (best-effort; page param may or may not be used)
    def __init__(self, load_more: str = "80", listing_pages: str | None = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            self.load_more = max(0, int(str(load_more).strip()))
        except Exception:
            self.load_more = 80

        self.listing_range = None
        if listing_pages:
            m = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", str(listing_pages))
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                if b >= a:
                    self.listing_range = list(range(a, b + 1))

        self._seen_links: set[str] = set()

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

    @staticmethod
    def _normalize_event_url(href: str) -> str | None:
        """Accept only /visit/whats-on/listing/<slug> detail pages; strip query/fragment."""
        if not href:
            return None
        absu = urljoin("https://www.christchurchnz.com", href)
        scheme, netloc, path, _, _ = urlsplit(absu)
        if not scheme or not netloc or not path:
            return None
        path = path.rstrip("/")
        clean = urlunsplit((scheme, netloc, path, "", ""))
        if re.match(r"^https://(www\.)?christchurchnz\.com/visit/whats-on/listing/[^/?#]+$", clean):
            return clean
        return None

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
        yrs = [int(y) for y in re.findall(r"\b(19|20)\d{2}\b", txt)]
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
        # Listing (JS: infinite scroll / “load more”)
        yield scrapy.Request(
            self.start_urls[0],
            callback=self.parse_listing_with_playwright,
            meta={"playwright": True, "playwright_include_page": True},
            dont_filter=True,
        )

        # Optional page=N probing (if the site uses it)
        if self.listing_range:
            for n in self.listing_range:
                url = f"https://www.christchurchnz.com/visit/whats-on?page={n}"
                yield scrapy.Request(
                    url,
                    callback=self.parse_listing_with_playwright,
                    meta={"playwright": True, "playwright_include_page": True},
                    dont_filter=True,
                )

        # Sitemap pass (may or may not include all listings, but it’s cheap to try)
        yield scrapy.Request(
            "https://www.christchurchnz.com/sitemap.xml",
            callback=self.parse_sitemap_index,
            dont_filter=True,
        )

    async def parse_listing_with_playwright(self, response: scrapy.http.Response):
        page = response.meta["playwright_page"]

        # Dismiss cookie banner if present (best-effort; won't fail the run)
        for sel in ["button:has-text('Accept')", "button:has-text('I agree')", "[aria-label*='Accept']"]:
            try:
                loc = page.locator(sel).first
                if await loc.is_visible():
                    await loc.click()
                    await page.wait_for_timeout(300)
                    break
            except Exception:
                pass

        # Wait specifically for tile anchors to exist
        tile_selector = "a[href^='/visit/whats-on/listing/']"
        try:
            await page.wait_for_selector(tile_selector, timeout=15000)
        except Exception:
            pass

        last_count = 0
        stagnant = 0
        for _ in range(self.load_more):
            # Scroll to bottom to trigger lazy loads (and give it a beat)
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(800)
            except Exception:
                pass

            # Try common “load more” controls
            clicked = False
            for sel in [
                "button:has-text('Load more')",
                "button:has-text('Load more events')",
                "button:has-text('See more')",
                "button:has-text('Show more')",
                "a:has-text('Load more')",
            ]:
                try:
                    loc = page.locator(sel).first
                    if await loc.is_visible():
                        await loc.click()
                        clicked = True
                        # let network settle
                        try:
                            await page.wait_for_load_state("networkidle", timeout=5000)
                        except Exception:
                            await page.wait_for_timeout(1200)
                        break
                except Exception:
                    continue

            # Count how many detail links are currently in the DOM
            html = await page.content()
            n = Selector(text=html).css(tile_selector).getall()
            cur = len(n)

            if cur > last_count:
                last_count = cur
                stagnant = 0
            else:
                stagnant += 1

            # if we neither clicked nor saw growth for a few rounds, bail
            if not clicked and stagnant >= 3:
                break

        # Final harvest
        html = await page.content()
        await page.close()
        sel = Selector(text=html)
        for h in sel.css(f"{tile_selector}::attr(href)").getall():
            u = self._normalize_event_url(h)
            if u and u not in self._seen_links:
                self._seen_links.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    def parse_sitemap_index(self, response: scrapy.http.Response):
        for loc in response.xpath("//loc/text()").getall():
            if loc.endswith(".xml"):
                yield scrapy.Request(loc, callback=self.parse_sitemap_leaf, dont_filter=True)
            else:
                u = self._normalize_event_url(loc)
                if u and u not in self._seen_links:
                    self._seen_links.add(u)
                    yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    def parse_sitemap_leaf(self, response: scrapy.http.Response):
        for loc in response.xpath("//url/loc/text()").getall():
            u = self._normalize_event_url(loc)
            if u and u not in self._seen_links:
                self._seen_links.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    # ---------- detail pages ----------

    def parse_event(self, response: scrapy.http.Response):
        title = self._clean(response.css("h1::text").get()) \
            or self._clean(response.css("meta[property='og:title']::attr(content)").get()) \
            or self._clean(response.css("title::text").get())

        desc = self._join_text(response.css(".field--name-body p::text, .field--name-body li::text").getall()) \
            or self._join_text(response.css("article p::text, main p::text").getall()) \
            or self._clean(response.css("meta[name='description']::attr(content)").get())

        meta = self._extract_top_meta(response)
        dates_text = meta.get("date_text")
        price = meta.get("price")
        location = meta.get("location")
        st, en = self._parse_dates(dates_text)

        cats = response.css("[class*='category'] a::text, .tags a::text").getall()
        cats = [self._clean(c) for c in cats if self._clean(c)] or None

        image = response.css("meta[property='og:image']::attr(content)").get() \
            or response.css("meta[name='twitter:image']::attr(content)").get()
        if not image:
            img = response.css("article img::attr(src), main img::attr(src)").get()
            if img:
                image = urljoin(response.url, img)

        yield {
            "source": "christchurchnz",
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

        # Also follow “similar events” on the page (same strict pattern)
        for href in response.css("a[href^='/visit/whats-on/listing/']::attr(href)").getall():
            u = self._normalize_event_url(href)
            if u and u not in self._seen_links:
                self._seen_links.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)
