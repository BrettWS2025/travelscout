# scraper/tscraper/spiders/christchurch_events.py
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


class ChristchurchEventsSpider(scrapy.Spider):
    """
    ChristchurchNZ "What's On" spider with robust date/price/location extraction.

    - LOCATION
      * Prefer explicit address/venue blocks (e.g., “Address” → next block).
      * Accept only address-like content (street names, numbers, Christchurch/Canterbury, etc).
      * If nothing suitable is found, set: "See website for details".

    - PRICE
      * Prefer the page's "Pricing" section (e.g., "$15" or "$25 - $30").
      * Else use ticket label (Free / Donation/koha / Paid) only if no explicit numbers exist.
      * Else try a dt=Price/Cost → dd fallback.

    - DATES
      * Pull from <time>, or from "Event info" block, or the top meta <ul>.
      * Supports:
          "15 Dec 2025 | 6:00 pm - 7:30 pm"
          "3 - 8 March 2026"
          "15 Dec 2025"
          "3 Dec 2025 - 10 Dec 2025 | 1:10 pm - 2:00 pm"
    """
    name = "christchurch_events"

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_TIMEOUT": 60,
        "DUPEFILTER_CLASS": "scrapy.dupefilters.RFPDupeFilter",
    }

    # ---------- init & config ----------
    def __init__(
        self,
        base: str = "https://www.christchurchnz.com/visit/whats-on",
        domain: str = "christchurchnz.com",
        # Accept BOTH /visit/whats-on/<slug> and /visit/whats-on/listing/<slug>
        allow: str = r"^https?://(?:www\.)?christchurchnz\.com/visit/whats-on/(?:listing/)?[^/?#]+$",
        # Element selector for anchors on listings/tiles (no ::attr in Playwright waits!)
        anchor_selector: str = "a[href^='/visit/whats-on/']",
        # CSS used when parsing the page HTML to extract href values:
        linksel: str = "a[href^='/visit/whats-on/']::attr(href), a[href*='/visit/whats-on/']::attr(href)",
        more: str = "",
        load_more: str = "120",
        pages: str | None = "0-12",
        sitemap: str = "https://www.christchurchnz.com/sitemap.xml",
        js_listing: str = "true",
        *args, **kwargs,
    ):
        super().__init__(*args, **kwargs)

        if not base or not domain or not allow:
            raise ValueError("Please provide -a base=..., -a domain=..., -a allow=...")

        self.base = base.rstrip("/")
        self.domain = domain
        self.allow_re = re.compile(allow)
        self.anchor_selector = anchor_selector
        self.linksel = linksel
        self.js_listing = str(js_listing).strip().lower() != "false"

        # See-more selectors (|| separated); we also just scroll/virtualize
        self.more_selectors = [s.strip() for s in (more or "").split("||") if s.strip()] or [
            "button:has-text('Load more')",
            "button:has-text('Load more events')",
            "button:has-text('See more')",
            "button:has-text('Show more')",
            "a:has-text('Load more')",
            "[data-drupal-views-infinite-scroll] button",
        ]

        try:
            self.load_more = max(0, int(str(load_more).strip()))
        except Exception:
            self.load_more = 120

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

        # start URLs / allowed domains
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
        parts = [re.sub(r"\s+", " ", (x or "")).strip() for x in nodes or []]
        parts = [p for p in parts if p]
        return " ".join(parts) if parts else None

    def _normalize_detail_url(self, href: str) -> str | None:
        """Accept only /visit/whats-on/<slug> or /visit/whats-on/listing/<slug>; strip query/fragment."""
        if not href:
            return None
        absu = urljoin(self.base, href)
        scheme, netloc, path, _, _ = urlsplit(absu)
        if not scheme or not netloc or not path:
            return None
        clean = urlunsplit((scheme, netloc, path.rstrip("/"), "", ""))

        # exclude the hub itself and obvious non-detail paths
        if re.search(r"/visit/whats-on/?$", clean):
            return None
        if re.search(r"/visit/whats-on/(category|categories|tags?|search|page/|filters|series|venues|authors?)(/|$)", clean):
            return None

        return clean if self.allow_re.match(clean) else None

    # ---------- dates ----------
    def _month_num(self, mon: str) -> int | None:
        months = {
            "jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,"apr":4,"april":4,
            "may":5,"jun":6,"june":6,"jul":7,"july":7,"aug":8,"august":8,"sep":9,"sept":9,
            "september":9,"oct":10,"october":10,"nov":11,"november":11,"dec":12,"december":12,
        }
        return months.get((mon or "").lower())

    def _hm24(self, s_txt: str) -> str:
        hh, mm, ap = re.match(r"^\s*(\d{1,2}):(\d{2})\s*(am|pm)\s*$", s_txt, re.I).groups()
        hh, mm = int(hh), int(mm)
        if ap.lower() == "pm" and hh != 12:
            hh += 12
        if ap.lower() == "am" and hh == 12:
            hh = 0
        return f"{hh:02d}:{mm:02d}:00"

    def _parse_dates(self, t: str | None) -> tuple[str | None, str | None]:
        """
        Supported:
          A) "15 Dec 2025 | 6:00 pm - 7:30 pm"
          B) "3 - 8 March 2026"
          C) "15 Dec 2025"
          D) "3 Dec 2025 - 10 Dec 2025 | 1:10 pm - 2:00 pm"
        """
        if not t:
            return None, None
        t = re.sub(r"\s+", " ", t).strip()

        # D) Cross-day range with times
        m = re.match(
            r"^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*\|\s*"
            r"([0-9]{1,2}:[0-9]{2}\s*(?:am|pm))\s*-\s*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm))$",
            t, re.I
        )
        if m:
            d1, mon1, y1, d2, mon2, y2, st_txt, en_txt = m.groups()
            M1, M2 = self._month_num(mon1), self._month_num(mon2)
            if M1 and M2:
                st_iso = f"{int(y1):04d}-{M1:02d}-{int(d1):02d}T{self._hm24(st_txt)}"
                en_iso = f"{int(y2):04d}-{M2:02d}-{int(d2):02d}T{self._hm24(en_txt)}"
                return st_iso, en_iso

        # A) Single day with times
        m = re.match(
            r"^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*\|\s*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm))\s*-\s*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm))$",
            t, re.I
        )
        if m:
            d, mon, y, st_txt, en_txt = m.groups()
            M = self._month_num(mon)
            if M:
                st_iso = f"{int(y):04d}-{M:02d}-{int(d):02d}T{self._hm24(st_txt)}"
                en_iso = f"{int(y):04d}-{M:02d}-{int(d):02d}T{self._hm24(en_txt)}"
                return st_iso, en_iso

        # B) Date range without times
        m = re.match(r"^\s*(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*$", t)
        if m:
            d1, d2, mon, y = m.groups()
            M = self._month_num(mon)
            if M:
                return (f"{int(y):04d}-{M:02d}-{int(d1):02d}",
                        f"{int(y):04d}-{M:02d}-{int(d2):02d}")

        # C) Single date, no times
        m = re.match(r"^(\d{1,2})\s+([A-Za-z]{3,9})\s+((?:19|20)\d{2})$", t)
        if m:
            d, mon, y = m.groups()
            M = self._month_num(mon)
            if M:
                iso = f"{int(y):04d}-{M:02d}-{int(d):02d}"
                return iso, iso

        # Lite fallback: try to grab just a first date we can interpret
        dm = re.findall(r"(\d{1,2})\s+([A-Za-z]{3,9})", t)
        yrs = [int(y) for y in re.findall(r"\b(19|20)\d{2}\b", t)]
        if dm and yrs:
            d1, m1 = int(dm[0][0]), dm[0][1]
            y1 = yrs[0]
            M1 = self._month_num(m1)
            return (f"{y1:04d}-{M1:02d}-{d1:02d}" if M1 else None, None)
        return None, None

    def _extract_date_text(self, response: scrapy.http.Response) -> str | None:
        """
        Try (in order):
          1) <time> text
          2) "Event info" heading → first following block
          3) Legacy top meta list under <h1>
        """
        # 1) <time>
        time_text = self._clean(" ".join(response.css("time::text").getall()))
        if time_text:
            return time_text

        # 2) Event info (h2/h3/h4) → next block
        LOWER, UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"
        ev_txt = self._clean(" ".join(
            response.xpath(
                "//*[self::h2 or self::h3 or self::h4]"
                "[contains(translate(normalize-space(.), $LOWER, $UPPER), 'event info')]"
                "/following-sibling::*[1]//text()",
                LOWER=LOWER, UPPER=UPPER
            ).getall()
        ))
        if ev_txt:
            return ev_txt

        # 3) legacy top list
        meta_texts = [self._clean(t) for t in response.xpath("//h1/following::ul[1]/li//text()").getall()]
        meta_texts = [t for t in meta_texts if t]
        return meta_texts[0] if meta_texts else None

    # ---------- price helpers ----------
    def _normalize_price_text(self, text: str | None) -> str | None:
        """
        Normalize '$25  - $30' -> '$25 - $30'; keep 'Free event', 'Donation/koha', 'Paid event (see site)'.
        """
        if not text:
            return None
        t = re.sub(r"\s+", " ", text).strip()

        nums = [x.replace(",", "") for x in re.findall(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)", t)]
        if nums:
            has_dollar = "$" in t
            vals = [float(n) for n in nums]
            lo, hi = min(vals), max(vals)
            if lo == hi:
                return f"${int(lo) if float(lo).is_integer() else lo:g}" if has_dollar else f"{lo:g}"
            return (f"${int(lo) if float(lo).is_integer() else lo:g} - ${int(hi) if float(hi).is_integer() else hi:g}"
                    if has_dollar else f"{lo:g} - {hi:g}")

        if re.search(r"\bfree\b", t, re.I):
            return "Free event"
        if re.search(r"\b(koha|donation)\b", t, re.I):
            return "Donation/koha"
        if re.search(r"\bpaid\b", t, re.I):
            return "Paid event (see site)"
        return t or None

    def _pricing_block_text(self, response: scrapy.http.Response) -> str | None:
        # h2/h3/h4 "Pricing" → the first following block's text
        LOWER, UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"
        txts = response.xpath(
            "//*[self::h2 or self::h3 or self::h4]"
            "[contains(translate(normalize-space(.), $LOWER, $UPPER), 'pricing')]"
            "/following-sibling::*[1]//text()",
            LOWER=LOWER, UPPER=UPPER
        ).getall()
        return self._clean(" ".join(txts)) if txts else None

    def _dd_price_text(self, response: scrapy.http.Response) -> str | None:
        # dt=Price/Cost → next dd
        txts = response.xpath(
            "//dt[contains(translate(., 'PRICECOST', 'pricecost'), 'price') or "
            "contains(translate(., 'PRICECOST', 'pricecost'), 'cost')]"
            "/following-sibling::dd[1]//text()"
        ).getall()
        return self._clean(" ".join(txts)) if txts else None

    def _ticket_label(self, response: scrapy.http.Response) -> str | None:
        # "Ticket pricing" heading → next block (often 'Free event' or 'Paid event')
        LOWER, UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"
        txt = self._clean(" ".join(
            response.xpath(
                "//*[self::h2 or self::h3 or self::h4]"
                "[contains(translate(normalize-space(.), $LOWER, $UPPER), 'ticket pricing')]"
                "/following-sibling::*[1]//text()",
                LOWER=LOWER, UPPER=UPPER
            ).getall()
        ))
        return txt or None

    def _extract_price(self, response: scrapy.http.Response) -> str | None:
        # 1) Pricing section with numbers is best
        pb = self._normalize_price_text(self._pricing_block_text(response))
        if pb:
            return pb

        # 2) Ticket label (Free/Donation/Koha/Paid) if present
        ticket = self._normalize_price_text(self._ticket_label(response))
        if ticket:
            # If ticket says "Paid event (see site)", try to upgrade with dt/dd first
            if ticket.startswith("Paid event"):
                dd = self._normalize_price_text(self._dd_price_text(response))
                return dd or ticket
            return ticket

        # 3) Fallback to dt/dd
        dd = self._normalize_price_text(self._dd_price_text(response))
        if dd:
            return dd

        return None

    # ---------- location helpers ----------
    def _looks_like_address(self, text: str | None) -> bool:
        """Heuristics to accept only address/venue-like strings as 'location'."""
        if not text:
            return False
        t = text.lower()
        if re.search(r"\b(christchurch|lincoln|rangiora|kaiapoi|canterbury|central city)\b", t):
            return True
        if re.search(r"\b(st(?:\.|reet)?|rd|road|ave|avenue|lane|ln|drive|dr|place|pl|terrace|highway|hwy|mall|park|centre|center|square)\b", t):
            return True
        if re.search(r"\b\d{1,5}\b", t):  # house numbers
            return True
        # venue-ish words
        if re.search(r"\b(centre|center|hall|stadium|arena|theatre|theater|cathedral|church|gallery|museum)\b", t):
            return True
        return False

    def _extract_location(self, response: scrapy.http.Response) -> str | None:
        """
        Only accept real venue/address blocks. Never use ticket labels.
        Order:
          1) dd.space-y-0.5 (two-line venue/address blocks common on the site)
          2) dt=Address/Location/Venue → next dd
          3) h2/h3/h4 = Address / Location / Venue / Where → first following block
          4) If still nothing address-like: "See website for details"
        """
        # 1) Tailwind dd with stacked <p> lines
        parts = [self._clean(t) for t in response.css('dd.space-y-0\\.5 p::text, dd[class*="space-y-0.5"] p::text').getall()]
        parts = [p for p in parts if p]
        if parts:
            candidate = " | ".join(parts)
            if self._looks_like_address(candidate):
                return candidate

        # 2) dt=Address/Location/Venue → dd
        dd_loc = self._clean(" ".join(
            response.xpath(
                "//dt[contains(translate(., 'ADDRESSLOCATIONVENUE', 'addresslocationvenue'), 'address') or "
                "contains(translate(., 'ADDRESSLOCATIONVENUE', 'addresslocationvenue'), 'location') or "
                "contains(translate(., 'ADDRESSLOCATIONVENUE', 'addresslocationvenue'), 'venue')]"
                "/following-sibling::dd[1]//text()"
            ).getall()
        ))
        if dd_loc and self._looks_like_address(dd_loc):
            return dd_loc

        # 3) Heading 'Address'/'Location'/'Venue'/'Where' → first following block
        LOWER, UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"
        head_loc = self._clean(" ".join(
            response.xpath(
                "//*[self::h2 or self::h3 or self::h4]"
                "[contains(translate(normalize-space(.), $LOWER, $UPPER), 'address') or "
                " contains(translate(normalize-space(.), $LOWER, $UPPER), 'location') or "
                " contains(translate(normalize-space(.), $LOWER, $UPPER), 'venue') or "
                " contains(translate(normalize-space(.), $LOWER, $UPPER), 'where')]"
                "/following-sibling::*[1]//text()",
                LOWER=LOWER, UPPER=UPPER
            ).getall()
        ))
        if head_loc and self._looks_like_address(head_loc):
            return head_loc

        return "See website for details"

    # ---------- categories ----------
    def _extract_categories(self, response: scrapy.http.Response) -> list[str] | None:
        """
        Try the short pipe-separated line immediately above <h1>, e.g., "Music | Performance".
        Fallback to common tag areas.
        """
        # Immediate block above <h1>
        catline = self._clean(" ".join(
            response.xpath("(//h1)[1]/preceding-sibling::*[1]//text()").getall()
        ))
        if catline and "|" in catline and not re.search(r"\d", catline):
            cats = [self._clean(c) for c in catline.split("|")]
            cats = [c for c in cats if c]
            if 0 < len(cats) <= 6:
                return cats

        # Fallbacks
        cats = response.css("[class*='category'] a::text, .tags a::text").getall()
        cats = [self._clean(c) for c in cats if self._clean(c)]
        return cats or None

    # ---------- crawling ----------
    def start_requests(self):
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

    async def _harvest_links_now(self, page) -> list[str]:
        """Parse current DOM and return new normalized detail URLs."""
        html = await page.content()
        sel = Selector(text=html)
        found = []
        for h in sel.css(self.linksel).getall():
            u = self._normalize_detail_url(h)
            if u and u not in self._seen:
                self._seen.add(u)
                found.append(u)
        return found

    async def parse_listing_with_playwright(self, response: scrapy.http.Response):
        page = response.meta["playwright_page"]

        # Cookie banner (best effort)
        for sel in ("button:has-text('Accept')", "button:has-text('I agree')", "[aria-label*='Accept']"):
            try:
                loc = page.locator(sel).first
                if await loc.is_visible():
                    await loc.click()
                    await page.wait_for_timeout(300)
                    break
            except Exception:
                pass

        # Wait for any listing anchor to exist (NOTE: element selector, not ::attr)
        try:
            await page.wait_for_selector(self.anchor_selector, timeout=15000)
        except Exception:
            pass

        # Harvest immediately
        initial = await self._harvest_links_now(page)
        for u in initial:
            yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        stagnant_rounds = 0
        for _ in range(self.load_more):
            # Scroll to trigger virtualized loading
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            except Exception:
                pass
            await page.wait_for_timeout(700)

            # Try likely "load more" controls if present
            clicked = False
            for sel in self.more_selectors:
                try:
                    loc = page.locator(sel).first
                    if await loc.is_visible():
                        await loc.click()
                        clicked = True
                        try:
                            await page.wait_for_load_state("networkidle", timeout=5000)
                        except Exception:
                            await page.wait_for_timeout(1200)
                        break
                except Exception:
                    continue

            new_links = await self._harvest_links_now(page)
            for u in new_links:
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

            if new_links:
                stagnant_rounds = 0
            else:
                stagnant_rounds += 1

            if not clicked and stagnant_rounds >= 3:
                break

        # Final sweep
        final_links = await self._harvest_links_now(page)
        for u in final_links:
            yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        await page.close()
        self.logger.info("Discovered %d unique detail URLs", len(self._seen))

    def parse_listing(self, response: scrapy.http.Response):
        for h in response.css(self.linksel).getall():
            u = self._normalize_detail_url(h)
            if u and u not in self._seen:
                self._seen.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    # ---------- sitemap fallbacks ----------
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

        # Description (body paragraphs only; avoid meta/labels)
        desc = self._join_text(response.css("article p::text, main article p::text").getall()) \
            or self._join_text(response.css("main p::text").getall()) \
            or self._clean(response.css("meta[name='description']::attr(content)").get())

        # Dates
        dates_text = self._extract_date_text(response)
        st, en = self._parse_dates(dates_text)

        # Location (strict, address-like only)
        location = self._extract_location(response)

        # Price
        price = self._extract_price(response)

        # Categories
        cats = self._extract_categories(response)

        # Image
        image = response.css("meta[property='og:image']::attr(content)").get() \
            or response.css("meta[name='twitter:image']::attr(content)").get()
        if not image:
            img = response.css("article img::attr(src), main img::attr(src)").get()
            if img:
                image = urljoin(response.url, img)

        yield {
            "source": self.domain.split(".")[0],
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
