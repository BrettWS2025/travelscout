# tscraper/spiders/auckland_events.py

import json
import re
import hashlib
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import scrapy
from scrapy.http import Response
from scrapy_playwright.page import PageMethod


# ---------- in-spider helpers (no external imports required) ----------

def _make_id(url: str) -> str:
    return hashlib.sha1((url or "").encode("utf-8")).hexdigest()[:16]

def _clean(s: str | None) -> str | None:
    if not s:
        return None
    return re.sub(r"\s+", " ", s).strip()

def _parse_jsonld(html: str) -> list[dict]:
    """Return a list of JSON-LD dicts (robust to lists/graphs)."""
    out: list[dict] = []
    for raw in re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html or "",
        flags=re.I | re.S,
    ):
        try:
            data = json.loads(raw.strip())
            if isinstance(data, list):
                out.extend([x for x in data if isinstance(x, dict)])
            elif isinstance(data, dict):
                # Some pages use {"@graph":[...]}
                if "@graph" in data and isinstance(data["@graph"], list):
                    out.extend([x for x in data["@graph"] if isinstance(x, dict)])
                else:
                    out.append(data)
        except Exception:
            continue
    return out

def _first_event_obj(jsonld: list[dict]) -> dict | None:
    for obj in jsonld or []:
        t = obj.get("@type")
        if t == "Event":
            return obj
        if isinstance(t, list) and any(x == "Event" for x in t):
            return obj
    return None

def _extract_categories(resp: Response) -> list[str]:
    cats: list[str] = []
    cats += [_clean(t) for t in resp.css("nav.breadcrumb a::text").getall()]
    cats += [_clean(t) for t in resp.css("[class*='category'] a::text,[class*='tags'] a::text").getall()]
    cats = [c for c in cats if c]
    bad = {"home", "events", "what's on", "what’s on", "auckland"}
    dedup: list[str] = []
    seen = set()
    for c in cats:
        if c.lower() in bad:
            continue
        if c not in seen:
            dedup.append(c)
            seen.add(c)
    return dedup[:8]

def _extract_location(resp: Response, jsonld: list[dict]) -> dict:
    loc = {
        "name": None,
        "address": None,
        "city": "Auckland",
        "region": "Auckland",
        "country": "New Zealand",
        "latitude": None,
        "longitude": None,
    }
    ev = _first_event_obj(jsonld)
    if isinstance(ev, dict):
        v = ev.get("location")
        if isinstance(v, dict):
            name = _clean(v.get("name"))
            if name:
                loc["name"] = name
            addr = v.get("address")
            if isinstance(addr, dict):
                parts = [addr.get("streetAddress"), addr.get("addressLocality"), addr.get("postalCode")]
                loc["address"] = _clean(", ".join([p for p in parts if p]))
                loc["city"] = _clean(addr.get("addressLocality")) or loc["city"]
                loc["region"] = _clean(addr.get("addressRegion")) or loc["region"]
                loc["country"] = _clean(addr.get("addressCountry")) or loc["country"]
            geo = v.get("geo")
            if isinstance(geo, dict):
                loc["latitude"] = geo.get("latitude")
                loc["longitude"] = geo.get("longitude")

    if not loc["name"]:
        loc["name"] = _clean(resp.css("[class*='venue'] ::text,.event-venue::text").get())
    if not loc["address"]:
        loc["address"] = _clean(resp.css("[class*='address'] ::text").get())

    return loc

def _parse_prices(text: str | None) -> dict:
    if not text:
        return {"currency": "NZD", "min": None, "max": None, "text": None, "free": False}
    t = (text or "").replace(",", " ")
    free = bool(re.search(r"\bfree\b", t, re.I))
    nums = [float(m) for m in re.findall(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)", t)]
    return {
        "currency": "NZD",
        "min": (0.0 if free and not nums else (min(nums) if nums else None)),
        "max": (max(nums) if nums else (0.0 if free else None)),
        "text": _clean(text),
        "free": free or (nums and min(nums) == 0.0),
    }

def _extract_price(resp: Response, jsonld: list[dict]) -> dict:
    ev = _first_event_obj(jsonld)
    if isinstance(ev, dict):
        offers = ev.get("offers")
        offers_list = offers if isinstance(offers, list) else ([offers] if isinstance(offers, dict) else [])
        for off in offers_list:
            try:
                price = off.get("price") or off.get("lowPrice")
                if price is None:
                    continue
                val = float(str(price))
                ccy = off.get("priceCurrency") or "NZD"
                return {"currency": ccy, "min": val, "max": val, "text": None, "free": (val == 0.0)}
            except Exception:
                continue

    price_text = " ".join(resp.css("[class*='price'], .price, .ticket-price ::text").getall())
    if price_text:
        return _parse_prices(price_text)

    tix_context = " ".join(
        resp.xpath("//*[contains(translate(text(),'TICKETS','tickets'),'tickets')]/following::text()[position()<6]").getall()
    )
    if tix_context:
        return _parse_prices(tix_context)

    return {"currency": "NZD", "min": None, "max": None, "text": None, "free": False}

def _opening_hours_text(resp: Response) -> str | None:
    bits = []
    bits += [_clean(x) for x in resp.css("time::attr(datetime), time::text").getall()]
    bits += [_clean(x) for x in resp.css("[class*='time'] ::text,.event-time::text").getall()]
    bits += [_clean(x) for x in resp.xpath("//dl/dt[contains(.,'Time')]/following-sibling::dd[1]//text()").getall()]
    bits = [b for b in bits if b]
    return _clean(" | ".join(bits)) if bits else None

def _operating_months(resp: Response) -> list[str] | None:
    body = " ".join(resp.xpath("//body//text()").getall())
    months = [
        "January","February","March","April","May","June","July","August","September","October","November","December",
        "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
    ]
    found: list[str] = []
    for m in months:
        if re.search(rf"\b{re.escape(m)}\b", body, re.I):
            key = m[:3].title()
            if key not in found:
                found.append(key)
    return found or None


# ---------- spider ----------

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)

