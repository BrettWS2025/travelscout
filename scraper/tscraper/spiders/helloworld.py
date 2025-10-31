import scrapy, hashlib, re
from tscraper.items import PackageItem

BASE = "https://www.helloworld.co.nz"

class HelloWorldSpider(scrapy.Spider):
    name = "helloworld"
    allowed_domains = ["helloworld.co.nz"]
    start_urls = [f"{BASE}/holidays"]

    def parse(self, response):
        for href in response.xpath("//a[contains(@href, '/deal/') or contains(@href,'/deals/') or contains(@href,'/holidays/')]/@href").getall():
            yield response.follow(href, callback=self.parse_detail)

        next_page = response.css("a[rel='next']::attr(href)").get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    def parse_detail(self, response):
        title = (response.css("h1::text").get() or "").strip()
        text = " ".join(t.strip() for t in response.css("body ::text").getall())
        price = self._num(text)
        nights = self._int(r"(\d+)\s*nights?", text)
        days = self._int(r"(\d+)\s*days?", text)
        duration_days = days or (nights + 1 if nights else 0)

        item = PackageItem(
            package_id=self._pid(response.url, title, price),
            source="helloworld",
            url=response.url,
            title=title,
            duration_days=duration_days,
            nights=nights,
            price=price,
            currency="NZD",
            price_basis="per_person",
            includes={"flights": "flight" in text.lower(), "hotel": "night" in text.lower()},
            hotel={"name": None, "stars": None, "room_type": None},
            sale_ends_at=self._sale(text),
        )
        yield item.model_dump()

    def _pid(self, url, title, price):
        return hashlib.md5(f"{url}|{title}|{price}".encode()).hexdigest()

    def _num(self, s):
        m = re.search(r"(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)", s.replace(",", ""))
        return float(m.group(1)) if m else 0.0

    def _int(self, pat, s):
        m = re.search(pat, s, re.I)
        return int(m.group(1)) if m else None

    def _sale(self, text):
        m = re.search(r"(sale\s*ends\s*[A-Za-z0-9 ,]+)", text, re.I)
        return m.group(1) if m else None
