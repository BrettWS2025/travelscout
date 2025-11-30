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
    allowed_domains = ["venuesotautahi.co.nz", "www.venuesotautahi.co.nz"]
    start_urls = ["https://www.venuesotautahi.co.nz/whats-on"]

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_TIMEOUT": 60,
        # FEEDS is supplied from your workflow; no need to set here
        "DUPEFILTER_CLASS": "scrapy.dupefilters.RFPDupeFilter",
    }

    # CLI args:
    #   -a load_more=150        # max scroll/expand cycles
    #   -a listing_pages=0-12   # also try ?page=N (server-side)
    def __init__(self, load_more: str = "150", listing_pages: str | None = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            self.load_more = max(0, int(str(load_more).strip()))
        except Exception:
            self.load_more = 150

        self.listing_range = None
        if listing_pages:
            m = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", str(listing_pages))
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                if b >= a:
                    self.listing_range = list(range(a, b + 1))

        self._seen_links: set[str] = set()

        # Accept both /visit/whats-on/<slug> and /visit/whats-on/listing/<slug>
        # Avoid hub, queries and fragments.
        self._detail_href_css = (
            "a[href^='/whats-on/']"
            ":not([href='/whats-on/'])"
            ":not([href*='?'])"
            ":not([href*='#'])"
        )
        # Quick “next buttons” we’ll try inside carousels (Swiper etc.)
        self._carousel_next_css = (
            "button[aria-label='Next slide'], "
            "button[aria-label*='Next'], "
            ".swiper-button-next, "
            "button.swiper-button-next, "
            "button:has-text('Next'), "
            "button:has-text('More'), "
            "button:has-text('See more'), "
            "button:has-text('Load more')"
        )

    # ---------------- helpers ----------------

    @staticmethod
    def _clean(s: str | None) -> str | None:
        if not s:
            return None
        return re.sub(r"\s+", " ", s).strip() or None

    @staticmethod
    def _join_text(nodes) -> str | None:
        parts = [re.sub(r"\s+", " ", x).strip() for x in nodes or []]
        parts = [p for p in parts if p]
        return " ".join(parts) if parts else None

    @staticmethod
    def _normalize_event_url(href: str) -> str | None:
        """
        Accept:
          https://www.venuesotautahi.co.nz/whats-on<slug>
        Reject:
          hub (/visit/whats-on/), querystrings and fragments.
        """
        if not href:
            return None
        absu = urljoin("https://www.venuesotautahi.co.nz", href)
        scheme, netloc, path, _, _ = urlsplit(absu)
        if not (scheme and netloc and path):
            return None
        clean = urlunsplit((scheme, netloc, path.rstrip("/"), "", ""))

        # One segment after whats-on, or listing/<slug>
        if re.match(r"^https://(www\.)?venuesotautahi\.co.nz/whats-on[A-Za-z0-9-]+$", clean):
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
            m = months.get(mon_name.lower());  # type: ignore
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
        price = next((t for t in meta_texts if t and ("$" in t or re.search(r"\bFREE\b", t, re.I))), None)
        location = None
        for t in meta_texts:
            if t in (date_text, price):
                continue
            if re.search(r"View times|Plan your route|Plan your transport|Purchase tickets", t or "", re.I):
                continue
            location = t
            break
        return {"date_text": date_text, "price": price, "location": location}

    # ---------------- crawl ----------------

    def start_requests(self):
        # JS listing (virtualized carousels + tiles)
        yield scrapy.Request(
            self.start_urls[0],
            callback=self.parse_listing_with_playwright,
            meta={"playwright": True, "playwright_include_page": True},
            dont_filter=True,
        )

        # Optional server-side pagination (?page=N) just in case
        if self.listing_range:
            for n in self.listing_range:
                url = f"https://www.venuesotautahi.co.nz/whats-on?page={n}"
                yield scrapy.Request(
                    url,
                    callback=self.parse_listing_with_playwright,
                    meta={"playwright": True, "playwright_include_page": True},
                    dont_filter=True,
                )

        # Sitemap fallback
        yield scrapy.Request(
            "https://www.venuesotautahi.com/sitemap.xml",
            callback=self.parse_sitemap_index,
            dont_filter=True,
        )

    async def _harvest_links_now(self, page) -> list[str]:
        """Parse current DOM and return *new* normalized detail URLs."""
        html = await page.content()
        sel = Selector(text=html)
        found = []
        for h in sel.css(f"{self._detail_href_css}::attr(href)").getall():
            u = self._normalize_event_url(h)
            if u and u not in self._seen_links:
                self._seen_links.add(u)
                found.append(u)
        return found

    async def _expand_all_carousels(self, page) -> int:
        """
        Walk through each visible carousel and click a likely 'next' button until
        no new links appear or we hit a per-carousel ceiling.
        """
        total_new = 0
        # Try to find next buttons per carousel group
        nxt_loc = page.locator(self._carousel_next_css)
        count = await nxt_loc.count()
        # Cap the per-carousel steps to avoid long loops
        per_carousel_ceiling = max(10, self.load_more // (count or 1))

        for i in range(count):
            btn = nxt_loc.nth(i)
            stagnant = 0
            for _ in range(per_carousel_ceiling):
                try:
                    if not await btn.is_visible():
                        break
                    await btn.click()
                    try:
                        await page.wait_for_load_state("networkidle", timeout=4000)
                    except Exception:
                        await page.wait_for_timeout(800)
                except Exception:
                    break

                new_links = await self._harvest_links_now(page)
                total_new += len(new_links)
                if new_links:
                    stagnant = 0
                else:
                    stagnant += 1
                    if stagnant >= 3:
                        break
        return total_new

    async def parse_listing_with_playwright(self, response: scrapy.http.Response):
        page = response.meta["playwright_page"]

        # Best-effort cookie dismiss
        for sel in ("button:has-text('Accept')", "button:has-text('I agree')", "[aria-label*='Accept']"):
            try:
                loc = page.locator(sel).first
                if await loc.is_visible():
                    await loc.click()
                    await page.wait_for_timeout(250)
                    break
            except Exception:
                pass

        # Wait until some detail links are in the DOM
        try:
            await page.wait_for_selector(self._detail_href_css, timeout=15000)
        except Exception:
            pass

        # First harvest whatever is visible
        first = await self._harvest_links_now(page)
        for u in first:
            yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        stagnant_rounds = 0
        # Main loop: vertical scroll + carousel expansion + harvest
        for _ in range(self.load_more):
            # Scroll to bottom & give it a tick
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            except Exception:
                pass
            await page.wait_for_timeout(600)

            # Try to expand carousels
            added = await self._expand_all_carousels(page)

            # Harvest again
            newly = await self._harvest_links_now(page)
            for u in newly:
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

            if added or newly:
                stagnant_rounds = 0
            else:
                stagnant_rounds += 1
                if stagnant_rounds >= 3:
                    break

        # Final pass
        final_links = await self._harvest_links_now(page)
        for u in final_links:
            yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        await page.close()
        self.logger.info("Total unique detail URLs discovered: %d", len(self._seen_links))

    # ---- sitemap fallbacks ----
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

    # ---------------- detail pages ----------------

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

        # Follow related tiles on detail page too
        for href in response.css(f"{self._detail_href_css}::attr(href)").getall():
            u = self._normalize_event_url(href)
            if u and u not in self._seen_links:
                self._seen_links.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)
