
import scrapy
from tscraper.utils import (
    parse_jsonld, price_from_jsonld, title_from_jsonld,
    parse_price_text, parse_nights, parse_sale_end, build_item,
    filter_links, page_has_price_signal
)

BASE = "https://www.houseoftravel.co.nz"
ALLOW = ['^/hot-deals/[a-z0-9-]+/?$', '^/holidays/(?!destinations/)[a-z0-9-]+/[a-z0-9-]+/?$', '^/deals?/[a-z0-9-]+/?$']
DENY  = ['/deals/search', '/holidays/?$', '/destinations/', '\\\\?.*\\\\bq=']

class HouseoftravelSpider(scrapy.Spider):
    name = "houseoftravel"
    allowed_domains = ["houseoftravel.co.nz"]
    start_urls = [f"{BASE}/holidays"] if "houseoftravel"!="worldtravellers" else [f"{BASE}/deals"]

    custom_settings = {"DOWNLOAD_DELAY": 2.0}

    def parse(self, response):
        hrefs = response.xpath("//a/@href").getall()
        for url in filter_links(response.url, hrefs, ALLOW, DENY):
            yield scrapy.Request(url, callback=self.parse_detail, dont_filter=True)

        for nxt in response.css("a[rel='next']::attr(href), a.pagination__link::attr(href), a.next::attr(href)").getall():
            yield response.follow(nxt, callback=self.parse)

    def parse_detail(self, response):
        if not page_has_price_signal(response.text):
            return

        url = response.url
        text = " ".join(response.xpath("//body//text()").getall())
        objs = parse_jsonld(response.text)
        title = title_from_jsonld(objs) or (response.css("h1::text").get() or "").strip() or (response.css("title::text").get() or "").strip()

        price, currency, price_valid_until = price_from_jsonld(objs)
        if not price:
            for node in response.css("[class*='price'], [class*='Price'], .deal-price, .price"):
                price = parse_price_text(" ".join(node.css("::text").getall()))
                if price:
                    break

        nights = parse_nights(text)
        sale_end = price_valid_until or parse_sale_end(text)

        yield build_item("houseoftravel", url, title, price, currency, nights, sale_end, text)
