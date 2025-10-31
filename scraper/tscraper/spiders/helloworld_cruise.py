
import scrapy
from tscraper.utils import (parse_jsonld, price_from_jsonld, title_from_jsonld, parse_price_text,
    parse_nights, parse_sale_end, build_item, filter_links, page_has_price_signal, extract_price_from_scripts)

BASE = "https://helloworld.gocruising.co.nz"
ALLOW = [r"^/cruise/[a-z0-9-]+-DIS\d+/?$"]
DENY = [r"^/$"]

class HelloworldCruiseSpider(scrapy.Spider):
    name = "helloworld_cruise"
    allowed_domains = ["helloworld.gocruising.co.nz"]
    start_urls = [f"{BASE}/"]
    custom_settings = {"DOWNLOAD_DELAY": 1.0}

    def parse(self, response):
        hrefs = response.xpath("//a/@href").getall()
        for url in filter_links(response.url, hrefs, ALLOW, DENY):
            yield scrapy.Request(url, callback=self.parse_detail, dont_filter=True)
        for nxt in response.css("a[rel='next']::attr(href), a.pagination__link::attr(href)").getall():
            yield response.follow(nxt, callback=self.parse)

    def parse_detail(self, response):
        txt = " ".join(response.xpath("//body//text()").getall())
        objs = parse_jsonld(response.text)
        title = title_from_jsonld(objs) or (response.css("h1::text").get() or "").strip() or (response.css("title::text").get() or "").strip()
        p1, currency, pvu = price_from_jsonld(objs)
        price = p1 or extract_price_from_scripts(response.text) or parse_price_text(" ".join(response.css("[class*='price'], .price ::text").getall())) or parse_price_text(txt)
        if not price or price < 99: return
        nights = parse_nights(txt)
        sale_end = pvu or parse_sale_end(txt)
        yield build_item("helloworld", response.url, title, price, currency, nights, sale_end, txt)
