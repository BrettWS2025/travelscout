# scraper/tscraper/spiders/queenstown_events.py
# -*- coding: utf-8 -*-
import re
from datetime import datetime
from urllib.parse import urljoin, urlsplit, urlunsplit

import scrapy
from parsel import Selector

try:
    from scrapy_playwright.page import PageMethod  # enabled via settings
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

    # CLI:
    #   scrapy crawl queenstown_events -a max_pages=0   # click until the end (no cap)
    #   scrapy crawl queenstown_events -a max_pages=80  # safety cap
    def __init__(self, max_pages: str = "60", *args, **kwargs):
        super().__init__(*args, **kwargs)
        s = str(max_pages).strip().lower()
        if s in ("0", "all", "inf", "infinite"):
            self.max_pages = 0  # unlimited; stop only when no next / no change
        else:
            try:
                self.max_pages = max(1, int(s))
            except Exception:
                self.max_pages = 60

        self._seen: set[str] = set()

        # Element selector to “wait for tiles” (Playwright waits need element selectors)
        self.anchor_selector = "a[href^='/event/']"
        # HTML parsing selector to extract hrefs:
        self.linksel = "a[href^='/event/']::attr(href), a[href*='/event/']::attr(href)"

        # Accept /event/<slug>/ or /event/<slug>/<id>/ (allow encoded chars), but exclude non-detail endpoints
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

    # ---- JSON-LD helpers (for reliable dates/location) ----
    @staticmethod
    def _jsonld_objects(response_text: str):
        import json
        sel = Selector(text=response_text or "")
        out = []
        for node in sel.xpath("//script[@type='application/ld+json']/text()").getall():
            try:
                data = node.strip()
                if not data:
                    continue
                parsed = json.loads(data)
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
        """Parse common human date strings like '15 Dec 2025 | 6:00 pm - 7:30 pm' or '3 - 8 March 2026'."""
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
                    if ap.lower() == "pm" and hh != 12: hh += 12
                    if ap.lower() == "am" and hh == 12: hh = 0
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

    # ---------------- crawling ----------------

    def start_requests(self):
        yield scrapy.Request(
            self.start_urls[0],
            callback=self.parse_listing_with_playwright,
            meta={"playwright": True, "playwright_include_page": True},
            dont_filter=True,
        )

        # Sitemap (cheap completeness pass)
        yield scrapy.Request(
            "https://www.queenstownnz.co.nz/sitemap.xml",
            callback=self.parse_sitemap_index,
            dont_filter=True,
        )

    async def _mark_listing_container(self, page) -> bool:
        """
        Find the ancestor that contains the MOST /event/ anchors and tag it with
        data-ts-target="events-main". Return True on success.
        """
        js = """
        () => {
          const tiles = Array.from(document.querySelectorAll('a[href^="/event/"]'));
          if (!tiles.length) return false;

          function findContainer(el) {
            let n = el;
            while (n && n !== document.body) {
              const count = n.querySelectorAll('a[href^="/event/"]').length;
              if (count >= 6) return n; // likely grid/section
              n = n.parentElement;
            }
            return null;
          }

          let best = null, bestCount = 0;
          for (const t of tiles) {
            const c = findContainer(t);
            if (c) {
              const count = c.querySelectorAll('a[href^="/event/"]').length;
              if (count > bestCount) { best = c; bestCount = count; }
            }
          }
          if (!best) return false;
          best.setAttribute('data-ts-target', 'events-main');
          return true;
        }
        """
        try:
            return bool(await page.evaluate(js))
        except Exception:
            return False

    async def _tiles_signature(self, page) -> str:
        # Fingerprint ONLY inside the listing container
        js = """
        () => Array.from(
              document.querySelectorAll('[data-ts-target="events-main"] a[href^="/event/"]')
            ).map(a => a.getAttribute('href') || '')
             .slice(0, 200)
             .join('|')
        """
        try:
            return await page.evaluate(js)
        except Exception:
            return ""

    async def _harvest_links_now(self, page) -> list[str]:
        """Parse current DOM inside the container and return fresh, normalized event URLs."""
        html = await page.content()
        sel = Selector(text=html)
        scope = '[data-ts-target="events-main"] '
        out = []
        for h in sel.css(scope + self.linksel).getall():
            u = self._normalize_detail_url(h)
            if u and u not in self._seen:
                self._seen.add(u)
                out.append(u)
        return out

    async def _click_container_next(self, page) -> bool:
        """
        Click the 'next' for the tagged container. Consider success only if the
        container's tile signature changes after the click.
        """
        prev_sig = await self._tiles_signature(page)

        js_click = """
        () => {
          const cont = document.querySelector('[data-ts-target="events-main"]');
          if (!cont) return false;

          // try common next buttons within or near the container
          let next =
              cont.querySelector('a.nxt') ||
              cont.querySelector('a[rel="next"]') ||
              (function() {
                const i = cont.querySelector('i.fa-angle-right');
                return i ? i.closest('a') : null;
              })();

          // if not found inside, try a nearby pager sibling
          if (!next) {
            // look for an adjacent pagination block
            const candidates = Array.from(document.querySelectorAll('a.nxt, a[rel="next"]'));
            for (const c of candidates) {
              // pick the one closest to our container in the DOM tree
              let n = c;
              let hops = 0, ok = false;
              while (n && hops < 6) {
                if (n === cont) { ok = true; break; }
                n = n.parentElement; hops += 1;
              }
              if (ok) { next = c; break; }
            }
          }

          if (!next) return false;
          const cls = (next.getAttribute('class') || '').toLowerCase();
          if (cls.includes('disabled')) return false;

          next.scrollIntoView({behavior: 'instant', block: 'center'});
          next.click();
          return true;
        }
        """
        clicked = False
        try:
            clicked = bool(await page.evaluate(js_click))
        except Exception:
            clicked = False
        if not clicked:
            return False

        # Wait for the container signature to change (or time out)
        try:
            await page.wait_for_function(
                """
                (prev) => {
                  const now = Array.from(
                    document.querySelectorAll('[data-ts-target="events-main"] a[href^="/event/"]')
                  ).map(a => a.getAttribute('href') || '').slice(0,200).join('|');
                  return now && now !== prev;
                }
                """,
                prev_sig,
                timeout=7000,
            )
            return True
        except Exception:
            # fallback: small grace period + re-check
            await page.wait_for_timeout(600)
            return (await self._tiles_signature(page)) != prev_sig

    async def parse_listing_with_playwright(self, response: scrapy.http.Response):
        page = response.meta["playwright_page"]

        # Best-effort cookies/consent dismiss
        for sel in ("button:has-text('Accept')", "button:has-text('I agree')", "[aria-label*='Accept']"):
            try:
                loc = page.locator(sel).first
                if await loc.is_visible():
                    await loc.click()
                    await page.wait_for_timeout(250)
                    break
            except Exception:
                pass

        # Wait until at least one tile link exists
        try:
            await page.wait_for_selector(self.anchor_selector, timeout=15000)
        except Exception:
            pass

        # Tag the main container once
        await self._mark_listing_container(page)

        # Page 1 harvest
        new_links = await self._harvest_links_now(page)
        for u in new_links:
            yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        pages_clicked = 0
        while True:
            if self.max_pages and pages_clicked >= self.max_pages:
                break
            changed = await self._click_container_next(page)
            if not changed:
                break
            pages_clicked += 1

            # harvest after each successful advance
            round_links = await self._harvest_links_now(page)
            for u in round_links:
                yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        # Final sweep (last repaint may have added a few)
        final_links = await self._harvest_links_now(page)
        for u in final_links:
            yield scrapy.Request(u, callback=self.parse_event, dont_filter=True)

        self.logger.info(
            "Discovered %d unique /event/ URLs across ~%d page(s)",
            len(self._seen), pages_clicked + 1
        )
        await page.close()

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
            dates_text = dates_text or self._clean(" ".join(response.css("time::text").getall()))

        # Location (JSON-LD first; fallbacks if needed)
        location_text = None
        if ev:
            loc = ev.get("location") or {}
            if isinstance(loc, dict):
                addr = loc.get("address") or {}
                if isinstance(addr, dict):
                    parts = [addr.get("streetAddress"), addr.get("addressLocality"),
                             addr.get("addressRegion"), addr.get("postalCode"), addr.get("addressCountry")]
                    parts = [self._clean(p) for p in parts if self._clean(p)]
                    if parts:
                        location_text = " | ".join(parts)
        if not location_text:
            bits = [self._clean(t) for t in response.css('dd.space-y-0\\.5 p::text, dd[class*="space-y-0.5"] p::text').getall()]
            bits = [b for b in bits if b]
            if bits:
                location_text = " | ".join(bits)
        if not location_text:
            location_text = self._clean(" ".join(
                response.xpath(
                    "//dt[contains(translate(., 'LOCATIONWHERE', 'locationwhere'), 'location') or "
                    "contains(translate(., 'LOCATIONWHERE', 'locationwhere'), 'where')]/following-sibling::dd[1]//text()"
                ).getall()
            ))

        # Price (best-effort)
        price_text = self._clean(" ".join(
            response.xpath(
                "//dt[contains(translate(., 'PRICECOST', 'pricecost'), 'price') or "
                "contains(translate(., 'PRICECOST', 'pricecost'), 'cost')]/following-sibling::dd[1]//text()"
            ).getall()
        ))

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
