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


class QueenstownEventsSpider(scrapy.Spider):
    name = "queenstown_events"
    allowed_domains = ["queenstownnz.co.nz", "www.queenstownnz.co.nz"]
    start_urls = ["https://www.queenstownnz.co.nz/things-to-do/events/event-calendar/"]

    custom_settings = {
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_TIMEOUT": 60,
        "DUPEFILTER_CLASS": "scrapy.dupefilters.RFPDupeFilter",
    }

    # CLI args (optional):
    #   -a load_more=120
    #   -a pages=0-12      (best-effort; site may not use ?page=N server-side)
    def __init__(self, load_more: str = "120", pages: str | None = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
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

        self._seen: set[str] = set()

        # Listing selectors
        self.anchor_selector = "a[href^='/event/']"  # for Playwright waits
        self.linksel = "a[href^='/event/']::attr(href), a[href*='/event/']::attr(href)"

        # Allow: /event/<slug>/   OR  /event/<slug>/<id>/
        # (exclude obvious non-detail endpoints)
        self.allow_re = re.compile(
            r"^https?://(?:www\.)?queenstownnz\.co\.nz/event/(?!"
            r"(?:category|categories|tags?|search|event-calendar|venues|series|filters|page)(?:/|$)"
            r")[^?#]+(?:/\d{1,7})?/?$",
            re.I,
        )

    # ---------------- helpers ----------------

    @staticmethod
    def _clean(s: str | None) -> str | None:
        if not s:
            return None
        return re.sub(r"\s+", " ", s).strip() or None

    @staticmethod
    def _join_text(nodes) -> str | None:
        parts = [re.sub(r"\s+", " ", x or "").strip() for x in (nodes or [])]
        parts = [p for p in parts if p]
        return " ".join(parts) if parts else None

    def _normalize_detail_url(self, href: str) -> str | None:
        if not href:
            return None
        absu = urljoin(self.start_urls[0], href)
        scheme, netloc, path, _, _ = urlsplit(absu)
        if not (scheme and netloc and path):
            return None
        clean = urlunsplit((scheme, netloc, path.rstrip("/"), "", ""))
        return clean if self.allow_re.match(clean) else None

    # --- JSON-LD helpers (more reliable for dates/location) ---
    @staticmethod
    def _jsonld_objects(response_text: str):
        sel = Selector(text=response_text or "")
        out = []
        for node in sel.xpath("//script[@type='application/ld+json']/text()").getall():
            try:
                data = node.strip()
                if not data:
                    continue
                parsed = __import__("json").loads(data)
                out.extend(parsed if isinstance(parsed, list) else [parsed])
            except Exception:
                continue
        return out

    @staticmethod
    def _first(d, key, default=None):
        v = None
        if isinstance(d, dict):
            v = d.get(key)
        if isinstance(v, list):
            return v[0] if v else default
        return v if v is not None else default

    @staticmethod
    def _find_event_jsonld(objs):
        for o in objs or []:
            t = o.get("@type")
            if not t:
                continue
            if isinstance(t, list):
                if any("Event" in str(x) for x in t):
                    return o
            elif "Event" in str(t):
                return o
        return None

    def _parse_dates_text(self, text: str | None):
        """
        Handles:
          - "15 Dec 2025 | 6:00 pm - 7:30 pm"
          - "3 - 8 March 2026"
          - "15 Dec 2025"
        Returns (start_iso, end_iso)
        """
        if not text:
            return None, None
        t = re.sub(r"\s+", " ", text).strip()

        # 15 Dec 2025 | 6:00 pm - 7:30 pm
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

        # 3 - 8 March 2026
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
                iso = f"{int(y):04d}-{M:02d}-{int(d):02d}"
                return iso, iso

        return None, None

    # ---------------- crawl ----------------

    def start_requests(self):
        # JS listing page
        yield scrapy.Request(
            self.start_urls[0],
            callback=self.parse_listing_with_playwright,
            meta={"playwright": True, "playwright_include_page": True},
            dont_filter=True,
        )

        # Best-effort “?page=N” probe (site may or may not honor it)
        if self.page_range:
            for n in self.page_range:
                url = f"{self.start_urls[0]}?page={n}"
                yield scrapy.Request(
                    url,
                    callback=self.parse_listing_with_playwright,
                    meta={"playwright": True, "playwright_include_page": True},
                    dont_filter=True,
                )

        # Sitemap pass (cheap, sometimes includes events)
        yield scrapy.Request(
            "https://www.queenstownnz.co.nz/sitemap.xml",
            callback=self.parse_sitemap_index,
            dont_filter=True,
        )

    async def _harvest_links_now(self, page):
        html = await page.content()
        sel = Selector(text=html)
        out = []
        for h in sel.css(self.linksel).getall():
            u = self._normalize_detail_url(h)
            if u and u not in self._seen:
                self._seen.add(u)
                out.append(u)
        return out

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

        # Wait for any event tile anchor
        try:
            await page.wait_for_selector(self.anchor_selector, timeout=15000)
        except Exception:
            pass

        # Immediate harvest
        links = await self._harvest_links_now(page)
        for u in links:
            yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        stagnant = 0
        for _ in range(self.load_more):
            # Scroll to bottom to trigger lazy loading
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            except Exception:
                pass
            await page.wait_for_timeout(700)

            # Try common “load more” controls if visible
            clicked = False
            for sel in (
                "button:has-text('Load more')",
                "button:has-text('Load more events')",
                "button:has-text('See more')",
                "button:has-text('Show more')",
                "a:has-text('Load more')",
            ):
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
                stagnant = 0
            else:
                stagnant += 1
            if not clicked and stagnant >= 3:
                break

        # Final sweep
        final_links = await self._harvest_links_now(page)
        for u in final_links:
            yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        await page.close()
        self.logger.info("Discovered %d unique /event/ detail URLs", len(self._seen))

    # ---- sitemap fallbacks ----
    def parse_sitemap_index(self, response):
        for loc in response.xpath("//loc/text()").getall():
            if loc.endswith(".xml"):
                yield scrapy.Request(loc, callback=self.parse_sitemap_leaf, dont_filter=True)
            else:
                u = self._normalize_detail_url(loc)
                if u and u not in self._seen:
                    self._seen.add(u)
                    yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    def parse_sitemap_leaf(self, response):
        for loc in response.xpath("//url/loc/text()").getall():
            u = self._normalize_detail_url(loc)
            if u and u not in self._seen:
                self._seen.add(u)
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

    # ---------------- detail pages ----------------

    def parse_event(self, response: scrapy.http.Response):
        # Prefer JSON-LD when available
        objs = self._jsonld_objects(response.text)
        ev = self._find_event_jsonld(objs)

        # Title
        title = None
        if ev:
            name = self._first(ev, "name")
            if isinstance(name, str) and name.strip():
                title = name.strip()
        title = title or self._clean(response.css("h1::text").get()) \
            or self._clean(response.css("meta[property='og:title']::attr(content)").get()) \
            or self._clean(response.css("title::text").get())

        # Description
        desc = None
        if ev:
            d = self._first(ev, "description")
            if isinstance(d, str) and d.strip():
                desc = self._clean(d)
        desc = desc or self._join_text(response.css("article p::text, main p::text").getall()) \
            or self._clean(response.css("meta[name='description']::attr(content)").get())

        # Dates
        st = en = None
        dates_text = None
        if ev:
            st = self._first(ev, "startDate")
            en = self._first(ev, "endDate")
        if not (st or en):
            dates_text = self._clean(" ".join(response.css("time::text").getall()))
            st, en = self._parse_dates_text(dates_text)
        else:
            # keep the human text for your schema if we can find it too
            dates_text = dates_text or self._clean(" ".join(response.css("time::text").getall()))

        # Location
        location_text = None
        if ev:
            loc = ev.get("location") or {}
            if isinstance(loc, dict):
                addr = loc.get("address") or {}
                if isinstance(addr, dict):
                    parts = [addr.get("streetAddress"), addr.get("addressLocality"), addr.get("addressRegion"), addr.get("postalCode"), addr.get("addressCountry")]
                    location_text = " | ".join([self._clean(p) for p in parts if self._clean(p)])
        if not location_text:
            # preferred <dd class="space-y-0.5"> p + p pattern
            bits = [self._clean(t) for t in response.css('dd.space-y-0\\.5 p::text, dd[class*="space-y-0.5"] p::text').getall()]
            bits = [b for b in bits if b]
            if bits:
                location_text = " | ".join(bits)
        if not location_text:
            # fallback: dt Location/Venue → next dd
            location_text = self._clean(" ".join(
                response.xpath(
                    "//dt[contains(translate(., 'LOCATIONWHERE', 'locationwhere'), 'location') or "
                    "contains(translate(., 'LOCATIONWHERE', 'locationwhere'), 'where')]/"
                    "following-sibling::dd[1]//text()"
                ).getall()
            ))

        # Price (best-effort)
        price_text = self._clean(" ".join(
            response.xpath(
                "//dt[contains(translate(., 'PRICECOST', 'pricecost'), 'price') or "
                "contains(translate(., 'PRICECOST', 'pricecost'), 'cost')]/"
                "following-sibling::dd[1]//text()"
            ).getall()
        ))

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
            "source": "queenstownnz",
            "url": response.url,
            "title": title,
            "description": desc,
            "dates": {"start": st, "end": en, "text": dates_text},
            "price": price_text,
            "location": location_text,
            "categories": cats or None,
            "image": image,
            "updated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        }
