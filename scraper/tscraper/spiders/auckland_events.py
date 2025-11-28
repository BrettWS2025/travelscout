import asyncio
from datetime import datetime, timezone
from urllib.parse import urljoin

import scrapy

from items import make_id  # stable 16-char hex id from URL
from utils import clean, parse_prices, nz_months  # lightweight helpers


LISTING_URL = "https://www.aucklandnz.com/events-hub/events"

# Category keywords we accept if we find them on the page
KNOWN_CATEGORIES = {
    "Music", "Live concert", "Festival", "Theatre", "Comedy", "Exhibition",
    "Family", "Art", "Cultural", "Dance", "Film", "Sports", "Market",
    "Markets", "Workshops", "Food & Drink", "Talks", "Community"
}


class AucklandEventsSpider(scrapy.Spider):
    name = "auckland_events"
    allowed_domains = ["aucklandnz.com", "www.aucklandnz.com"]

    custom_settings = {
        # Keep your global settings intact; these are just safe per-spider nudges.
        "COOKIES_ENABLED": False,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.25,
        "CONCURRENT_REQUESTS": 8,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.25,
        "AUTOTHROTTLE_MAX_DELAY": 4.0,
        "DEFAULT_REQUEST_HEADERS": {
            "Accept-Language": "en-NZ,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        # We rely on your project-level scrapy-playwright configuration (settings.py).
        # This spider only uses Playwright for the listing page; detail pages are plain HTTP.
    }

    # ----------------- entry -----------------

    def start_requests(self):
        # Use Playwright for listing to load/scroll/click "See more"
        yield scrapy.Request(
            LISTING_URL,
            meta={"playwright": True, "playwright_include_page": True},
            callback=self.parse_listing
        )

    # ----------------- listing (Playwright) -----------------

    async def parse_listing(self, response):
        """
        Use Playwright to reveal all event tiles, then collect detail URLs.
        """
        page = response.meta.get("playwright_page")

        try:
            # Wait for any card-ish element to appear
            # (the site uses cards; we also guard with a generic anchor filter)
            await page.wait_for_timeout(800)  # first paint
            # Try to scroll & click "See more" until nothing new loads
            seen_heights = set()
            for _ in range(40):  # hard cap to avoid infinite loops
                # 1) Click possible "See more" buttons/links
                more = page.locator(
                    "button:has-text('See more'), a:has-text('See more'), "
                    "button:has-text('See More'), a:has-text('See More')"
                )
                try:
                    if await more.count() > 0 and await more.first.is_enabled():
                        await more.first.click()
                        await page.wait_for_timeout(1200)
                except Exception:
                    pass

                # 2) Infinite scroll fallback
                h = await page.evaluate("document.body.scrollHeight")
                if h in seen_heights:
                    break
                seen_heights.add(h)
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1200)

            # Collect all detail links
            hrefs = await page.eval_on_selector_all(
                "a[href^='/events-hub/events/']",
                "els => els.map(e => e.href)"
            )
        finally:
            # Always close the Playwright page
            if page:
                await page.close()

        # Deduplicate & follow
        seen = set()
        for href in hrefs or []:
            if not href:
                continue
            if href in seen:
                continue
            seen.add(href)
            yield scrapy.Request(
                href,
                callback=self.parse_event,
                headers={"Referer": LISTING_URL},
                dont_filter=True,
            )

    # ----------------- detail -----------------

    def parse_event(self, response):
        # Title
        title = clean(response.css("h1::text").get()) or clean(
            response.css('meta[property="og:title"]::attr(content)').get()
        )
        if not title:
            self.logger.debug("No title on %s", response.url)
            return

        # ---- venue / location name (bilingual section headers appear on this site) ----
        # Look for a heading that includes 'Location' (English) or 'Te wāhi' (Māori),
        # then take the first bullet/paragraph afterwards.
        venue = clean(
            " ".join(
                response.xpath(
                    "(//*[self::h5 or self::h6][contains(translate(., 'LOCATION', 'location'),'location')]"
                    "|//*[self::h5 or self::h6][contains(., 'Te wāhi')])"
                    "/following::*[self::li or self::p][1]//text()"
                ).getall()
            )
        ) or None

        # ---- price ----
        # Favor the top-of-page area near the title to avoid “nearby restaurants/hotels” noise.
        top_blob = " ".join(
            t.strip()
            for t in response.xpath(
                "(//h1)[1]/following::*[not(self::footer) and not(self::script) and not(self::style)][position()<=60]//text()"
            ).getall()
            if t and t.strip()
        )
        # If top area had no $, expand search a bit more:
        price_blob = top_blob if "$" in (top_blob or "") else " ".join(
            t.strip() for t in response.xpath("//text()[contains(., '$')]").getall()
        )
        price = parse_prices(price_blob)

        # ---- categories (best-effort tags; we filter to known event-y labels) ----
        # Grab small chips/links that often carry taxonomy labels.
        raw_cats = [
            clean(x) for x in response.css("a::text, .tag::text, .chip::text, .badge::text").getall()
        ]
        categories = []
        for c in raw_cats:
            if not c:
                continue
            # Keep exact matches from known catalog; normalize spacing/case
            norm = c.strip()
            if norm in KNOWN_CATEGORIES and norm not in categories:
                categories.append(norm)

        # ---- date text -> operating months (compact) ----
        # Use visible “Dates and Times” area if present; otherwise scan top chunk.
        dates_text = clean(
            " ".join(
                response.xpath(
                    "(//*[contains(translate(., 'DATES AND TIMES', 'dates and times'),'dates and times')])[1]"
                    "/following::*[self::li or self::p][1]//text()"
                ).getall()
            )
        ) or top_blob
        operating_months = nz_months(dates_text)

        # ---- build final record (allowed keys only) ----
        record = {
            "id": make_id(response.url),
            "record_type": "event",
            "name": title,
            "categories": categories or [],
            "url": response.url,
            "source": "aucklandnz.com",
            "location": {
                "name": venue,
                "address": None,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": {
                "currency": price.get("currency"),
                "min": price.get("min"),
                "max": price.get("max"),
                "text": price.get("text"),
                "free": bool(price.get("free")),
            },
            "opening_hours": None,           # events use dates/times; we keep this null
            "operating_months": operating_months,
            "data_collected_at": datetime.now(timezone.utc).isoformat(),
        }
        yield record
