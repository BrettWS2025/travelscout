import re
from datetime import datetime
from urllib.parse import urljoin

import scrapy
from parsel import Selector

# If scrapy-playwright is installed & configured in settings (as in your workflow),
# setting meta["playwright"]=True on a Request will render the page in Chromium.
# We only need Playwright on the listing; event detail pages are server-rendered.


class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["www.aucklandnz.com", "aucklandnz.com"]
    start_urls = ["https://www.aucklandnz.com/events-hub/events"]

    custom_settings = {
        # Keep polite and stable; you can override in global settings if you like.
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_TIMEOUT": 60,
        # Ensure duplicate URLs with/without trailing slash don't both queue.
        "DUPEFILTER_CLASS": "scrapy.dupefilters.RFPDupeFilter",
    }

    # --- optional CLI args ---
    # -a load_more=45      -> click the "See more" button up to 45 times on the listing
    # -a listing_pages=0-5 -> also try visiting ?page=N for N in [0..5] (best-effort; site may not use paging)
    def __init__(self, load_more: str = "0", listing_pages: str | None = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            self.load_more = max(0, int(str(load_more).strip()))
        except Exception:
            self.load_more = 0

        self.listing_range = None
        if listing_pages:
            m = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", str(listing_pages))
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                if b >= a:
                    self.listing_range = list(range(a, b + 1))

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

    def _parse_dates(self, s: str | None) -> tuple[str | None, str | None]:
        """Best-effort parser for short date strings like:
        '29 Nov 2025', '07 Jul - 03 Aug 2025', '26 Feb - 03 Aug', 'Today', 'Now - 15 Mar'
        Returns (start_iso, end_iso) in YYYY-MM-DD, or (None, None) on failure.
        """
        if not s:
            return None, None

        txt = s.replace("–", "-").strip()
        # Quick outs
        if re.search(r"\bToday\b|\bNow\b", txt, flags=re.I):
            # Date text is relative; we'll leave structured dates empty.
            return None, None

        months = {
            "jan": 1, "january": 1,
            "feb": 2, "february": 2,
            "mar": 3, "march": 3,
            "apr": 4, "april": 4,
            "may": 5,
            "jun": 6, "june": 6,
            "jul": 7, "july": 7,
            "aug": 8, "august": 8,
            "sep": 9, "sept": 9, "september": 9,
            "oct": 10, "october": 10,
            "nov": 11, "november": 11,
            "dec": 12, "december": 12,
        }

        def to_iso(day: int, mon_name: str, year: int | None) -> str | None:
            m = months.get(mon_name.lower())
            if not (m and year):
                return None
            return f"{year:04d}-{m:02d}-{day:02d}"

        # Capture 1–2 'DD Mon' tokens and up to two years
        dm = re.findall(r"(\d{1,2})\s+([A-Za-z]{3,9})", txt)
        yrs = [int(y) for y in re.findall(r"\b(20\d{2})\b", txt)]
        if not dm:
            return None, None

        if len(dm) == 1:
            d1, m1 = int(dm[0][0]), dm[0][1]
            y1 = yrs[0] if yrs else None
            return to_iso(d1, m1, y1), None

        # len(dm) >= 2 -> range
        d1, m1 = int(dm[0][0]), dm[0][1]
        d2, m2 = int(dm[1][0]), dm[1][1]
        # If only one year is present, assume same year for both ends
        if len(yrs) == 1:
            y1 = y2 = yrs[0]
        elif len(yrs) >= 2:
            y1, y2 = yrs[0], yrs[1]
        else:
            y1 = y2 = None
        return to_iso(d1, m1, y1), to_iso(d2, m2, y2)

    def _extract_top_meta(self, response: scrapy.http.Response) -> dict:
        """
        On event pages, the first UL following the H1 contains small 'meta' items like:
        [date(s), price (optional), location (text or link), maybe 'View times'].
        We'll grab that UL and heuristically assign fields.
        """
        meta_texts = [
            self._clean(t)
            for t in response.xpath("//h1/following::ul[1]/li//text()").getall()
        ]
        meta_texts = [t for t in meta_texts if t]

        date_text = None
        price = None
        location = None

        # Heuristic: first item is usually the date text
        if meta_texts:
            date_text = meta_texts[0]

        # Price = first token that looks like money or 'FREE'
        for t in meta_texts:
            if "$" in t or re.search(r"\bFREE\b", t, flags=re.I):
                price = t
                break

        # Location = first token that is not date/price/view times and not obviously a CTA
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
        # main dynamic listing (render with Playwright)
        yield scrapy.Request(
            self.start_urls[0],
            callback=self.parse_listing_with_playwright,
            meta={"playwright": True, "playwright_include_page": True},
        )

        # optional best-effort query paging (site may or may not support this)
        if self.listing_range:
            for n in self.listing_range:
                url = f"https://www.aucklandnz.com/events-hub/events?page={n}"
                yield scrapy.Request(
                    url,
                    callback=self.parse_listing_with_playwright,
                    meta={"playwright": True, "playwright_include_page": True},
                    dont_filter=True,
                )

    async def parse_listing_with_playwright(self, response: scrapy.http.Response):
        """
        Use Playwright to (optionally) click 'See more' multiple times,
        then extract all event hrefs under /events-hub/events/<slug>.
        """
        page = response.meta["playwright_page"]

        # Try to wait for at least one event card link to appear
        try:
            await page.wait_for_selector(
                "a[href^='/events-hub/events/'], a[href^='https://www.aucklandnz.com/events-hub/events/']",
                timeout=15000,
            )
        except Exception:
            pass

        # Robustly try to click a "See more" or "Show more" control up to self.load_more times
        see_more_selectors = [
            "button:has-text('See More')",
            "button:has-text('See more')",
            "button:has-text('Show more')",
            "a:has-text('See More')",
            "a:has-text('See more')",
            "[data-drupal-views-infinite-scroll] button",
        ]
        for _ in range(self.load_more):
            clicked = False
            for sel in see_more_selectors:
                try:
                    loc = page.locator(sel).first
                    if await loc.is_visible():
                        await loc.click()
                        clicked = True
                        # Give time for network/render
                        await page.wait_for_timeout(1200)
                        break
                except Exception:
                    continue
            if not clicked:
                break

        # Get the fully rendered HTML and parse with parsel
        html = await page.content()
        await page.close()

        sel = Selector(text=html)
        hrefs = set()
        for css in [
            "a[href^='https://www.aucklandnz.com/events-hub/events/']::attr(href)",
            "a[href^='/events-hub/events/']::attr(href)",
        ]:
            hrefs.update(sel.css(css).getall())

        for href in sorted(hrefs):
            abs_url = urljoin("https://www.aucklandnz.com", href)
            # Only accept detail pages under /events-hub/events/<slug> (no querystrings)
            if re.match(r"^https://www\.aucklandnz\.com/events-hub/events/[^/?#]+$", abs_url):
                yield scrapy.Request(abs_url, callback=self.parse_event)

    def parse_event(self, response: scrapy.http.Response):
        title = self._clean(response.css("h1::text").get())

        # Long description: prefer the main article/body block; fallback to meta description
        desc = self._join_text(
            response.css(".field--name-body p::text, .field--name-body li::text").getall()
        )
        if not desc:
            # generic fallback – first few paragraphs in main content
            desc = self._join_text(response.css("main p::text").getall()) or \
                   self._clean(response.css("meta[name='description']::attr(content)").get())

        # Top meta block (date text, price, location)
        top_meta = self._extract_top_meta(response)
        dates_text = top_meta.get("date_text")
        price = top_meta.get("price")
        location = top_meta.get("location")

        # Attempt to parse ISO dates from the date text (best effort; leave None if ambiguous)
        st, en = self._parse_dates(dates_text)

        # Categories are not consistently shown on detail pages;
        # if tags exist near the header, capture them (else None).
        cats = response.css("[class*='category'] a::text, .tags a::text").getall()
        cats = [self._clean(c) for c in cats if self._clean(c)]
        if not cats:
            cats = None

        # Image: prefer OpenGraph/Twitter image; fallback to the first content image
        image = response.css("meta[property='og:image']::attr(content)").get()
        if not image:
            image = response.css("meta[name='twitter:image']::attr(content)").get()
        if not image:
            image = response.css("article img::attr(src), main img::attr(src)").get()
            if image:
                image = urljoin(response.url, image)

        item = {
            "source": "aucklandnz",
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

        # Bonus: follow more event links found on this page (e.g., "Similar events")
        for href in response.css("a[href^='/events-hub/events/']::attr(href)").getall():
            u = urljoin(response.url, href)
            if re.match(r"^https://www\.aucklandnz\.com/events-hub/events/[^/?#]+$", u):
                yield scrapy.Request(u, callback=self.parse_event)