START_URL = "https://www.aucklandnz.com/events-hub"


class AucklandEventsSpider(scrapy.Spider):
    """
    AucklandNZ — Events (events-hub only).
    Emits ONLY the keys required by the Events.jsonl schema.
    """

    name = "auckland_events"
    allowed_domains = ["aucklandnz.com", "www.aucklandnz.com"]
    start_urls = [START_URL]

    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": True,          # keep polite
        "COOKIES_ENABLED": False,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.4,
        "CONCURRENT_REQUESTS": 8,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.25,
        "AUTOTHROTTLE_MAX_DELAY": 4.0,
        # We rely on project settings to enable scrapy-playwright download handler.
        # (scraper/settings.py config is used at runtime)
    }

    # ---- entry: use Playwright to expand the listing ----
    def start_requests(self):
        yield scrapy.Request(
            START_URL,
            callback=self.parse_listing,
            meta={
                "playwright": True,
                "playwright_page_methods": [
                    PageMethod("wait_for_load_state", "domcontentloaded"),
                    PageMethod(
                        "evaluate",
                        """
                        async () => {
                          const labels = ["See more","Load more","Show more","More events","See More","Load More","Show More"];
                          function findBtn() {
                            const nodes = Array.from(document.querySelectorAll('a,button'));
                            return nodes.find(n => {
                              const t = (n.textContent || "").trim().toLowerCase();
                              return labels.some(lbl => t.includes(lbl.toLowerCase()));
                            });
                          }
                          for (let i=0; i<40; i++) {
                            const b = findBtn();
                            if (!b) break;
                            b.click();
                            await new Promise(r => setTimeout(r, 900));
                          }
                        }
                        """,
                    ),
                    PageMethod("wait_for_load_state", "networkidle"),
                ],
                "handle_httpstatus_list": [403, 429, 503],
            },
            headers={"Referer": "https://www.aucklandnz.com/"},
            dont_filter=True,
        )

    # ---- listing ----
    def parse_listing(self, response: Response):
        if response.status in (403, 429, 503):
            self.logger.warning("Blocked (%s) at listing: %s", response.status, response.url)
            try:
                with open("akl_listing_blocked.html", "w", encoding="utf-8") as f:
                    f.write(response.text)
            except Exception:
                pass
            return

        base = response.url
        hrefs = response.css('a[href*="/events/"]::attr(href)').getall()

        links = []
        deny_snippets = ("/events-hub", "/events/search", "/events#", "/events?",)
        for h in hrefs:
            h = (h or "").split("#")[0].strip()
            if not h:
                continue
            full = urljoin(base, h)
            u = urlparse(full)
            path = u.path or ""
            if any(s in path for s in deny_snippets):
                continue
            # Keep /events/<slug> or /events/<cat>/<slug>
            if re.match(r"^/events/[^/]+(?:/[^/]+)?$", path):
                link = f"{u.scheme}://{u.netloc}{path}"
                if link not in links:
                    links.append(link)

        if not links:
            self.logger.info("No event links found; writing listing HTML for debug.")
            try:
                with open("akl_listing_empty.html", "w", encoding="utf-8") as f:
                    f.write(response.text)
            except Exception:
                pass

        for url in links:
            yield scrapy.Request(
                url,
                callback=self.parse_event,
                meta={"playwright": False, "handle_httpstatus_list": [403, 429, 503]},
                headers={"Referer": base},
            )

    # ---- detail ----
    def parse_event(self, response: Response):
        if response.status in (403, 429, 503):
            self.logger.warning("Blocked (%s) at detail: %s", response.status, response.url)
            return

        jsonld = _parse_jsonld(response.text)
        ev = _first_event_obj(jsonld) or {}

        # Title
        name = (
            _clean(response.css("h1::text").get())
            or _clean(response.css('meta[property="og:title"]::attr(content)').get())
            or _clean(ev.get("name"))
        )
        if not name:
            self.logger.debug("No title on %s", response.url)
            return

        record = {
            "id": _make_id(response.url),
            "record_type": "event",
            "name": name,
            "categories": _extract_categories(response),
            "url": response.url,
            "source": "aucklandnz.com",
            "location": _extract_location(response, jsonld),
            "price": _extract_price(response, jsonld),
            "opening_hours": _opening_hours_text(response),
            "operating_months": _operating_months(response),
            "data_collected_at": datetime.now(timezone.utc).isoformat(),
        }

        # Emit ONLY the requested keys (schema-safe)
        yield {
            k: record.get(k)
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
