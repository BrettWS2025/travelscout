
import scrapy
from tscraper.utils import (parse_jsonld, price_from_jsonld, title_from_jsonld,
    parse_price_text, parse_nights, parse_sale_end, build_item,
    filter_links, page_has_price_signal)

BASE = "https://www.worldtravellers.co.nz"
ALLOW = [r"^/deals/(?!$)[a-z0-9-]+(?:/[a-z0-9-]+)*/?$"]
DENY = [r"^/deals/?$", r"^/destinations/?$", r"^/destinations/"]

class WorldtravellersSpider(scrapy.Spider):
    name = "worldtravellers"
    allowed_domains = ["worldtravellers.co.nz"]
    start_urls = [f"{BASE}/deals"]
    custom_settings = {"DOWNLOAD_DELAY": 1.0}

    def parse(self, response):
        hrefs = response.xpath("//a/@href").getall()
        for url in filter_links(response.url, hrefs, ALLOW, DENY):
            yield scrapy.Request(url, callback=self.parse_detail, dont_filter=True)
        for nxt in response.css("a[rel='next']::attr(href), a.pagination__link::attr(href)").getall():
            yield response.follow(nxt, callback=self.parse)

    def parse_detail(self, response):
        sel = response.css
        price_text = " ".join(sel("span.deal-details__value::text").getall()) or ""
        price = parse_price_text(price_text)
        if not price and not page_has_price_signal(response.text):
            body = " ".join(response.xpath("//body//text()").getall())
            price = parse_price_text(body)
            if not (price and price >= 99):
                return
        objs = parse_jsonld(response.text)
        title = title_from_jsonld(objs) or (response.css("h1::text").get() or "").strip() or (response.css("title::text").get() or "").strip()
        currency = "NZD"
        body = " ".join(response.xpath("//body//text()").getall())
        nights = parse_nights(body)
        sale_end = parse_sale_end(body)
        yield build_item("worldtravellers", response.url, title, price, currency, nights, sale_end, body)
