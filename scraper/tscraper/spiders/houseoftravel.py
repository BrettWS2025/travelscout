
import scrapy
from tscraper.utils import parse_jsonld, price_from_jsonld, title_from_jsonld, pick_detail_links, parse_price_text, parse_nights, parse_sale_end, build_item

BASE = "https://www.houseoftravel.co.nz"

class HouseOfTravelSpider(scrapy.Spider):
    name = "houseoftravel"
    allowed_domains = ["houseoftravel.co.nz"]
    start_urls = [f"{BASE}/holidays"]

    def parse(self, response):
        allow = [r"/hot-deals/[^/]+", r"/holidays/[^/]+/[^/]+", r"/deals?/[^/]+"]
        for href in pick_detail_links(response, allow):
            yield response.follow(href, callback=self.parse_detail)
        next_page = response.css("a[rel='next']::attr(href)").get()
        if next_page:
            yield response.follow(next_page, callback=self.parse)

    def parse_detail(self, response):
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
