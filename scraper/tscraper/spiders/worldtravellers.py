import scrapy, hashlib, re
from tscraper.items import PackageItem

BASE = "https://www.worldtravellers.co.nz"

class WorldTravellersSpider(scrapy.Spider):
    name = "worldtravellers"
    allowed_domains = ["worldtravellers.co.nz"]
    start_urls = [f"{BASE}/deals"]

    def parse(self, response):
        # Follow any deal links we can find
        for href in response.xpath("//a[contains(@href, '/deals') or contains(@href,'/deal')]/@href").getall():
            yield response.follow(href, callback=self.parse_detail)

        # pagination
        next_page = response.css('a[rel="next"]::attr(href)').get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    def parse_detail(self, response):
        title = (response.css("h1::text").get() or "").strip()
        # Flatten text; we'll regex for price/duration
        text = " ".join(t.strip() for t in response.css("body ::text").getall())

        price = self._extract_number(text)
        nights = self._extract_int(r"(\d+)\s*nights?", text)
        days   = self._extract_int(r"(\d+)\s*days?", text)
        duration_days = days or (nights + 1 if nights else 0)

        item = PackageItem(
            package_id=self._pid(response.url, title, price),
            source="worldtravellers",
            url=response.url,
            title=title,
            destinations=[],
            duration_days=duration_days,
            nights=nights,
            price=price,
            currency="NZD",
            price_basis="per_person",
            includes={
                "flights": "flight" in text.lower(),
                "hotel": "night" in text.lower(),
                "board": "breakfast" if "breakfast" in text.lower() else None,
                "transfers": "transfer" in text.lower()
            },
            hotel={"name": self._maybe_hotel(response), "stars": None, "room_type": None},
            sale_ends_at=self._sale(text),
        )
        yield item.model_dump()

    def _pid(self, url, title, price):
        return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()

    def _extract_number(self, s):
        s = s or ""
        m = re.search(r"(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)", s.replace(",", ""))
        return float(m.group(1)) if m else 0.0

    def _extract_int(self, pattern, s):
        m = re.search(pattern, s, re.I)
        return int(m.group(1)) if m else None

    def _maybe_hotel(self, response):
        for c in response.css("h2::text, h3::text").getall():
            if "hotel" in c.lower() or "resort" in c.lower():
                return c.strip()
        return None

    def _sale(self, text):
        m = re.search(r"(sale\s*ends\s*[A-Za-z0-9 ,]+)", text, re.I)
        return m.group(1) if m else None
