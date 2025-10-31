
import scrapy
from tscraper.utils import (parse_jsonld, price_from_jsonld, title_from_jsonld,
    parse_price_text, parse_nights, parse_sale_end, build_item,
    filter_links, page_has_price_signal)

BASE = "https://www.houseoftravel.co.nz"
ALLOW = [r"^/hot-deals/[a-z0-9-]+/?$", r"^/holidays/(?!destinations/)[a-z0-9-]+/[a-z0-9-]+/?$", r"^/deals?/[a-z0-9-]+/?$"]
DENY = [r"^/holidays/?$", r"^/cruises/?$", r"^/deals/?$", r"/deals/(school|family|finance|terms|contact|about)[-/]?", r"\?.*\bq="]

class HouseoftravelSpider(scrapy.Spider):
    name = "houseoftravel"
    allowed_domains = ["houseoftravel.co.nz"]
    start_urls = [f"{BASE}/deals", f"{BASE}/holidays", f"{BASE}/cruises"]
    custom_settings = {"DOWNLOAD_DELAY": 1.0}

    def parse(self, response):
        hrefs = response.xpath("//a/@href").getall()
        for url in filter_links(response.url, hrefs, ALLOW, DENY):
            yield scrapy.Request(url, callback=self.parse_detail, dont_filter=True)
        for nxt in response.css("a[rel='next']::attr(href), a.pagination__link::attr(href)").getall():
            yield response.follow(nxt, callback=self.parse)

    def parse_detail(self, response):
        txt = " ".join(response.xpath("//body//text()").getall())
        if not (page_has_price_signal(response.text) or (parse_price_text(txt) and parse_price_text(txt) >= 99)):
            return
        objs = parse_jsonld(response.text)
        title = title_from_jsonld(objs) or (response.css("h1::text").get() or "").strip() or (response.css("title::text").get() or "").strip()
        price, currency, pvu = price_from_jsonld(objs)
        if not price: price = parse_price_text(txt)
        nights = parse_nights(txt)
        sale_end = pvu or parse_sale_end(txt)
        yield build_item("houseoftravel", response.url, title, price, currency, nights, sale_end, txt)
