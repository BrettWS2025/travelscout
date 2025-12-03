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
    Christchurch NZ "What's On" spider with robust price & location extraction.

    - PRICE:
        * Prefer <h3>Pricing</h3> block (e.g. "$25 - $30").
        * Else, use ticket label ("Free event" / "Donation/koha" / "Paid event (see site)").
        * Else, try dt=Price/Cost -> dd.
    - LOCATION:
        * Accept only address/venue blocks (dd.space-y-0.5 or dt=Location/Venue -> dd).
        * If not found, set "See website for details".
        * Never use the ticket label as location.
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
        parts = [re.sub(r"\s+", " ", x or "").strip() for x in (nodes or [])]
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

    def _parse_dates(self, s: str | None) -> tuple[str | None, str | None]:
        """
        Handles:
          - "15 Dec 2025 | 6:00 pm - 7:30 pm"  -> returns full ISO datetimes (local date, no tz suffix)
          - "3 - 8 March 2026"                 -> returns YYYY-MM-DD start/end
          - "15 Dec 2025"                      -> same start=end = that date
        """
        if not s:
            return None, None
        t = re.sub(r"\s+", " ", s).strip()

        # Case A: "15 Dec 2025 | 6:00 pm - 7:30 pm"
        m = re.match(
            r"^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*\|\s*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm))\s*-\s*([0-9]{1,2}:[0-9]{2}\s*(?:am|pm))$",
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
                    if ap.lower() == "pm" and hh != 12:
                        hh += 12
                    if ap.lower() == "am" and hh == 12:
                        hh = 0
                    return f"{hh:02d}:{mm:02d}:00"
                st_iso = f"{int(y):04d}-{M:02d}-{int(d):02d}T{_hm(st_txt)}"
                en_iso = f"{int(y):04d}-{M:02d}-{int(d):02d}T{_hm(en_txt)}"
                return st_iso, en_iso

        # Case B: "3 - 8 March 2026"
        m = re.match(r"^\s*(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*$", t)
        if m:
            d1, d2, mon, y = m.groups()
            months = {
                "jan":1,"january":1,"feb":2,"february":2,"mar":3,"march":3,"apr":4,"april":4,
                "may":5,"jun":6,"june":6,"jul":7,"july":7,"aug":8,"august":8,"sep":9,"sept":9,
                "september":9,"oct":10,"october":10,"nov":11,"november":11,"dec":12,"december":12,
            }
            M = months.get(mon.lower())
            if M:
                return (f"{int(y):04d}-{M:02d}-{int(d1):02d}",
                        f"{int(y):04d}-{M:02d}-{int(d2):02d}")

        # Case C: "15 Dec 2025"
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
                iso = f"{int(y):04d}-{M:02d}-{int(d):02d}"
                return iso, iso

        return None, None

    # ---- top meta: only date + ticket label (no location here) ----
    def _extract_top_meta(self, response: scrapy.http.Response) -> dict:
        """Top <ul> under <h1>; return date and ticket label only."""
        texts = [self._clean(t) for t in response.xpath("//h1/following::ul[1]/li//text()").getall()]
        texts = [t for t in texts if t]
        date_text = texts[0] if texts else None

        # Find a concise ticket label in the same list
        ticket_label = None
        for t in texts[1:]:
            if re.search(r"\bfree\b", t, re.I):
                ticket_label = "Free event"
                break
            if re.search(r"\bkoha|donation\b", t, re.I):
                ticket_label = "Donation/koha"
                break
            if re.search(r"\bpaid\b", t, re.I):
                ticket_label = "Paid event"
                break

        return {"date_text": date_text, "ticket_label": ticket_label}

    # ---- pricing helpers -------------------------------------------------
    def _normalize_price_text(self, text: str | None) -> str | None:
        """Normalize '$25  - $30' -> '$25 - $30'; retain Free/Koha/Paid markers."""
        if not text:
            return None
        t = re.sub(r"\s+", " ", text).strip()

        # Prefer concise ranges if dollar figures exist
        nums = [x.replace(",", "") for x in re.findall(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)", t)]
        if nums:
            has_dollar = "$" in t
            vals = [float(n) for n in nums]
            lo, hi = min(vals), max(vals)
            if lo == hi:
                return f"${int(lo) if lo.is_integer() else lo:g}" if has_dollar else f"{lo:g}"
            return f"${int(lo) if lo.is_integer() else lo:g} - ${int(hi) if hi.is_integer() else hi:g}" if has_dollar \
                   else f"{lo:g} - {hi:g}"

        if re.search(r"\bfree\b", t, re.I):
            return "Free event"
        if re.search(r"koha|donation", t, re.I):
            return "Donation/koha"
        if re.search(r"\bpaid\b", t, re.I):
            return "Paid event (see site)"
        return t or None

    def _pricing_block_text(self, response: scrapy.http.Response) -> str | None:
        """
        Capture text directly under a 'Pricing' heading (the site often has
        <h3>Pricing</h3><p>$25 - $30</p>).
        """
        LOWER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        UPPER = "abcdefghijklmnopqrstuvwxyz"
        # h3/h2/h4 with 'Pricing' then the *first* following block's text
        txts = response.xpath(
            "//*[self::h2 or self::h3 or self::h4]"
            "[contains(translate(normalize-space(.), $LOWER, $UPPER), 'pricing')]"
            "/following-sibling::*[1]//text()",
            LOWER=LOWER, UPPER=UPPER
        ).getall()
        return self._clean(" ".join(txts)) if txts else None

    def _dd_price_text(self, response: scrapy.http.Response) -> str | None:
        """Fallback: dt=Price/Cost -> next dd."""
        txts = response.xpath(
            "//dt[contains(translate(., 'PRICECOST', 'pricecost'), 'price') or "
            "contains(translate(., 'PRICECOST', 'pricecost'), 'cost')]/following-sibling::dd[1]//text()"
        ).getall()
        return self._clean(" ".join(txts)) if txts else None

    def _extract_price(self, response: scrapy.http.Response, ticket_label: str | None) -> str | None:
        """
        Priority:
          1) 'Pricing' section (dollar amounts)
          2) Ticket label if Free / Donation (Paid only if nothing else)
          3) dt=Price/Cost -> dd
        """
        # 1) Pricing heading block
        pb = self._normalize_price_text(self._pricing_block_text(response))
        if pb:
            return pb

        # 2) Ticket label if meaningful
        if ticket_label:
            if "Free" in ticket_label:
                return "Free event"
            if "Donation" in ticket_label or "koha" in (ticket_label or "").lower():
                return "Donation/koha"
            # If 'Paid event' and no explicit numbers anywhere else:
            # leave a useful marker
            if "Paid" in ticket_label:
                paid_dd = self._normalize_price_text(self._dd_price_text(response))
                return paid_dd or "Paid event (see site)"

        # 3) dt/dd fallback
        dd = self._normalize_price_text(self._dd_price_text(response))
        if dd:
            return dd

        return None

    # ---- location helpers -----------------------------------------------
    def _looks_like_address(self, text: str | None) -> bool:
        """Heuristics to accept only address/venue-like strings as 'location'."""
        if not text:
            return False
        t = text.lower()
        if re.search(r"\b(christchurch|lincoln|rangiora|kaiapoi|lindis|canterbury)\b", t):
            return True
        if re.search(r"\b(st(?:reet)?|rd|road|ave|avenue|lane|ln|drive|dr|place|pl|highway|hwy|mall|park|centre|center|square)\b", t):
            return True
        if re.search(r"\b\d{1,5}\b", t):
            return True
        return False

    def _extract_location(self, response: scrapy.http.Response) -> str | None:
        """
        Only accept real venue/address blocks. If absent, return "See website for details".
        """
        # Preferred: dd.space-y-0.5 with two <p> lines (address + venue)
        parts = [self._clean(t) for t in response.css('dd.space-y-0\\.5 p::text, dd[class*="space-y-0.5"] p::text').getall()]
        parts = [p for p in parts if p]
        if parts:
            candidate = " | ".join(parts)
            if self._looks_like_address(candidate):
                return candidate

        # Fallback: dt=Location/Venue -> dd
        dd_loc = self._clean(" ".join(
            response.xpath(
                "//dt[contains(translate(., 'LOCATIONVENUE', 'locationvenue'), 'location') or "
                "contains(translate(., 'LOCATIONVENUE', 'locationvenue'), 'venue')]/following-sibling::dd[1]//text()"
            ).getall()
        ))
        if dd_loc and self._looks_like_address(dd_loc):
            return dd_loc

        # If nothing address-like found, give a neutral message
        return "See website for details"

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

        # Description
        desc = self._join_text(response.css(".field--name-body p::text, .field--name-body li::text").getall()) \
            or self._join_text(response.css("article p::text, main p::text").getall()) \
            or self._clean(response.css("meta[name='description']::attr(content)").get())

        # Top meta (date + ticket label only)
        meta_top = self._extract_top_meta(response)
        dates_text = meta_top.get("date_text") if meta_top else None

        # Dates
        st, en = self._parse_dates(dates_text or self._clean(" ".join(response.css("time::text").getall())))

        # LOCATION (strict; never use ticket label)
        location = self._extract_location(response)

        # PRICE (Pricing section > ticket label > dt/dd)
        price = self._extract_price(response, meta_top.get("ticket_label") if meta_top else None)

        # Categories (best-effort)
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
            "source": self.domain.split(".")[0],
            "url": response.url,
            "title": title,
            "description": desc,
            "dates": {"start": st, "end": en, "text": dates_text},
            "price": price,                       # now filled from "Pricing" (or a sensible label)
            "location": location,                 # never polluted by ticket labels
            "categories": cats or None,
            "image": image,
            "updated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        }
