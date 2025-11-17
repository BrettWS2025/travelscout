import re
from urllib.parse import urljoin, urlparse

import scrapy
from w3lib.html import remove_tags


# “Things to do” lives under a few section roots:
#   /activities/...              /attractions/...
#   /auckland-nightlife/...      (plus some “party-time” etc. subpaths)
THINGS_START_URLS = [
    "https://heartofthecity.co.nz/activities/entertainment-activities",
    "https://heartofthecity.co.nz/activities/getting-active",
    "https://heartofthecity.co.nz/activities",
    "https://heartofthecity.co.nz/attractions",
    "https://heartofthecity.co.nz/auckland-nightlife",
]

DETAIL_ALLOW_PREFIXES = (
    "/activities/",
    "/attractions/",
    "/auckland-nightlife/",
)

# some category or hub pages to avoid treating as detail
HUB_DENY_LAST_SEGMENTS = {
    "activities", "entertainment-activities", "getting-active",
    "attractions", "auckland-nightlife", "party-time",
    "free-things-do", "best-fun-things-to-do-city-centre",
}

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/127.0.0.0 Safari/537.36"
)


class AucklandWhatsOnSpider(scrapy.Spider):
    """
    Crawl Heart of the City “things to do” detail pages, e.g.
      https://heartofthecity.co.nz/auckland-nightlife/party-time/holey-moley-golf-club
      https://heartofthecity.co.nz/activities/entertainment-activities/makerspace
      https://heartofthecity.co.nz/attractions/tourist-attractions/skywalk
    and write JSONL to data/Things_to_do.jsonl
    """
    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]
    start_urls = THINGS_START_URLS

    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": True,
        "TELNETCONSOLE_ENABLED": False,
        "DOWNLOAD_DELAY": 0.8,
        "CONCURRENT_REQUESTS": 4,
        "AUTOTHROTTLE_ENABLED": True,
        "AUTOTHROTTLE_START_DELAY": 0.5,
        "AUTOTHROTTLE_MAX_DELAY": 6.0,
        "DNS_TIMEOUT": 20,
        "CLOSESPIDER_PAGECOUNT": 3000,
        "FEEDS": {
            "data/Things_to_do.jsonl": {
                "format": "jsonlines",
                "encoding": "utf8",
                "overwrite": False,
            }
        },
    }

    def parse(self, response):
        # 1) detail pages to follow
        for href in response.css('a[href^="/"]::attr(href)').getall():
            url = urljoin(response.url, href.split("#")[0])
            p = urlparse(url)
            parts = [x for x in p.path.split("/") if x]
            if not parts:
                continue
            if any(p.path.startswith(prefix) for prefix in DETAIL_ALLOW_PREFIXES):
                # treat as a detail page if it has at least 3 segments and the last segment isn’t a known hub
                # e.g., /attractions/tourist-attractions/skywalk
                if len(parts) >= 3 and parts[-1] not in HUB_DENY_LAST_SEGMENTS:
                    yield response.follow(url, callback=self.parse_place, headers={"Referer": response.url})
                else:
                    # otherwise, keep exploring within these sections
                    yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

        # 2) simple pagination (occasionally ?page=n)
        for href in response.css('a[href*="?page="]::attr(href)').getall():
            yield response.follow(urljoin(response.url, href), callback=self.parse, headers={"Referer": response.url})

    # -----------------------
    # helpers
    # -----------------------
    @staticmethod
    def _clean_text_list(texts):
        import html
        return [re.sub(r"\s+", " ", html.unescape(t)).strip() for t in texts if t and re.sub(r"\s+", " ", t).strip()]

    @staticmethod
    def _extract_price(text):
        if not text:
            return None, None, ""
        price_text = " ".join(AucklandWhatsOnSpider._clean_text_list([text]))
        amounts = [float(x.replace(",", "")) for x in re.findall(r"\$?\s*([0-9]+(?:\.[0-9]{1,2})?)", price_text)]
        if amounts:
            return min(amounts), max(amounts), price_text
        return None, None, price_text

    def parse_place(self, response):
        # guard
        if not response.css("h1"):
            return

        title = (response.css("h1::text").get() or "").strip()

        # location name appears very near the top (often a link, then address line)
        location_name = (response.xpath("//h1/following::a[1]/text()").get() or "").strip()
        if location_name and len(location_name) > 120:
            location_name = None

        # address line commonly appears after the venue link or before “Opening hours/Website/Show on map”
        address_line = " ".join(self._clean_text_list(
            response.xpath("//h1/following::*[self::p or self::div][position()<=6]//text()").getall()
        ))
        # trim the address if we accidentally captured a whole paragraph
        if address_line and len(address_line) > 260:
            address_line = None

        # description
        description = " ".join(self._clean_text_list(
            response.css(".field--name-field-intro p::text, .field--name-body p::text, .node__content p::text").getall()[:8]
        ))

        # price and free flag
        price_scope = " ".join(self._clean_text_list(
            response.xpath("//*[contains(., '$') or contains(translate(., 'FREE', 'free'), 'free')]//text()").getall()
        )) or " ".join(self._clean_text_list(response.css(".node__content *::text").getall()))
        pmin, pmax, ptxt = self._extract_price(price_scope)
        is_free = (" free " in f" {price_scope.lower()} ")

        # contact/booking: look for Website / book / email
        website = None
        email = None
        phone = None

        for a in response.xpath("//a[contains(translate(., 'WEBSITE', 'website'), 'website')]/@href").getall():
            website = urljoin(response.url, a)
            break
        if not website:
            # next best: “Book” or external refs
            for a in response.xpath("//a[contains(translate(., 'BOOK', 'book'), 'book')]/@href").getall():
                website = urljoin(response.url, a)
                break

        # email and phone (rare on site)
        mail = response.xpath("//a[starts-with(@href, 'mailto:')]/@href").get()
        if mail:
            email = re.sub(r"^mailto:", "", mail).strip()
        tel = response.xpath("//a[starts-with(@href, 'tel:')]/@href").get()
        if tel:
            phone = re.sub(r"^tel:", "", tel).strip()

        # images
        images = []
        og = response.css('meta[property="og:image"]::attr(content)').get()
        if og:
            images.append(og)
        images.extend([urljoin(response.url, s) for s in response.css("article img::attr(src), .content img::attr(src)").getall()])
        seen = set()
        images = [x for x in images if not (x in seen or seen.add(x))]

        # categories (breadcrumb chips / tags)
        categories = self._clean_text_list(
            response.css("a[href*='/activities/']::text, a[href*='/attractions/']::text, a[href*='/auckland-nightlife/']::text, .tags a::text").getall()
        )
        if not categories:
            categories = ["Activities & Attractions"]

        record = {
            "id": f"{abs(hash(response.url)) & 0xFFFFFFFFFFFF:016x}",
            "record_type": "place",
            "name": title,
            "description": description or None,
            "categories": categories,
            "tags": [],
            "url": response.url,
            "source": "heartofthecity.co.nz",
            "images": images[:10],
            "location": {
                "name": location_name or None,
                "address": address_line or None,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": {
                "currency": "NZD",
                "min": pmin if pmin is not None else (0.0 if is_free else None),
                "max": pmax if pmax is not None else (0.0 if is_free else None),
                "text": ptxt or None,
                "free": is_free,
            },
            "booking": {
                "url": website,
                "email": email,
                "phone": phone,
            },
            "event_dates": None,
            "opening_hours": None,
            "operating_months": None,
            "data_collected_at": self._now_iso(response),
            "text_for_embedding": self._embed_text(title, description, location_name, address_line, ptxt),
        }
        yield record

    @staticmethod
    def _now_iso(response):
        import datetime, pytz
        return datetime.datetime.now(pytz.UTC).isoformat()

    @staticmethod
    def _embed_text(title, description, venue, addr, price_text):
        bits = [title or "", description or "", venue or "", addr or "", price_text or ""]
        return " | ".join([remove_tags(b).strip() for b in bits if b])
