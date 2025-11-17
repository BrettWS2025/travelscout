import json
import re
from urllib.parse import urljoin, urlparse

import scrapy
from w3lib.html import remove_tags

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
)

# Any /activities/<section> page is a hub; detail pages have >= 3 segments
HUB_TAILS = {
    "activities", "entertainment-activities", "getting-active",
    "free-things-do", "lessons", "attractions", "tourist-attractions",
    "party-time", "family-fun",
}

PRIMARY_CATS = {
    "entertainment-activities": "Entertainment Activities",
    "getting-active": "Getting Active",
    "lessons": "Lessons",
    "attractions": "Attractions",
    "tourist-attractions": "Attractions",
    "party-time": "Nightlife",
    "family-fun": "Family Fun",
}

class AucklandWhatsOnSpider(scrapy.Spider):
    name = "auckland_whats_on"
    allowed_domains = ["heartofthecity.co.nz", "www.heartofthecity.co.nz"]
    start_urls = ["https://heartofthecity.co.nz/activities"]

    custom_settings = {
        "USER_AGENT": BROWSER_UA,
        "ROBOTSTXT_OBEY": True,
        "DOWNLOAD_DELAY": 0.6,
        "CONCURRENT_REQUESTS": 4,
        "AUTOTHROTTLE_ENABLED": True,
        "FEEDS": {"data/Places.jsonl": {"format": "jsonlines", "encoding": "utf8", "overwrite": False}},
    }

    # ---------------- utilities ----------------

    @staticmethod
    def _clean(s: str) -> str:
        if not s:
            return ""
        s = remove_tags(s)
        s = re.sub(r"\s+", " ", s).strip()
        return s

    @staticmethod
    def _shorten(s: str, n: int = 300) -> str:
        s = (s or "").strip()
        return (s[: n - 1] + "…") if len(s) > n else s

    @staticmethod
    def _only_http(urls, limit=3):
        out, seen = [], set()
        for u in urls:
            if not u or not u.startswith("http"):
                continue
            if u in seen:
                continue
            seen.add(u)
            out.append(u)
            if len(out) >= limit:
                break
        return out

    def _article(self, response):
        node = response.css("article")
        return node if node else response

    def _primary_category(self, url: str) -> str:
        parts = [p for p in urlparse(url).path.split("/") if p]
        # /activities/<section>/<slug>
        if len(parts) >= 3 and parts[0] == "activities":
            return PRIMARY_CATS.get(parts[1], "Activities & Attractions")
        return "Activities & Attractions"

    def _from_ldjson(self, response):
        out = {}
        for raw in response.css('script[type="application/ld+json"]::text').getall():
            try:
                data = json.loads(raw)
            except Exception:
                continue
            blocks = data if isinstance(data, list) else [data]
            for b in blocks:
                if not isinstance(b, dict):
                    continue
                t = b.get("@type")
                if t in ("Place", "LocalBusiness", "Organization", ["Place"]):
                    out.setdefault("name", b.get("name"))
                    loc = b.get("address")
                    if isinstance(loc, dict):
                        parts = [
                            loc.get("streetAddress"),
                            loc.get("addressLocality"),
                            loc.get("postalCode"),
                        ]
                        out.setdefault("address", " ".join([p for p in parts if p]).strip() or None)
        return out

    def _extract_name(self, response, article, ld):
        title = self._clean(article.css("h1::text").get())
        if not title:
            title = self._clean(response.css('meta[property="og:title"]::attr(content)').get())
        if not title:
            title = (ld.get("name") or "").strip()
        return title

    def _extract_desc(self, response, article):
        desc = " ".join(article.css(".field--name-field-intro p::text, .node__content p::text").getall())
        if not desc:
            desc = response.css('meta[name="description"]::attr(content)').get()
        return self._shorten(self._clean(desc), 300) or None

    def _extract_address_phone(self, article, ld):
        text = " ".join(article.xpath(".//h1/following::*[self::p or self::div][position()<=8]//text()").getall())
        text = self._clean(text)
        # Address: look for a street-ish line
        addr = None
        m = re.search(r"\b(\d{1,4}\s+[A-Za-z0-9 .,'-]+?\b(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Quay|Drive|Dr|Square|Place|Pl|Terrace|Terr|Boulevard|Blvd))\b", text, re.I)
        if m:
            addr = m.group(1)
        if not addr:
            addr = ld.get("address")

        # Phone: NZ formats; keep leading 0
        phone = None
        pm = re.search(r"\b0\d{7,9}\b", text)
        if pm:
            phone = pm.group(0)

        return addr, phone

    def _extract_hours_text(self, article):
        # Grab the compact “Opening hours” block and squeeze it into one line.
        box = article.xpath(".//*[contains(translate(.,'OPENING','opening'),'opening') and contains(translate(.,'HOUR','hour'),'hour')]/ancestor::*[self::div or self::section][1]")
        if not box:
            return None
        lines = [self._clean(" ".join(x.xpath(".//text()").getall())) for x in box.css("li, p, div")]
        lines = [l for l in lines if l and re.search(r"\d", l)]
        if not lines:
            # fallback to any day headings nearby
            lines = [self._clean(t) for t in box.xpath(".//*[contains(.,':')]//text()").getall()]
        text = "; ".join(lines)
        # compact common words
        text = (text.replace("Monday", "Mon").replace("Tuesday", "Tue")
                    .replace("Wednesday", "Wed").replace("Thursday", "Thu")
                    .replace("Friday", "Fri").replace("Saturday", "Sat")
                    .replace("Sunday", "Sun"))
        return self._shorten(text, 140) or None

    def _extract_images(self, response, article):
        imgs = []
        og = response.css('meta[property="og:image"]::attr(content)').get()
        if og:
            imgs.append(og)
        imgs += [urljoin(response.url, s) for s in article.css("img::attr(src)").getall()]
        return self._only_http(imgs, limit=3)

    def _extract_website_email(self, article, response):
        for sel in [
            ".//a[translate(normalize-space(.),'WEBSITE','website')='website']/@href",
            ".//a[contains(translate(.,'BOOK','book'),'book')]/@href",
        ]:
            href = article.xpath(sel).get()
            if href:
                site = urljoin(response.url, href)
                break
        else:
            site = None
        email = article.xpath(".//a[starts-with(@href,'mailto:')]/@href").get()
        if email:
            email = email.replace("mailto:", "").strip()
        return site, email

    def _extract_price(self, article):
        block = " ".join(article.xpath(".//*[contains(text(),'$') or contains(translate(text(),'FREE','free'),'free')]//text()").getall())
        block = self._clean(block)
        amounts = [float(m.replace(",", "")) for m in re.findall(r"\$\s*([0-9]{1,4}(?:\.[0-9]{1,2})?)", block)]
        amounts = [a for a in amounts if 0 <= a < 2000]
        if amounts:
            t = self._shorten(block, 120)
            return {"currency": "NZD", "min": min(amounts), "max": max(amounts), "text": t, "free": min(amounts) == 0.0}
        if " free " in f" {block.lower()} ":
            return {"currency": "NZD", "min": 0.0, "max": 0.0, "text": "Free", "free": True}
        return {"currency": "NZD", "min": None, "max": None, "text": None, "free": False}

    # ---------------- crawling ----------------

    def parse(self, response):
        # detail pages: /activities/<section>/<slug>
        for href in response.css('a[href^="/activities/"]::attr(href)').getall():
            url = urljoin(response.url, href.split("#")[0])
            parts = [p for p in urlparse(url).path.split("/") if p]
            if parts and parts[0] == "activities":
                if len(parts) >= 3 and parts[1] not in HUB_TAILS:
                    yield response.follow(url, callback=self.parse_place, headers={"Referer": response.url})
                else:
                    yield response.follow(url, callback=self.parse, headers={"Referer": response.url})

        # pagination
        for href in response.css('a[href*="?page="]::attr(href)').getall():
            yield response.follow(urljoin(response.url, href), callback=self.parse, headers={"Referer": response.url})

    def parse_place(self, response):
        article = self._article(response)
        ld = self._from_ldjson(response)

        # Guard: looks like a real detail page (has Website OR an address)
        website, email = self._extract_website_email(article, response)
        address, phone = self._extract_address_phone(article, ld)
        if not (website or address):
            return

        name = self._extract_name(response, article, ld)
        if not name:
            return

        desc = self._extract_desc(response, article)
        category = self._primary_category(response.url)
        images = self._extract_images(response, article)
        hours_text = self._extract_hours_text(article)
        price = self._extract_price(article)

        record = {
            "id": f"{abs(hash(response.url)) & 0xFFFFFFFFFFFF:016x}",
            "record_type": "place",
            "name": name,
            "description": desc,
            "categories": [category],
            "tags": [],
            "url": response.url,
            "source": "heartofthecity.co.nz",
            "images": images,
            "location": {
                "name": name if address else None,
                "address": address,
                "city": "Auckland",
                "region": "Auckland",
                "country": "New Zealand",
                "latitude": None,
                "longitude": None,
            },
            "price": price,
            "booking": {"url": website, "email": email, "phone": phone},
            "event_dates": None,
            "opening_hours": {"text": hours_text} if hours_text else None,
            "operating_months": None,
            "data_collected_at": response.headers.get("Date", b"").decode() or None,
            # keep this compact or drop entirely; here we keep a short composite
            "text_for_embedding": " | ".join([x for x in [name, desc or "", address or "", hours_text or ""] if x])[:240],
        }
        yield record
