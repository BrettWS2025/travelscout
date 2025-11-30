# scraper/tscraper/spiders/auckland_events.py
# -*- coding: utf-8 -*-
import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit, urlunsplit

import scrapy
from parsel import Selector

try:
    from scrapy_playwright.page import PageMethod  # available via your settings
except Exception:  # pragma: no cover
    PageMethod = None


class ChristchurchEventsSpider(scrapy.Spider):
    name = "christchurch_events"
    allowed_domains = ["christchurchnz.com.com", "www.christchurchnz.com.com"]
    start_urls = ["https://www.christchurchnz.com/visit/whats-on"]

    custom_settings = {
        # Politeness + stability; FEEDS is set from your workflow CLI
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_TIMEOUT": 60,
        "DUPEFILTER_CLASS": "scrapy.dupefilters.RFPDupeFilter",
    }

    # Optional CLI args (still supported):
    #  -a load_more=60       -> upper bound on auto-expand iterations
    #  -a listing_pages=0-40 -> also try ?page=N
    def __init__(self, load_more: str = "60", listing_pages: str | None = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            self.load_more = max(0, int(str(load_more).strip()))
        except Exception:
            self.load_more = 60

        self.listing_range = None
        if listing_pages:
            m = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", str(listing_pages))
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                if b >= a:
                    self.listing_range = list(range(a, b + 1))

        # de-dupe across all discovery paths
        self._seen_links: set[str] = set()

    # -------- utilities --------

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
        """Make absolute, strip query/fragment, keep only proper /events-hub/events/<slug>."""
        if not href:
            return None
        absu = urljoin("https://www.christchurchnz.com", href)
        scheme, netloc, path, _, _ = urlsplit(absu)
        if not scheme or not netloc or not path:
            return None
        path = path.rstrip("/")
        clean = urlunsplit((scheme, netloc, path, "", ""))
        if re.match(r"^https://(www\.)?christchurchnz\.com/visit/whats-on[^/]+$", clean):
            return clean
        return None

    def _parse_dates(self, s: str | None) -> tuple[str | None, str | None]:
        # same lightweight date parser you already use
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
        yrs = [int(y) for y in re.findall(r"\b(20\d{2})\b", txt)]
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

    # -------- crawling --------

    def start_requests(self):
        # 1) Listing page (JS): auto-scroll & auto-click until exhausted
        yield scrapy.Request(
            self.start_urls[0],
            callback=self.parse_listing_with_playwright,
            meta={"playwright": True, "playwright_include_page": True},
            dont_filter=True,
        )

        # 2) Best-effort “?page=” enumeration (some Drupal views support it)
        if self.listing_range:
            for n in self.listing_range:
                url = f"https://www.christchurchnz.com/visit/whats-on?page={n}"
                yield scrapy.Request(
                    url,
                    callback=self.parse_listing_with_playwright,
                    meta={"playwright": True, "playwright_include_page": True},
                    dont_filter=True,
                )

        # 3) Sitemap index for completeness (server-rendered; no Playwright)
        yield scrapy.Request(
            "https://www.christchurchnz.com/sitemap.xml",
            callback=self.parse_sitemap_index,
            dont_filter=True,
        )

    async def parse_listing_with_playwright(self, response: scrapy.http.Response):
        page = response.meta["playwright_page"]
        try:
            await page.wait_for_selector("a[href*='/events-hub/events/']", timeout=15000)
        except Exception:
            pass

        # Iterate: scroll + click "more" until no new links (or we hit self.load_more cycles)
        selectors = [
            "button:has-text('Load more')",
            "button:has-text('See more')",
            "button:has-text('Show more')",
            "a:has-text('Load more')",
            "[data-drupal-views-infinite-scroll] button",
        ]

        last_count = 0
        stagnant_rounds = 0
        for _ in range(self.load_more):
            # Scroll to bottom to trigger lazy loads
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(700)
            except Exception:
                pass

            # Try a “more” button if present
            clicked = False
            for sel in selectors:
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
            hrefs = set(sel.css("a[href*='/events-hub/events/']::attr(href)").getall())
            normalized = {self._normalize_event_url(h) for h in hrefs}
            normalized.discard(None)

            if len(normalized) > last_count:
                last_count = len(normalized)
                stagnant_rounds = 0
            else:
                stagnant_rounds += 1

            if not clicked and stagnant_rounds >= 3:
                break

        # Close page and schedule details
        html = await page.content()
        await page.close()

        sel = Selector(text=html)
        hrefs = set(sel.css("a[href*='/events-hub/events/']::attr(href)").getall())
        for h in hrefs:
            u = self._normalize_event_url(h)
            if u and u not in self._seen_links:
                self._seen_links.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    def parse_sitemap_index(self, response: scrapy.http.Response):
        # Follow any children and collect direct event URLs
        locs = response.xpath("//loc/text()").getall()
        for loc in locs:
            if loc.endswith(".xml"):
                # follow all sub-sitemaps; they often contain events
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

    # -------- detail pages --------

    def parse_event(self, response: scrapy.http.Response):
        title = self._clean(response.css("h1::text").get())

        desc = self._join_text(response.css(".field--name-body p::text, .field--name-body li::text").getall())
        if not desc:
            desc = self._join_text(response.css("main p::text").getall()) or \
                   self._clean(response.css("meta[name='description']::attr(content)").get())

        top_meta = self._extract_top_meta(response)
        dates_text = top_meta.get("date_text")
        price = top_meta.get("price")
        location = top_meta.get("location")

        st, en = self._parse_dates(dates_text)

        cats = response.css("[class*='category'] a::text, .tags a::text").getall()
        cats = [self._clean(c) for c in cats if self._clean(c)] or None

        image = response.css("meta[property='og:image']::attr(content)").get()
        if not image:
            image = response.css("meta[name='twitter:image']::attr(content)").get()
        if not image:
            img = response.css("article img::attr(src), main img::attr(src)").get()
            if img:
                image = urljoin(response.url, img)

        item = {
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
        yield item

        # Opportunistically follow additional event links found on the page
        for href in response.css("a[href^='/events-hub/events/']::attr(href)").getall():
            u = self._normalize_event_url(href)
            if u and u not in self._seen_links:
                self._seen_links.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)
