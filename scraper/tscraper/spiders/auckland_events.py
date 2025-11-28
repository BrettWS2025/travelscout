
import re
from datetime import datetime
from urllib.parse import urljoin

import scrapy
from parsel import Selector

# Scrapy-Playwright is required by requirements.txt and settings.py
# We will use it to click the "Load more" button until all events are visible.
# (See settings.py for the download handlers and reactor configuration.)

from tscraper.utils import (
    parse_jsonld, price_from_jsonld, parse_prices, nz_months, clean, filter_links
)
from tscraper.items import make_id

NZ_TZ = "Pacific/Auckland"


class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["heartofthecity.co.nz"]
    start_urls = ["https://heartofthecity.co.nz/auckland-events"]

    custom_settings = {
        # Write ONLY the requested fields to Events.JSONL on each run.
        # Use -o to append if you prefer (scrapy crawl auckland_events -o Events.JSONL).
        "FEEDS": {
            "Events.JSONL": {
                "format": "jsonlines",
                "encoding": "utf-8",
                "overwrite": True,
            }
        },
        # Be polite; these play nicely with the base settings you already have.
        "DOWNLOAD_DELAY": 0.25,
        "AUTOTHROTTLE_ENABLED": True,
    }

    def start_requests(self):
        for url in self.start_urls:
            yield scrapy.Request(
                url,
                meta={
                    "playwright": True,
                    "playwright_include_page": True,  # we need the Page to click "Load more"
                    "errback": self.errback,
                },
                callback=self.parse_listing,
            )

    async def parse_listing(self, response):
        """
        Render the full listing by clicking "Load more" repeatedly.
        Then collect the event detail URLs for parsing.
        """
        page = response.meta["playwright_page"]

        # Opportunistically accept cookie banners if present.
        try:
            for text in ["Accept", "I agree", "Got it"]:
                loc = page.get_by_role("button", name=re.compile(text, re.I))
                if await loc.is_visible():
                    await loc.click()
                    break
        except Exception:
            pass

        # Keep clicking "Load more" until it disappears or no new cards are added.
        last_count = 0
        max_clicks = 60  # safety cap
        for _ in range(max_clicks):
            try:
                # Scroll so the button is in view.
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                # Try common ways the site might label the control.
                btn = None
                for locator in [
                    page.get_by_role("button", name=re.compile(r"load more", re.I)),
                    page.locator("button:has-text('Load more')"),
                    page.locator("a:has-text('Load more')"),
                    page.locator("[class*='load'][class*='more']"),
                ]:
                    if await locator.count() > 0 and await locator.first.is_visible():
                        btn = locator.first
                        break

                if not btn:
                    break

                await btn.click()
                # Wait for new cards to appear (try common card containers)
                await page.wait_for_timeout(800)  # small delay for the ajax render
                # Count possible event tiles
                card_count = await page.eval_on_selector_all(
                    "css=.views-row, .card, article, li[class*='view']",
                    "els => els.length"
                )
                if card_count <= last_count:
                    # No increase -> assume we're done
                    break
                last_count = card_count
            except Exception:
                break

        # Grab the fully rendered HTML
        html = await page.content()
        await page.close()  # tidy up
        sel = Selector(text=html)

        # Collect candidate links from the rendered listing
        hrefs = sel.css("a::attr(href)").getall()

        # Keep only event detail pages under /auckland-events/<slug>
        allow = [r"^/auckland-events/[^/?#]+$"]
        deny = [
            r"/auckland-events/(?:today|this-week|board\.php|search|page)",
            r"/auckland-events/.+-events",  # category listings like music-events
            r"\?$",
        ]
        links = filter_links(response.url, hrefs, allow, deny)

        for link in links:
            yield scrapy.Request(
                link,
                callback=self.parse_event,
                meta={"playwright": True, "errback": self.errback},
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
        # de-dup while preserving order
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
        # prune generic crumbs
        cats = [c for c in cats if c.lower() not in {"home", "events", "what's on", "what’s on"}]
        return cats[:8]  # keep it compact

    def _extract_location(self, sel, jsonld_objs):
        loc = {"name": None, "address": None, "city": "Auckland", "region": "Auckland", "country": "New Zealand",
               "latitude": None, "longitude": None}
        # Prefer JSON-LD if available
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

        # Fallbacks from visible page
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
        # JSON-LD single price if present
        p, ccy, _ = price_from_jsonld(jsonld_objs)
        if isinstance(p, (int, float)):
            return {"currency": (ccy or "NZD"), "min": float(p), "max": float(p), "text": None, "free": (float(p) == 0.0)}

        # Otherwise, scan visible price text
        price_text = " ".join(sel.css("[class*='price'], .price ::text").getall()) or \
                     " ".join(sel.xpath("//*[contains(translate(text(),'PRICE','price'),'price')]/text()").getall())
        if price_text:
            return parse_prices(price_text)

        # Or any "Tickets" block
        tix_text = " ".join(sel.xpath("//*[contains(translate(text(),'TICKETS','tickets'),'tickets')]/following::text()[position()<5]").getall())
        if tix_text:
            return parse_prices(tix_text)

        return {"currency": "NZD", "min": None, "max": None, "text": None, "free": False}

    def _opening_hours_text(self, sel):
        # A compact human string with times/dates that users expect under "opening_hours"
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
            s = " | ".join(bits)
            # squash excessive whitespace
            s = re.sub(r"\s+", " ", s).strip()
            return s[:400]  # keep tidy
        return None

    def _operating_months(self, sel):
        blob = " ".join(sel.xpath("//body//text()").getall())
        months = nz_months(blob)
        return months

    def parse_event(self, response):
        sel = response.selector
        jsonld_objs = parse_jsonld(response.text)

        # Name/title
        name = self._text(sel, "h1::text", "meta[property='og:title']::attr(content)")
        if not name:
            # Try JSON-LD
            try:
                for obj in (jsonld_objs or []):
                    n = obj.get("name")
                    if isinstance(n, str) and n.strip():
                        name = n.strip()
                        break
            except Exception:
                pass

        # Build fields
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
            "data_collected_at": datetime.now().astimezone().isoformat(),
        }
        # Only yield the requested keys (guard in case helpers return extras)
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
