# scraper/tscraper/spiders/christchurch_events.py
# -*- coding: utf-8 -*-
import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit, urlunsplit

import scrapy
from parsel import Selector

try:
    from scrapy_playwright.page import PageMethod  # enabled by settings if installed
except Exception:  # pragma: no cover
    PageMethod = None


class ChristchurchEventsSpider(scrapy.Spider):
    """
    ChristchurchNZ 'What's On' events.
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
        # Accept both /visit/whats-on/<slug> and /visit/whats-on/listing/<slug>
        allow: str = r"^https?://(?:www\.)?christchurchnz\.com/visit/whats-on/(?:listing/)?[^/?#]+$",
        anchor_selector: str = "a[href^='/visit/whats-on/']",
        linksel: str = "a[href^='/visit/whats-on/']::attr(href), a[href*='/visit/whats-on/']::attr(href)",
        more: str = "",
        load_more: str = "120",
        pages: str | None = None,
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

        self.page_range = None
        if pages:
            m = re.match(r"^\s*(\d+)\s*-\s*(\d+)\s*$", str(pages))
            if m:
                a, b = int(m.group(1)), int(m.group(2))
                if b >= a:
                    self.page_range = list(range(a, b + 1))

        self.sitemap_url = sitemap or self._default_sitemap(self.base)
        self._seen: set[str] = set()

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
        parts = [re.sub(r"\s+", " ", (x or "")).strip() for x in (nodes or [])]
        parts = [p for p in parts if p]
        return " ".join(parts) if parts else None

    def _normalize_detail_url(self, href: str) -> str | None:
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

    def _parse_dates(self, text: str | None) -> tuple[str | None, str | None]:
        """
        Parse either "15 Dec 2025 | 6:00 pm - 7:30 pm",
        or "3 - 8 March 2026", or "15 Dec 2025".
        """
        if not text:
            return None, None
        t = re.sub(r"\s+", " ", text.replace("–", "-")).strip()

        # Full day with start-end time
        m = re.match(
            r"^(\d{1,2})\s+([A-Za-z]{3,9})\s+((?:19|20)\d{2})\s*\|\s*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm))\s*-\s*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm))$",
            t, re.I
        )
        if m:
            d, mon, y, st_txt, en_txt = m.groups()
            months = {
                "jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,"apr":4,"april":4,
                "may":5,"jun":6,"june":6,"jul":7,"july":7,"aug":8,"august":8,"sep":9,"sept":9,
                "september":9,"oct":10,"october":10,"nov":11,"november":11,"dec":12,"december":12,
            }
            M = months.get(mon.lower())
            if M:
                def _hm(s_txt: str) -> str:
                    hh, mm, ap = re.match(r"^\s*(\d{1,2}):(\d{2})\s*(am|pm)\s*$", s_txt, re.I).groups()
                    hh, mm = int(hh), int(mm)
                    if ap.lower() == "pm" and hh != 12: hh += 12
                    if ap.lower() == "am" and hh == 12: hh = 0
                    return f"{hh:02d}:{mm:02d}:00"
                y = int(y); d = int(d)
                return (f"{y:04d}-{M:02d}-{d:02d}T{_hm(st_txt)}",
                        f"{y:04d}-{M:02d}-{d:02d}T{_hm(en_txt)}")

        # Date range (no times)
        m = re.match(r"^\s*(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+((?:19|20)\d{2})\s*$", t)
        if m:
            d1, d2, mon, y = m.groups()
            months = {
                "jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,"apr":4,"april":4,
                "may":5,"jun":6,"june":6,"jul":7,"july":7,"aug":8,"august":8,"sep":9,"sept":9,
                "september":9,"oct":10,"october":10,"nov":11,"november":11,"dec":12,"december":12,
            }
            M = months.get(mon.lower())
            if M:
                y = int(y); d1 = int(d1); d2 = int(d2)
                return (f"{y:04d}-{M:02d}-{d1:02d}",
                        f"{y:04d}-{M:02d}-{d2:02d}")

        # Single date
        m = re.match(r"^(\d{1,2})\s+([A-Za-z]{3,9})\s+((?:19|20)\d{2})$", t)
        if m:
            d, mon, y = m.groups()
            months = {
                "jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,"apr":4,"april":4,
                "may":5,"jun":6,"june":6,"jul":7,"july":7,"aug":8,"august":8,"sep":9,"sept":9,
                "september":9,"oct":10,"october":10,"nov":11,"november":11,"dec":12,"december":12,
            }
            M = months.get(mon.lower())
            if M:
                y = int(y); d = int(d)
                iso = f"{y:04d}-{M:02d}-{d:02d}"
                return iso, iso

        return None, None

    def _event_info_text(self, response: scrapy.http.Response) -> str | None:
        """Text that follows the 'Event info' label, when <time> is missing."""
        txt = self._clean(" ".join(
            response.xpath("//*[normalize-space()='Event info']/following-sibling::*[1]//text()").getall()
        ))
        if txt and re.search(r"\d{1,2}\s+[A-Za-z]{3,9}\s+(?:19|20)\d{2}", txt):
            return txt
        return None

    def _eyebrow_categories(self, response: scrapy.http.Response) -> list[str] | None:
        """
        The small 'eyebrow' just above <h1>, e.g. 'Central City | Festival'.
        Split on '|' or ',' and return a clean list.
        """
        # Last non-empty text node immediately preceding the H1
        t = response.xpath("(//h1/preceding::text()[normalize-space()][1])").get()
        t = self._clean(t)
        if t and ("|" in t or "," in t):
            parts = [self._clean(p) for p in re.split(r"[|,]", t)]
            parts = [p for p in parts if p and p.lower() not in ("home", "visit", "whats on", "what's on")]
            return parts or None

        # Fallback: pill/label classes
        pills = [self._clean(x) for x in response.css("[class*='category'] a::text, .tags a::text").getall()]
        return [p for p in pills if p] or None

    def _pricing_text(self, response: scrapy.http.Response) -> str | None:
        """
        Prefer the explicit 'Pricing' section, e.g. '$59.90 - $299.00'.
        Fallback to 'Ticket pricing' (Free event / Paid event) if no numbers found.
        """
        # 1) Heading 'Pricing' or 'Ticket pricing' -> next block
        def block_after(*headings: str) -> str | None:
            up = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            low = "abcdefghijklmnopqrstuvwxyz"
            for h in headings:
                sel = (f"//*[self::h2 or self::h3 or self::h4]"
                       f"[contains(translate(normalize-space(.), '{up}', '{low}'), '{h.lower()}')]/"
                       f"following-sibling::*[1]//text()")
                t = self._clean(" ".join(response.xpath(sel).getall()))
                if t:
                    return t
            return None

        txt = block_after("Pricing")
        if txt and re.search(r"\$\s*\d", txt):
            return txt

        # 2) Ticket pricing (Paid/Free)
        txt2 = block_after("Ticket pricing", "Ticket price", "Admission")
        return txt2 or None

    @staticmethod
    def _normalize_price_text(text: str | None) -> str | None:
        if not text:
            return None
        t = re.sub(r"\s+", " ", text).strip()

        # Look for explicit $, capture decimals if present so we can format nicely
        raw_nums = re.findall(r"\$?\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", t)
        has_dollar = "$" in t
        if raw_nums:
            vals = []
            saw_decimal = any("." in n for n in raw_nums)
            for n in raw_nums:
                try:
                    vals.append(float(n))
                except Exception:
                    pass
            if vals:
                lo, hi = min(vals), max(vals)

                def fmt(v: float) -> str:
                    if saw_decimal and not float(v).is_integer():
                        return f"{v:.2f}"
                    return f"{int(v)}"

                if lo != hi:
                    return (f"${fmt(lo)} - ${fmt(hi)}") if has_dollar else f"{fmt(lo)} - {fmt(hi)}"
                return (f"${fmt(lo)}") if has_dollar else f"{fmt(lo)}"

        # Otherwise keep meaningful tokens
        if re.search(r"\bfree\b", t, re.I):
            return "Free event"
        if re.search(r"\bpaid\b", t, re.I):
            return "Paid event"
        if re.search(r"koha|donation", t, re.I):
            return "Donation/koha"
        return t or None

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

        if self.sitemap_url:
            yield scrapy.Request(self.sitemap_url, callback=self.parse_sitemap_index, dont_filter=True)

    async def parse_listing_with_playwright(self, response: scrapy.http.Response):
        page = response.meta["playwright_page"]
        try:
            await page.wait_for_selector(self.anchor_selector, timeout=15000)
        except Exception:
            pass

        # 1st harvest
        html = await page.content()
        sel = Selector(text=html)
        for h in sel.css(self.linksel).getall():
            u = self._normalize_detail_url(h)
            if u and u not in self._seen:
                self._seen.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        # Try virtual/infinite loading politely
        stagnant = 0
        for _ in range(self.load_more):
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            except Exception:
                pass
            await page.wait_for_timeout(700)

            clicked = False
            for s in self.more_selectors:
                try:
                    loc = page.locator(s).first
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

            html = await page.content()
            sel = Selector(text=html)
            new = 0
            for h in sel.css(self.linksel).getall():
                u = self._normalize_detail_url(h)
                if u and u not in self._seen:
                    self._seen.add(u)
                    new += 1
                    yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

            stagnant = 0 if new else (stagnant + 1)
            if not clicked and stagnant >= 3:
                break

        await page.close()

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

        # Description (best-effort)
        desc = self._join_text(response.css(".field--name-body p::text, .field--name-body li::text").getall()) \
            or self._join_text(response.css("article p::text, main p::text, section p::text").getall()) \
            or self._clean(response.css("meta[name='description']::attr(content)").get())

        # --- Categories (eyebrow above H1) ---
        categories = self._eyebrow_categories(response)

        # --- Date/time ---
        time_text = self._clean(" ".join(response.css("time::text").getall()))
        if not (time_text and re.search(r"\d", time_text)):
            time_text = self._event_info_text(response)
        st, en = self._parse_dates(time_text)

        # --- Pricing ---
        raw_price = self._pricing_text(response)
        price = self._normalize_price_text(raw_price)

        # --- Location ---
        # Prefer explicit address-style blocks, never “Free/Paid event”
        loc_bits = [self._clean(t) for t in response.css('dd.space-y-0\\.5 p::text, dd[class*="space-y-0.5"] p::text').getall()]
        loc_bits = [b for b in loc_bits if b]
        location = " | ".join(loc_bits) if loc_bits else None
        if not location:
            # dt=Location/Venue -> dd
            location = self._clean(" ".join(
                response.xpath(
                    "//dt[contains(translate(., 'LOCATIONVENUE', 'locationvenue'), 'location') or "
                    "contains(translate(., 'LOCATIONVENUE', 'locationvenue'), 'venue')]/following-sibling::dd[1]//text()"
                ).getall()
            ))
        # filter out tokens that are actually pricing labels
        if location and re.search(r"\bfree\b|\bpaid\b|donation|koha", location, re.I):
            location = None
        if not location:
            location = "See website for details"

        # --- Image ---
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
            "dates": {"start": st, "end": en, "text": time_text},
            "price": price,
            "location": location,
            "categories": categories or None,
            "image": image,
            "updated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        }
