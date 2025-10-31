
import re
import scrapy
from tscraper.utils import (parse_jsonld, price_from_jsonld, title_from_jsonld,
    parse_price_text, parse_nights, parse_sale_end, build_item,
    filter_links, page_has_price_signal)

BASE = "https://www.flightcentre.co.nz"
ALLOW = [r"^/product/\d{6,}$",
         r"^/holidays/(?!types/|destinations/|inspiration/)[a-z0-9-]+/[a-z0-9-]+(?:-NZ\d{3,})?$",
         r"^/deals?/[a-z0-9-]+(?:-NZ\d{3,})?$"]
DENY = [r"/holidays/types/", r"/holidays/destinations/", r"/holidays/?$",
        r"/accommodation/search", r"/cruises/?$", r"\?.*\b(page|q|sort|destinations)="]

class FlightcentreSpider(scrapy.Spider):
    name = "flightcentre"
    allowed_domains = ["flightcentre.co.nz"]
    start_urls = [f"{BASE}/holidays", f"{BASE}/deals", f"{BASE}/product/21747107"]
    custom_settings = {"DOWNLOAD_DELAY": 1.0}

    def start_requests(self):
        for url in self.start_urls:
            meta = {}
            if any(x in url for x in ("/holidays","/deals")):
                meta = {"playwright": True, "playwright_page_methods": [("wait_for_timeout", 1200)]}
            yield scrapy.Request(url, callback=self.parse, meta=meta, dont_filter=True)

    def parse(self, response):
        hrefs = response.xpath("//a/@href").getall()
        for url in filter_links(response.url, hrefs, ALLOW, DENY):
            yield scrapy.Request(url, callback=self.parse_detail, dont_filter=True)
        for nxt in response.css("a[rel='next']::attr(href), a.pagination__link::attr(href)").getall():
            yield scrapy.Request(response.urljoin(nxt), callback=self.parse,
                                 meta={"playwright": True, "playwright_page_methods": [("wait_for_timeout", 1000)]})

    def parse_detail(self, response):
        if not (re.search(r"-NZ\d{4,}$", response.url) or re.search(r"/product/\d{6,}$", response.url)):
            if not page_has_price_signal(response.text):
                return
        txt = " ".join(response.xpath("//body//text()").getall())
        objs = parse_jsonld(response.text)
        title = title_from_jsonld(objs) or (response.css("h1::text").get() or "").strip() or (response.css("title::text").get() or "").strip()
        price, currency, pvu = price_from_jsonld(objs)
        if not price: price = parse_price_text(txt)
        nights = parse_nights(txt)
        sale_end = pvu or parse_sale_end(txt)
        yield build_item("flightcentre", response.url, title, price, currency, nights, sale_end, txt)
