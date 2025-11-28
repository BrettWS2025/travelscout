
import os
import re
from datetime import datetime
from urllib.parse import urljoin

import scrapy
from parsel import Selector
from scrapy_playwright.page import PageMethod

# Flexible imports to match your repo layout
try:
    from tscraper.utils import (
        parse_jsonld, price_from_jsonld, parse_prices, nz_months, clean, filter_links
    )
    from tscraper.items import make_id
except Exception:
    from utils import (
        parse_jsonld, price_from_jsonld, parse_prices, nz_months, clean, filter_links
    )
    from items import make_id


class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz"]
    start_urls = ["https://heartofthecity.co.nz/auckland-events"]

    custom_settings = {
        # Local overrides only for this spider
        "ROBOTSTXT_OBEY": False,
        "RETRY_TIMES": 2,
        "RETRY_HTTP_CODES": [403, 429, 503],
        "HTTPERROR_ALLOWED_CODES": [403, 429, 503],
        "PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT": 45000,
        "FEEDS": {
            "Events.JSONL": {
                "format": "jsonlines",
                "encoding": "utf-8",
                "overwrite": True,
            }
        },
    }

    def start_requests(self):
        proxy = os.getenv("HOTC_PROXY", "").strip() or None

        # Highly realistic headers (Chrome on Windows); helps with some WAFs
        extra_headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Language": "en-NZ,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Dest": "document",
        }
        ctx_kwargs = {
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            "locale": "en-NZ",
            "timezone_id": "Pacific/Auckland",
            "viewport": {"width": 1366, "height": 768},
            "extra_http_headers": extra_headers,
        }
        if proxy:
            ctx_kwargs["proxy"] = {"server": proxy}

        # Minimal stealth to hide webdriver and automation fingerprints
        stealth_scripts = [
            # navigator.webdriver
            PageMethod("add_init_script", "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"),
            # chrome.runtime (fake)
            PageMethod("add_init_script", "window.chrome = window.chrome || { runtime: {} };"),
            # permissions query (notifications) -> 'default' to mimic real browser
            PageMethod("add_init_script", """
                const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
                if (originalQuery) {
                  window.navigator.permissions.query = (parameters) => (
                    parameters && parameters.name === 'notifications'
                      ? Promise.resolve({ state: Notification.permission })
                      : originalQuery(parameters)
                  );
                }
            """),
        ]

        for url in self.start_urls:
            yield scrapy.Request(
                url,
                callback=self.parse_listing,
                errback=self.errback,
                meta={
                    "playwright": True,
                    "playwright_include_page": True,
                    "playwright_context_kwargs": ctx_kwargs,
                    "playwright_page_methods": stealth_scripts,
                    # Let us see the 403 body if WAF blocks
                    "handle_httpstatus_list": [403, 429, 503],
                },
                dont_filter=True,
            )

    async def parse_listing(self, response):
        page = response.meta.get("playwright_page")
        status = getattr(response, "status", None)

        # If blocked, save artifacts and bail early
        if status in (403, 429, 503):
            try:
                await page.screenshot(path="hotc_blocked.png", full_page=True)
                html = await page.content()
                with open("hotc_blocked.html", "w", encoding="utf-8") as f:
                    f.write(html)
            except Exception:
                pass
            self.logger.warning("Blocked (%s) at listing. Saved hotc_blocked.* for debugging.", status)
            if page:
                await page.close()
            return

        # Accept cookie banners if present
        try:
            for text in ["Accept", "I agree", "Got it", "Allow all", "Accept all"]:
                loc = page.get_by_role("button", name=re.compile(text, re.I))
                if await loc.count() > 0 and await loc.first.is_visible():
                    await loc.first.click()
                    break
        except Exception:
            pass

        # Expand list by clicking 'Load more' and lazy scroll
        last_count = 0
        for _ in range(60):
            try:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(750)

                btn = None
                for locator in [
                    page.get_by_role("button", name=re.compile(r"load\\s*more", re.I)),
                    page.locator("button:has-text('Load more')"),
                    page.locator("a:has-text('Load more')"),
                    page.locator("[class*='load'][class*='more']"),
                ]:
                    if await locator.count() > 0 and await locator.first.is_visible():
                        btn = locator.first
                        break
                if btn:
                    await btn.click()
                    await page.wait_for_timeout(900)

                card_count = await page.eval_on_selector_all(
                    "css=.views-row, .card, article, li[class*='view']",
                    "els => els.length"
                )
                self.logger.info("Card count after step: %s", card_count)
                if card_count <= last_count and not btn:
                    break
                last_count = card_count
            except Exception:
                break

        html = await page.content()
        hrefs = await page.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))")
        await page.screenshot(path="hotc_listing.png", full_page=True)
        await page.close()

        allow = [
            r"^/auckland-events/[^/?#]+$",
            r"^/auckland-events/[^/]+/[^/?#]+$",
        ]
        deny = [
            r"/auckland-events/(?:exhibitions|festivals|music-events|food-drink-events|theatre|today|tomorrow|this-week|this-month|next-7-days|next-30-days|weekend|search)\\b",
            r"\\?$",
        ]
        links = filter_links(response.url, hrefs, allow, deny)
        self.logger.info("Candidate detail pages kept after filtering: %d", len(links))

        if not links:
            os.makedirs("debug", exist_ok=True)
            with open(os.path.join("debug","hotc_listing.html"), "w", encoding="utf-8") as f:
                f.write(html)
            with open(os.path.join("debug","hotc_links.txt"), "w", encoding="utf-8") as f:
                f.write("\\n".join([str(h) for h in hrefs]))
            self.logger.warning("Saved debug artifacts under ./debug/")

        for link in links:
            yield scrapy.Request(
                link,
                callback=self.parse_event,
                errback=self.errback,
                meta={
                    "playwright": True,
                    "playwright_context_kwargs": response.request.meta.get("playwright_context_kwargs"),
                    "playwright_page_methods": response.request.meta.get("playwright_page_methods"),
                    "handle_httpstatus_list": [403, 429, 503],
                },
                dont_filter=True,
            )

    def errback(self, failure):
        self.logger.warning("Request failed: %s", failure)

    def _text(self, sel, *css):
        for c in css:
            v = sel.css(c).get()
            if v:
                return clean(v)
        return None

    def _all_texts(self, sel, *css):
        out = []
        for c in css:
            out.extend([clean(x) for x in sel.css(c).getall() if clean(x)])
        seen = set(); uniq = []
        for x in out:
            if x not in seen:
                uniq.append(x); seen.add(x)
        return uniq

    def _extract_categories(self, sel):
        cats = self._all_texts(
            sel,
            "a[rel='tag']::text",
            ".field--name-field-categories a::text",
            ".term-list a::text",
            "nav.breadcrumb a::text",
        )
        cats = [c for c in cats if c and c.lower() not in {"home", "events", "what's on", "what’s on"}]
        return cats[:8]

    def _extract_location(self, sel, jsonld_objs):
        loc = {"name": None, "address": None, "city": "Auckland", "region": "Auckland", "country": "New Zealand",
               "latitude": None, "longitude": None}
        try:
            for obj in (jsonld_objs or []):
                v = obj.get("location") or {}
                if isinstance(v, dict):
                    loc["name"] = loc["name"] or clean(v.get("name"))
                    addr = v.get("address") or {}
                    if isinstance(addr, dict):
                        addr_text = ", ".join([addr.get(k) for k in ["streetAddress", "addressLocality", "postalCode"] if addr.get(k)])
                        loc["address"] = loc["address"] or clean(addr_text)
                        loc["city"] = clean(addr.get("addressLocality")) or loc["city"]
                        loc["region"] = clean(addr.get("addressRegion")) or loc["region"]
                        loc["country"] = clean(addr.get("addressCountry")) or loc["country"]
                    geo = v.get("geo") or {}
                    if isinstance(geo, dict):
                        loc["latitude"] = geo.get("latitude") or loc["latitude"]
                        loc["longitude"] = geo.get("longitude") or loc["longitude"]
                    break
        except Exception:
            pass

        if not loc.get("name"):
            loc["name"] = self._text(sel,
                                     ".field--name-field-venue .field__item::text",
                                     ".event-venue::text",
                                     "div[class*='location'] ::text")
        if not loc.get("address"):
            addr = self._text(sel,
                              ".field--name-field-address .field__item::text",
                              "div[class*='address'] ::text")
            loc["address"] = addr

        return loc

    def _extract_price(self, sel, jsonld_objs):
        p, ccy, _ = price_from_jsonld(jsonld_objs)
        if isinstance(p, (int, float)):
            return {"currency": (ccy or "NZD"), "min": float(p), "max": float(p), "text": None, "free": (float(p) == 0.0)}

        price_text = " ".join(sel.css("[class*='price'], .price ::text").getall()) or \
                     " ".join(sel.xpath("//*[contains(translate(text(),'PRICE','price'),'price')]/text()").getall())
        if price_text:
            return parse_prices(price_text)

        tix_text = " ".join(sel.xpath("//*[contains(translate(text(),'TICKETS','tickets'),'tickets')]/following::text()[position()<5]").getall())
        if tix_text:
            return parse_prices(tix_text)

        return {"currency": "NZD", "min": None, "max": None, "text": None, "free": False}

    def _opening_hours_text(self, sel):
        bits = self._all_texts(
            sel,
            "time::attr(datetime)",
            "time::text",
            ".field--name-field-date .field__item::text",
            ".event-date::text",
            ".event-time::text",
            "dl dt:contains('Time') + dd ::text",
            "dl dt:contains('Hours') + dd ::text",
        )
        if bits:
            import re as _re
            s = " | ".join(bits)
            s = _re.sub(r"\\s+", " ", s).strip()
            return s[:400]
        return None

    def _operating_months(self, sel):
        blob = " ".join(sel.xpath("//body//text()").getall())
        months = nz_months(blob)
        return months

    def parse_event(self, response):
        status = getattr(response, "status", None)
        if status in (403, 429, 503):
            self.logger.warning("Blocked (%s) at detail: %s", status, response.url)
            return

        sel = response.selector
        jsonld_objs = parse_jsonld(response.text)

        name = self._text(sel, "h1::text", "meta[property='og:title']::attr(content)")
        if not name:
            try:
                for obj in (jsonld_objs or []):
                    n = obj.get("name")
                    if isinstance(n, str) and n.strip():
                        name = n.strip()
                        break
            except Exception:
                pass

        url = response.url
        out = {
            "id": make_id(url),
            "record_type": "event",
            "name": name or url,
            "categories": self._extract_categories(sel),
            "url": url,
            "source": "heartofthecity.co.nz",
            "location": self._extract_location(sel, jsonld_objs),
            "price": self._extract_price(sel, jsonld_objs),
            "opening_hours": self._opening_hours_text(sel),
            "operating_months": self._operating_months(sel),
            "data_collected_at": datetime.utcnow().isoformat(),
        }
        self.logger.info("Yielding event: %s", out.get("name"))

        yield {
            k: out.get(k)
            for k in [
                "id",
                "record_type",
                "name",
                "categories",
                "url",
                "source",
                "location",
                "price",
                "opening_hours",
                "operating_months",
                "data_collected_at",
            ]
        }
